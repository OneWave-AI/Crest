import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { request } from 'https'
import { randomUUID, X509Certificate } from 'crypto'
import { MobileBridge, isPrivateAddress } from './mobileBridge'
import { LocalCoding } from './localCoding'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'crest-mobile-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const coding = new LocalCoding(join(dir, 'jobs'), undefined, async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ summary: 'Local answer', files: [] }) } })))
  await coding.initialize()
  const bridge = new MobileBridge(dir, coding, async () => ({ running: true, models: [] }), 0)
  await bridge.initialize(); await bridge.setEnabled(true)
  cleanup.push(() => bridge.stop())
  const ca = await readFile(join(dir, 'mobile-cert.pem'))
  expect(new X509Certificate(ca).keyUsage).toContain('1.3.6.1.5.5.7.3.1')
  const port = Number(new URL(bridge.status().url).port)
  const call = async (path: string, token?: string, data?: unknown, headers: Record<string, string> = {}) => new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, ca, servername: 'localhost', method: data ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()) }))
    }); req.on('error', reject); if (data) req.write(JSON.stringify(data)); req.end()
  })
  const pair = async () => {
    const pairing = new URL((await bridge.createPairing()).url)
    const code = pairing.searchParams.get('code')!
    const result = await call('/pair', undefined, { code, name: 'Test iPhone' })
    expect(result.status).toBe(201)
    return { ...result.data, code }
  }
  return { dir, coding, bridge, call, pair }
}
describe('phone HTTPS bridge', () => {
  it('pairs once over verified TLS, stores only token hashes, and revokes access', async () => {
    const { bridge, call, pair, dir } = await fixture()
    const phone = await pair()
    expect((await call('/v1/projects', phone.token)).status).toBe(200)
    expect((await call('/v1/projects', phone.token, undefined, { Host: new URL(bridge.status().url).host.toLowerCase() })).status).toBe(200)
    expect((await call('/pair', undefined, { code: phone.code, name: 'Replay' })).status).toBe(401)
    expect((await readFile(join(dir, 'mobile.json'), 'utf8'))).not.toContain(phone.token)
    await bridge.revoke(phone.deviceId)
    expect((await call('/v1/projects', phone.token)).status).toBe(401)
  })
  it('isolates phone tasks and rejects unapproved projects, sensitive paths, browser origins and local MCP access', async () => {
    const { bridge, call, pair } = await fixture()
    const phone = await pair(), project = bridge.status().projects[0]
    await writeFile(join(project.path, 'hello.py'), 'print("hello")')
    await writeFile(join(project.path, '.env'), 'secret')
    const files = await call(`/v1/projects/${project.id}/files`, phone.token)
    expect(files.data.files).toEqual(['hello.py'])
    expect((await call('/v1/projects', phone.token, undefined, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/mcp', phone.token)).status).toBe(404)
    const input = { projectId: randomUUID(), prompt: 'Review', requestKey: randomUUID() }
    expect((await call('/v1/tasks', phone.token, input)).status).toBe(403)
    expect((await call('/v1/tasks', phone.token, { ...input, projectId: project.id, files: ['../outside'] })).status).toBe(422)
    const job = await call('/v1/tasks', phone.token, { ...input, projectId: project.id })
    expect(job.status).toBe(202)
    const other = await pair()
    expect((await call(`/v1/tasks/${job.data.id}`, other.token)).status).toBe(404)
    expect((await call(`/v1/tasks/${job.data.id}`, phone.token)).status).toBe(200)
  })
  it('does not accept public source addresses', () => {
    expect(isPrivateAddress('10.0.0.2')).toBe(true)
    expect(isPrivateAddress('::ffff:192.168.1.5')).toBe(true)
    expect(isPrivateAddress('100.101.2.3')).toBe(true)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
  })
})
