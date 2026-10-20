import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from '@modelcontextprotocol/client'
import { startLocalApi } from './localApi'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'crest-api-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const api = await startLocalApi({ configDir: dir, version: 'test', port: 0, getModels: async () => ({ running: true, models: [{ name: 'qwen-test' }] }) })
  cleanup.push(api.stop)
  const token = (await readFile(api.info.tokenPath, 'utf8')).trim()
  return { ...api, token, headers: { Authorization: `Bearer ${token}` } }
}
describe('Crest local API and MCP', () => {
  it('requires auth, rejects browser origins, and protects token permissions', async () => {
    const api = await fixture()
    expect((await fetch(api.info.url + '/v1/status')).status).toBe(401)
    expect((await fetch(api.info.url + '/v1/status', { headers: { ...api.headers, Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await stat(api.info.tokenPath)).mode & 0o777).toBe(0o600)
    const response = await fetch(api.info.url + '/v1/status', { headers: api.headers })
    expect(await response.json()).toMatchObject({ app: 'Crest', localOnly: true })
    expect((await fetch(api.info.url + '/v1/tasks', { method: 'POST', headers: { ...api.headers, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(422)
  })
  it('supports an actual MCP handshake, tool discovery and invocation', async () => {
    const api = await fixture()
    const client = new Client({ name: 'crest-test', version: '1.0' })
    cleanup.push(() => client.close())
    await client.connect(new StreamableHTTPClientTransport(new URL(api.info.mcpUrl), { requestInit: { headers: api.headers } }))
    const list = await client.listTools()
    expect(list.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['crest_status', 'crest_models', 'crest_start_task', 'crest_task_status', 'crest_cancel_task']))
    const result = await client.callTool({ name: 'crest_models', arguments: {} })
    expect(JSON.stringify(result)).toContain('qwen-test')
    const error = await client.callTool({ name: 'crest_task_status', arguments: { id: '00000000-0000-4000-8000-000000000000' } })
    expect(error.isError).toBe(true)
  })
  it('negotiates the published 2026-07-28 protocol with the official v2 client', async () => {
    const api = await fixture()
    const client = new ModernClient({ name: 'modern-test', version: '1.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    cleanup.push(() => client.close())
    await client.connect(new ModernTransport(new URL(api.info.mcpUrl), { requestInit: { headers: api.headers } }))
    expect(client.getProtocolEra()).toBe('modern')
    expect((await client.listTools()).tools).toHaveLength(5)
    expect(JSON.stringify(await client.callTool({ name: 'crest_status', arguments: {} }))).toContain('Crest')
  })
  it('answers independent modern requests without initialization or a session', async () => {
    const api = await fixture()
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'stateless-test', version: '1.0' } }
    const post = (method: string, params: object, headers: Record<string, string> = {}, metaVersion = '2026-07-28') => fetch(api.info.mcpUrl, {
      method: 'POST', headers: { ...api.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': metaVersion } } })
    })
    const listed = await post('tools/list', {})
    expect(listed.status).toBe(200)
    expect(listed.headers.get('mcp-session-id')).toBeNull()
    const body = await listed.json()
    expect(body.result.resultType).toBe('complete')
    const called = await post('tools/call', { name: 'crest_status', arguments: {} }, { 'Mcp-Name': 'crest_status' })
    expect(called.status).toBe(200)
    expect(JSON.stringify(await called.json())).toContain('Crest')
    expect((await post('tools/list', {}, { 'Mcp-Method': 'tools/call' })).status).toBe(400)
    const unsupported = await post('tools/list', {}, { 'MCP-Protocol-Version': '2099-01-01' }, '2099-01-01')
    expect(unsupported.status).toBe(400)
    expect((await unsupported.json()).error.code).toBe(-32022)
    const unknown = await post('unknown/method', {})
    expect(unknown.status).toBe(404)
    expect((await unknown.json()).error.code).toBe(-32601)
    expect((await fetch(api.info.mcpUrl, { headers: api.headers })).status).toBe(405)
    expect((await fetch(api.info.mcpUrl, { method: 'DELETE', headers: api.headers })).status).toBe(405)
  })
  it('provides an OpenAPI contract and consistent REST errors', async () => {
    const api = await fixture()
    const spec = await (await fetch(api.info.url + '/openapi.json', { headers: api.headers })).json()
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.components.schemas.TaskInput.required).toContain('projectPath')
    const missing = await fetch(api.info.url + '/v1/tasks/00000000-0000-4000-8000-000000000000', { headers: api.headers })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toBe('application/problem+json')
    const problem = await missing.json()
    expect(problem.requestId).toBe(missing.headers.get('x-request-id'))
    expect((await fetch(api.info.url + '/v1/tasks', { method: 'POST', headers: api.headers, body: '{}' })).status).toBe(415)
    expect((await fetch(api.info.url + '/v1/tasks', { method: 'POST', headers: { ...api.headers, 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400)
  })
})
