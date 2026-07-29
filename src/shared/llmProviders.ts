import type { LLMProvider, SuperAgentConfig } from './types'

/**
 * The Super Agent's supervisor model is independent from the CLI/model running
 * inside the terminal. Keeping this list separate from CLI_PROVIDERS preserves
 * every combination: local->local, local->API, API->local, and API->API.
 */
export const SUPERVISOR_PROVIDERS: LLMProvider[] = ['ollama', 'groq', 'openai']

export function supervisorProviderLabel(provider: LLMProvider): string {
  switch (provider) {
    case 'ollama':
      return 'Ollama'
    case 'groq':
      return 'Groq'
    case 'openai':
      return 'OpenAI'
  }
}

export function supervisorProviderNeedsApiKey(provider: LLMProvider): boolean {
  return provider !== 'ollama'
}

export function getSupervisorApiKey(config: SuperAgentConfig, provider: LLMProvider): string {
  switch (provider) {
    case 'ollama':
      return ''
    case 'groq':
      return config.groqApiKey
    case 'openai':
      return config.openaiApiKey
  }
}

export function getSupervisorModel(config: SuperAgentConfig, provider: LLMProvider): string {
  switch (provider) {
    case 'ollama':
      return config.ollamaModel
    case 'groq':
      return config.groqModel
    case 'openai':
      return config.openaiModel
  }
}

export function supervisorProviderIsConfigured(
  config: SuperAgentConfig,
  provider: LLMProvider
): boolean {
  if (!getSupervisorModel(config, provider).trim()) return false
  return !supervisorProviderNeedsApiKey(provider) || Boolean(getSupervisorApiKey(config, provider).trim())
}
