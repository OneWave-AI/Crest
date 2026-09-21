import { ipcMain } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import * as fs from 'fs/promises'
import type {
  JevApiRequest,
  JevApiResponse,
  LLMApiRequest,
  LLMApiResponse,
  SuperAgentConfig,
  SuperAgentSession
} from '../../shared/types'
import { OLLAMA_HOST } from './ollama'

const SUPER_AGENT_CONFIG_PATH = join(homedir(), '.crest', 'superagent-config.json')
const SUPER_AGENT_HISTORY_PATH = join(homedir(), '.crest', 'superagent-history.json')

const DEFAULT_CONFIG: SuperAgentConfig = {
  ollamaModel: 'qwen3-coder:30b',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  defaultProvider: 'groq',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe',
  typesafeApiKey: '',
  jevModel: 'jev-latest',
  jevEnabled: false,
  jevMinConfidence: 0.7
}

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
// The supervisor calls this on every idle tick, so a slow call is worse than no
// call -- Jev's own p99 is well under a second and the LLM path is the fallback.
const JEV_TIMEOUT_MS = 5_000
const JEV_MAX_ATTEMPTS = 3

async function ensureConfigDir(): Promise<void> {
  const configDir = join(homedir(), '.crest')
  try {
    await fs.mkdir(configDir, { recursive: true })
  } catch {
    // Directory exists
  }
}

async function loadConfig(): Promise<SuperAgentConfig> {
  try {
    const data = await fs.readFile(SUPER_AGENT_CONFIG_PATH, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
  } catch {
    return DEFAULT_CONFIG
  }
}

async function saveConfig(config: Partial<SuperAgentConfig>): Promise<void> {
  await ensureConfigDir()
  const existing = await loadConfig()
  const merged = { ...existing, ...config }
  // This file holds Groq, OpenAI and TypeSafe keys -- default 0644 leaves them
  // readable by every account on the machine.
  await fs.writeFile(SUPER_AGENT_CONFIG_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 })
  await fs.chmod(SUPER_AGENT_CONFIG_PATH, 0o600).catch(() => {})
}

// Session history functions
async function loadSessionHistory(): Promise<SuperAgentSession[]> {
  try {
    const data = await fs.readFile(SUPER_AGENT_HISTORY_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveSessionHistory(sessions: SuperAgentSession[]): Promise<void> {
  await ensureConfigDir()
  // Keep only last 100 sessions
  const trimmed = sessions.slice(-100)
  await fs.writeFile(SUPER_AGENT_HISTORY_PATH, JSON.stringify(trimmed, null, 2))
}

export function registerSuperAgentHandlers(): void {
  // Call the independent supervisor LLM (local Ollama, Groq, or OpenAI).
  ipcMain.handle('call-llm-api', async (_, request: LLMApiRequest): Promise<LLMApiResponse> => {
    const { provider, apiKey, model, systemPrompt, userPrompt, temperature = 0.3 } = request

    if (provider !== 'ollama' && !apiKey) {
      return { success: false, error: 'API key is required' }
    }

    const baseUrl =
      provider === 'ollama'
        ? `${OLLAMA_HOST}/v1/chat/completions`
        : provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions'

    try {
      // A local 30B model can take longer on its first load than a hosted API.
      const timeoutMs = provider === 'ollama' ? 120_000 : 15_000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          ...(provider === 'ollama' ? {} : { Authorization: `Bearer ${apiKey}` }),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: 400
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.error?.message || `API error: ${response.status}`
        }
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content?.trim() || ''

      return {
        success: true,
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens
            }
          : undefined
      }
    } catch (error) {
      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timed out after ${provider === 'ollama' ? 120 : 15} seconds`
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Jev: one typed decision, no text. Separate from call-llm-api because the
  // request and response shapes have nothing in common with chat completions.
  ipcMain.handle('call-jev-api', async (_, request: JevApiRequest): Promise<JevApiResponse> => {
    const { apiKey, model, state, questions } = request

    if (!apiKey) return { success: false, error: 'TypeSafe API key is required' }
    if (!questions || Object.keys(questions).length === 0) {
      return { success: false, error: 'At least one question is required' }
    }

    const started = Date.now()

    for (let attempt = 1; attempt <= JEV_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS)

      try {
        const response = await fetch(JEV_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ state, model: model || 'jev-latest', questions }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        // 429/529 are the documented backoff codes; everything else is terminal.
        if (response.status === 429 || response.status === 529) {
          if (attempt < JEV_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, attempt * 500))
            continue
          }
          return { success: false, error: `Jev rate limited (${response.status})` }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          return {
            success: false,
            error: errorData?.error?.message || `Jev API error: ${response.status}`
          }
        }

        const data = await response.json()
        return {
          success: true,
          model: data.model,
          answers: data.answers,
          latencyMs: Date.now() - started,
          usage: data.usage
            ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
            : undefined
        }
      } catch (error) {
        clearTimeout(timeoutId)
        const aborted = error instanceof Error && error.name === 'AbortError'
        if (attempt < JEV_MAX_ATTEMPTS && !aborted) {
          await new Promise((r) => setTimeout(r, attempt * 500))
          continue
        }
        return {
          success: false,
          error: aborted
            ? `Jev request timed out after ${JEV_TIMEOUT_MS / 1000}s`
            : error instanceof Error
              ? error.message
              : 'Unknown error'
        }
      }
    }

    return { success: false, error: 'Jev request failed' }
  })

  // Load Super Agent config
  ipcMain.handle('load-superagent-config', async (): Promise<SuperAgentConfig> => {
    return loadConfig()
  })

  // Save Super Agent config
  ipcMain.handle(
    'save-superagent-config',
    async (_, config: Partial<SuperAgentConfig>): Promise<{ success: boolean }> => {
      try {
        await saveConfig(config)
        return { success: true }
      } catch (error) {
        console.error('Failed to save super agent config:', error)
        return { success: false }
      }
    }
  )

  // Save Super Agent session to history
  ipcMain.handle(
    'save-superagent-session',
    async (_, session: SuperAgentSession): Promise<{ success: boolean }> => {
      try {
        const sessions = await loadSessionHistory()
        sessions.push(session)
        await saveSessionHistory(sessions)
        return { success: true }
      } catch (error) {
        console.error('Failed to save super agent session:', error)
        return { success: false }
      }
    }
  )

  // List all Super Agent sessions
  ipcMain.handle('list-superagent-sessions', async (): Promise<SuperAgentSession[]> => {
    return loadSessionHistory()
  })

  // Delete a Super Agent session
  ipcMain.handle(
    'delete-superagent-session',
    async (_, sessionId: string): Promise<{ success: boolean }> => {
      try {
        const sessions = await loadSessionHistory()
        const filtered = sessions.filter(s => s.id !== sessionId)
        await saveSessionHistory(filtered)
        return { success: true }
      } catch (error) {
        console.error('Failed to delete super agent session:', error)
        return { success: false }
      }
    }
  )
}
