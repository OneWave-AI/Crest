import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { readFile, writeFile, mkdir, chmod } from 'fs/promises'
import { join } from 'path'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { LocalCoding, codingInput } from './localCoding'
import { IntegrationError } from './integrationErrors'
import { integrationOpenApi } from './integrationOpenApi'
import type { MobileBridge } from './mobileBridge'

export interface IntegrationInfo {
  running: boolean
  url: string
  mcpUrl: string
  tokenPath: string
  error?: string
}
interface Options {
  configDir: string
  version: string
  getModels: () => Promise<unknown>
  port?: number
  coding?: LocalCoding
  mobile?: () => MobileBridge | undefined
}
function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
async function jsonBody(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256000) throw new IntegrationError(413, 'body_too_large', 'Request body exceeds 256 KB')
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw new IntegrationError(400, 'invalid_json', 'Request body must contain valid JSON')
  }
}

/** Authenticated loopback API, shared by HTTP callers and MCP clients. */
export async function startLocalApi(options: Options): Promise<{
  info: IntegrationInfo
  coding: LocalCoding
  stop: () => Promise<void>
}> {
  const tokenPath = join(options.configDir, 'api-token')
  await mkdir(options.configDir, { recursive: true, mode: 0o700 })
  let token: string
  try { token = (await readFile(tokenPath, 'utf8')).trim() } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    token = randomBytes(32).toString('hex')
    await writeFile(tokenPath, token + '\n', { mode: 0o600, flag: 'wx' })
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid API token file')
  await chmod(tokenPath, 0o600)
  const coding = options.coding ?? new LocalCoding(join(options.configDir, 'task-backups'))
  await coding.initialize()
  let server: Server
  let stopping = false
  const info: IntegrationInfo = { running: false, url: '', mcpUrl: '', tokenPath }
  const status = () => ({ app: 'Crest', version: options.version, localOnly: true, tasks: coding.list() })

  function mcpServer(): McpServer {
    const mcp = new McpServer({ name: 'crest', version: options.version }, {
      instructions: 'Crest runs coding work on the user laptop through Ollama, without a cloud-model fallback. Use crest_models to check installed models. Delegate small tasks with explicit projectPath and files to crest_start_task, then poll crest_task_status. Edit mode writes the named files and keeps backups. Review mode is read-only. Review diffs and run tests yourself; Crest does not execute shell commands. Only delegate work the user has authorized.'
    })
    const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })
    const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    mcp.registerTool('crest_status', { description: 'Get Crest version and local coding task status.', annotations: readOnly }, async () => result(status()))
    mcp.registerTool('crest_models', { description: 'List installed local Ollama models and availability.', annotations: readOnly }, async () => result(await options.getModels()))
    mcp.registerTool('crest_start_task', {
      description: 'Delegate a small coding, generation, or review task to local Qwen. Returns a job ID immediately. Explicit files are the entire read/write scope. Review is default; edit writes those files with original-content backups. No commands or tests are executed. Poll crest_task_status for the result.',
      inputSchema: codingInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async (input) => result(await coding.start(input)))
    mcp.registerTool('crest_task_status', {
      description: 'Poll a Crest job for completion, summary, changed files, errors and original-content backup path.',
      inputSchema: z.object({ id: z.string().uuid() }), annotations: readOnly
    }, async ({ id }) => result(coding.get(id)))
    mcp.registerTool('crest_cancel_task', {
      description: 'Cancel a running local task. Files already written remain listed in changedFiles; originals are backed up.',
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ id }) => result(coding.cancel(id)))
    return mcp
  }

  // The v2 SDK owns 2026-07-28 discovery, per-request metadata/header checks,
  // resultType, version errors and a stateless 2025 compatibility path.
  const mcpHandler = createMcpHandler(mcpServer, { legacy: 'stateless', maxRequestBodySize: 256000 })
  const handleMcp = toNodeHandler(mcpHandler, { maxRequestBodySize: 256000 })
  server = createServer(async (req, res) => {
    const requestId = randomUUID()
    res.setHeader('X-Request-Id', requestId)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const problem = (status: number, code: string, detail: string) => {
      res.writeHead(status, { 'Content-Type': 'application/problem+json' })
      res.end(JSON.stringify({ type: 'about:blank', title: code, status, detail, code, requestId }))
    }
    try {
      // No browser origins, redirects or wildcard CORS. Host checks prevent DNS rebinding.
      if (stopping) return problem(503, 'shutting_down', 'Crest is shutting down')
      if (req.headers.origin || req.headers.host !== new URL(info.url).host) return problem(403, 'local_access_only', 'Local API access only')
      const expected = Buffer.from(`Bearer ${token}`)
      const actual = Buffer.from(req.headers.authorization ?? '')
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="Crest"')
        return problem(401, 'unauthorized', 'Bearer token required')
      }
      const path = new URL(req.url ?? '/', info.url).pathname
      if (path === '/mcp') {
        await handleMcp(req, res)
        return
      }
      if (req.method === 'GET' && path === '/v1/status') return send(res, 200, status())
      if (req.method === 'GET' && path === '/openapi.json') return send(res, 200, integrationOpenApi(options.version, info.url))
      if (req.method === 'GET' && path === '/v1/models') return send(res, 200, await options.getModels())
      if (req.method === 'GET' && path === '/v1/tasks') return send(res, 200, coding.list())
      // Phone administration stays behind the laptop-only API credential.
      if (path.startsWith('/v1/mobile/')) {
        const mobile = options.mobile?.()
        if (!mobile) return problem(503, 'mobile_unavailable', 'The phone bridge is not ready')
        if (req.method === 'GET' && path === '/v1/mobile/status') return send(res, 200, mobile.status())
        if (req.method === 'POST' && path === '/v1/mobile/enable') {
          const input = z.object({ enabled: z.boolean() }).strict().parse(await jsonBody(req))
          return send(res, 200, await mobile.setEnabled(input.enabled))
        }
        if (req.method === 'POST' && path === '/v1/mobile/pair') return send(res, 201, await mobile.createPairing())
        if (req.method === 'POST' && path === '/v1/mobile/projects') {
          const input = z.object({ path: z.string().min(1) }).strict().parse(await jsonBody(req))
          return send(res, 200, await mobile.addProject(input.path))
        }
        return problem(404, 'not_found', 'Unknown phone administration endpoint')
      }
      if (req.method === 'POST' && path === '/v1/tasks') {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return problem(415, 'unsupported_media_type', 'Use Content-Type: application/json')
        const input = codingInput.parse(await jsonBody(req))
        const key = req.headers['idempotency-key']
        if (key !== undefined) {
          if (typeof key !== 'string' || !key.length || key.length > 128 || (input.requestKey && input.requestKey !== key)) return problem(422, 'invalid_idempotency_key', 'Idempotency-Key must match requestKey when both are supplied')
          input.requestKey = key
        }
        const task = await coding.start(input)
        res.setHeader('Location', `/v1/tasks/${task.id}`)
        return send(res, 202, task)
      }
      const match = path.match(/^\/v1\/tasks\/([a-f0-9-]{36})$/)
      if (match && req.method === 'GET') return send(res, 200, coding.get(match[1]))
      if (match && req.method === 'DELETE') return send(res, 200, coding.cancel(match[1]))
      if (['/v1/status', '/v1/models', '/v1/tasks', '/openapi.json'].includes(path) || match) {
        res.setHeader('Allow', path === '/v1/tasks' ? 'GET, POST' : match ? 'GET, DELETE' : 'GET')
        return problem(405, 'method_not_allowed', 'Method not allowed for this endpoint')
      }
      problem(404, 'not_found', 'Unknown endpoint')
    } catch (error) {
      if (!res.headersSent) {
        const status = error instanceof IntegrationError ? error.status : 422
        problem(status, error instanceof IntegrationError ? error.code : 'invalid_task', error instanceof Error ? error.message : String(error))
      }
      else res.end()
    }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 10000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 19431, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('API did not bind a TCP port')
  info.url = `http://127.0.0.1:${address.port}`
  info.mcpUrl = info.url + '/mcp'
  info.running = true
  try {
    await writeFile(join(options.configDir, 'api-connection.json'), JSON.stringify({ ...info, pid: process.pid }, null, 2), { mode: 0o600 })
  } catch (error) { server.close(); throw error }
  return {
    info,
    coding,
    stop: async () => {
      stopping = true
      info.running = false
      coding.stop()
      await mcpHandler.close()
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    }
  }
}
