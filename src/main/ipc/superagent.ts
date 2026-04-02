import { ipcMain } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import * as fs from 'fs/promises'
import type { LLMApiRequest, LLMApiResponse, SuperAgentConfig, SuperAgentSession } from '../../shared/types'

const SUPER_AGENT_CONFIG_PATH = join(homedir(), '.crest', 'superagent-config.json')
const SUPER_AGENT_HISTORY_PATH = join(homedir(), '.crest', 'superagent-history.json')

const DEFAULT_CONFIG: SuperAgentConfig = {
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  defaultProvider: 'groq',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe'
}

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
  await fs.writeFile(SUPER_AGENT_CONFIG_PATH, JSON.stringify(merged, null, 2))
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
  // Call LLM API (Groq or OpenAI)
  ipcMain.handle('call-llm-api', async (_, request: LLMApiRequest): Promise<LLMApiResponse> => {
    const { provider, apiKey, model, systemPrompt, userPrompt, temperature = 0.3 } = request

    if (!apiKey) {
      return { success: false, error: 'API key is required' }
    }

    const baseUrl =
      provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions'

    try {
      // Add 15-second timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
          error: 'Request timed out after 15 seconds'
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
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
