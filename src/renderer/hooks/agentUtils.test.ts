import { describe, it, expect, vi, beforeEach } from 'vitest'
import { askJev, jevIsConfigured, NEEDS_HUMAN_THRESHOLD } from './agentUtils'
import type { SuperAgentConfig, JevApiResponse } from '../../shared/types'

const config = (over: Partial<SuperAgentConfig> = {}): SuperAgentConfig => ({
  ollamaModel: 'qwen3-coder:30b',
  groqApiKey: '',
  groqModel: '',
  openaiApiKey: '',
  openaiModel: '',
  defaultProvider: 'ollama',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe',
  typesafeApiKey: 'apikey_test',
  jevModel: 'jev-latest',
  jevEnabled: true,
  jevMinConfidence: 0.7,
  ...over
})

const answer = (action: string, confidence: number, human: number): JevApiResponse => ({
  success: true,
  model: 'jev-1.13.0',
  answers: {
    action: { type: 'choice', choice: action, confidence },
    needs_human: { type: 'noul', noul: human }
  },
  latencyMs: 400
})

let callJevApi: ReturnType<typeof vi.fn>

beforeEach(() => {
  callJevApi = vi.fn()
  // @ts-expect-error -- minimal stub of the preload bridge
  globalThis.window = { api: { callJevApi } }
})

describe('jevIsConfigured', () => {
  it('is false without a key, even when enabled', () => {
    expect(jevIsConfigured(config({ typesafeApiKey: '' }))).toBe(false)
    expect(jevIsConfigured(config({ typesafeApiKey: '   ' }))).toBe(false)
  })

  it('is false when disabled, even with a key', () => {
    expect(jevIsConfigured(config({ jevEnabled: false }))).toBe(false)
  })

  it('tolerates null and undefined', () => {
    expect(jevIsConfigured(null)).toBe(false)
    expect(jevIsConfigured(undefined)).toBe(false)
  })
})

describe('askJev', () => {
  it('sends the assigned task, not just terminal output', async () => {
    // Every criterion is task-relative; "done" means the ASSIGNED task is
    // finished. Sending output alone asks a different question.
    callJevApi.mockResolvedValue(answer('wait', 1, 0.01))
    await askJev(config(), 'npm run build', 'add tests AND wire the CI job')

    const { state } = callJevApi.mock.calls[0][0]
    expect(state).toContain('add tests AND wire the CI job')
    expect(state).toContain('npm run build')
  })

  it('records a missing task rather than sending an empty section', async () => {
    callJevApi.mockResolvedValue(answer('wait', 1, 0.01))
    await askJev(config(), 'output', '')
    expect(callJevApi.mock.calls[0][0].state).toContain('(no task recorded)')
  })

  it('gates on needs_human BEFORE applying the action confidence floor', async () => {
    // The regression this exists for: a force-push confirmation is exactly the
    // case where the ACTION is ambiguous. Checking the floor first returned
    // `fallback`, and the fallback hands the prompt to an LLM to answer --
    // disarming the gate precisely when it is needed.
    callJevApi.mockResolvedValue(answer('send', 0.62, 0.98))
    const d = await askJev(config({ jevMinConfidence: 0.7 }), 'Force-push to main? (y/N)', 'refactor')

    expect(d.kind).toBe('needs-human')
    if (d.kind === 'needs-human') expect(d.score).toBe(0.98)
  })

  it('gates at the threshold boundary', async () => {
    callJevApi.mockResolvedValue(answer('send', 1, NEEDS_HUMAN_THRESHOLD))
    expect((await askJev(config(), 'o', 't')).kind).toBe('needs-human')
  })

  it('does not gate just below the threshold', async () => {
    callJevApi.mockResolvedValue(answer('send', 1, NEEDS_HUMAN_THRESHOLD - 0.01))
    expect((await askJev(config(), 'o', 't')).kind).toBe('action')
  })

  it('falls back when the action is below the confidence floor', async () => {
    callJevApi.mockResolvedValue(answer('done', 0.55, 0.02))
    const d = await askJev(config({ jevMinConfidence: 0.7 }), 'o', 't')
    expect(d.kind).toBe('fallback')
  })

  it('falls back when the API reports failure', async () => {
    callJevApi.mockResolvedValue({ success: false, error: 'HTTP 500' })
    const d = await askJev(config(), 'o', 't')
    expect(d.kind).toBe('fallback')
    if (d.kind === 'fallback') expect(d.reason).toBe('HTTP 500')
  })

  it('falls back when the payload has no action', async () => {
    callJevApi.mockResolvedValue({ success: true, answers: {} })
    expect((await askJev(config(), 'o', 't')).kind).toBe('fallback')
  })

  it('never throws when the IPC bridge rejects', async () => {
    // ipcRenderer.invoke rejects on preload/main version skew. The supervisor
    // loop has no catch, so an escape here kills it silently on an idle
    // terminal that produces no further output to restart it.
    callJevApi.mockRejectedValue(new Error('No handler registered'))
    const d = await askJev(config(), 'o', 't')
    expect(d.kind).toBe('fallback')
    if (d.kind === 'fallback') expect(d.reason).toBe('No handler registered')
  })

  it.each(['wait', 'send', 'done'])('passes through a confident %s', async (action) => {
    callJevApi.mockResolvedValue(answer(action, 0.95, 0.02))
    const d = await askJev(config(), 'o', 't')
    expect(d.kind).toBe('action')
    if (d.kind === 'action') expect(d.action).toBe(action)
  })
})
