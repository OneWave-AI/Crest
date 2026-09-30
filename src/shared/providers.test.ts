import { describe, expect, it } from 'vitest'
import { resolveLaunchCommand, supportsLocalRuntime } from './providers'

describe('resolveLaunchCommand', () => {
  it('uses the plain binary for the cloud runtime', () => {
    expect(resolveLaunchCommand('claude', 'api', 'qwen3-coder:30b')).toBe('claude')
  })

  it('runs the launcher Crest installed, not a shell function', () => {
    expect(resolveLaunchCommand('claude', 'local', 'qwen3-coder:30b')).toBe(
      `CREST_LOCAL_MODEL='qwen3-coder:30b' "$HOME/.crest/bin/claude-local"`
    )
  })

  it('quotes the model so it cannot inject shell', () => {
    expect(resolveLaunchCommand('qwen', 'local', "x'; rm -rf ~; '")).toBe(
      `CREST_LOCAL_MODEL='x'\\''; rm -rf ~; '\\''' "$HOME/.crest/bin/qwen-local"`
    )
  })

  it('falls back to the cloud binary for agents with no local option', () => {
    expect(supportsLocalRuntime('gemini')).toBe(false)
    expect(resolveLaunchCommand('gemini', 'local', 'qwen3-coder:30b')).toBe('gemini')
  })
})
