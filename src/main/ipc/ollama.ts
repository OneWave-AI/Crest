/**
 * IPC surface for the local ollama runtime.
 *
 * Crest never proxies inference -- the agent CLIs talk to ollama directly. All
 * we need in the main process is enough to render an honest picker: is the
 * daemon up, and which models can actually be used for chat.
 */

import { ipcMain } from 'electron'

export const OLLAMA_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') || 'http://127.0.0.1:11434'
/**
 * 1500ms was too tight: a daemon that is mid-load (or paging a 20GB model back
 * in after a keep-alive expiry) can take several seconds to answer /api/tags,
 * and the old timeout reported a perfectly healthy ollama as "not running".
 */
const PROBE_TIMEOUT_MS = 6000
/** One retry, because the common failure was a single slow first response. */
const PROBE_RETRIES = 1
const RETRY_DELAY_MS = 400

export interface OllamaModel {
  name: string
  /** Parameter count as reported by ollama, e.g. "30.5B". */
  parameters?: string
  /** Bytes on disk. */
  size?: number
  /** Embedding-only models cannot drive an agent, so the UI hides them. */
  embeddingOnly: boolean
}

export interface OllamaStatus {
  running: boolean
  host: string
  models: OllamaModel[]
  error?: string
}

/** Embedding models have no chat capability; running an agent on one just hangs. */
function isEmbeddingModel(name: string, families: string[]): boolean {
  return /embed/i.test(name) || families.some((f) => /embed/i.test(f))
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function probeTags(): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= PROBE_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`)
    } catch (error) {
      lastError = error
      if (attempt < PROBE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  }
  throw lastError
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await probeTags()
    if (!res.ok) {
      return { running: false, host: OLLAMA_HOST, models: [], error: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as {
      models?: { name: string; size?: number; details?: { parameter_size?: string; families?: string[] } }[]
    }
    const models: OllamaModel[] = (body.models ?? []).map((m) => ({
      name: m.name,
      parameters: m.details?.parameter_size,
      size: m.size,
      embeddingOnly: isEmbeddingModel(m.name, m.details?.families ?? [])
    }))
    return { running: true, host: OLLAMA_HOST, models }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      running: false,
      host: OLLAMA_HOST,
      models: [],
      // AbortError just means nothing is listening; say so in plain language.
      error: /abort/i.test(message) ? 'ollama did not respond' : message
    }
  }
}

export function registerOllamaHandlers(): void {
  ipcMain.handle('ollama:status', () => getOllamaStatus())
}
