import { createServer, type Server } from 'https'
import { X509Certificate, createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { chmod, mkdir, readFile, writeFile, rename, realpath, readdir, lstat } from 'fs/promises'
import { basename, join } from 'path'
import { hostname, networkInterfaces, homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { IncomingMessage, ServerResponse } from 'http'
import QRCode from 'qrcode'
import { z } from 'zod'
import { LocalCoding, codingFile, readSource } from './localCoding'
import { IntegrationError } from './integrationErrors'
import type { MobileStatus, MobileProject, MobilePairing } from '../../shared/mobile'

const execFileAsync = promisify(execFile)
const deviceSchema = z.object({ id: z.string().uuid(), name: z.string().max(80), createdAt: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) })
const configSchema = z.object({ enabled: z.boolean(), projects: z.array(z.object({ id: z.string().uuid(), name: z.string(), path: z.string() })), devices: z.array(deviceSchema) })
type Config = z.infer<typeof configSchema>
const taskInput = z.object({
  projectId: z.string().uuid(), prompt: z.string().min(1).max(24000),
  files: z.array(z.string().min(1)).max(20).default([]), mode: z.enum(['review', 'edit']).default('review'),
  model: z.string().regex(/^[a-zA-Z0-9._:/@-]+$/).default('qwen3.5:4b'), requestKey: z.string().uuid(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }).strict()).max(8).optional()
}).strict()
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/, '')
  if (ip === '::1') return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return parts[0] === 127 || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new IntegrationError(415, 'media_type', 'Use application/json')
  let size = 0; const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 128000) throw new IntegrationError(413, 'body_limit', 'Request exceeds 128 KB')
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new IntegrationError(400, 'invalid_json', 'Invalid JSON') }
}

/** A separately paired, TLS-only phone API. Never exposes local MCP credentials. */
export class MobileBridge {
  private config: Config = { enabled: false, projects: [], devices: [] }
  private server?: Server
  private url = ''
  private error?: string
  private fingerprint = ''
  private pairing?: { hash: string; expires: number }
  private attempts = new Map<string, { count: number; until: number }>()
  private saveQueue = Promise.resolve()
  constructor(private configDir: string, private coding: LocalCoding, private getModels: () => Promise<unknown>, private port = 19432) {}

  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.config, null, 2)
    this.saveQueue = this.saveQueue.catch(() => {}).then(async () => {
      const path = join(this.configDir, 'mobile.json')
      await writeFile(path + '.tmp', snapshot, { mode: 0o600 })
      await rename(path + '.tmp', path)
    })
    return this.saveQueue
  }
  async initialize(): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 })
    try { this.config = configSchema.parse(JSON.parse(await readFile(join(this.configDir, 'mobile.json'), 'utf8'))) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!this.config.projects.length) {
      const path = join(this.configDir, 'mobile-workspace')
      await mkdir(path, { recursive: true })
      this.config.projects.push({ id: randomUUID(), name: 'Scratchpad', path: await realpath(path) })
      await this.save()
    }
    if (this.config.enabled) await this.start()
  }
  status(): MobileStatus {
    return { enabled: this.config.enabled, running: !!this.server, url: this.url, projects: this.config.projects,
      devices: this.config.devices.map(({ id, name, createdAt }) => ({ id, name, createdAt })), error: this.error }
  }
  async setEnabled(enabled: boolean): Promise<MobileStatus> {
    if (!enabled) { await this.stop(); this.pairing = undefined }
    else if (!this.server) await this.start()
    this.config.enabled = enabled
    await this.save()
    return this.status()
  }
  async addProject(path: string): Promise<MobileStatus> {
    const root = await realpath(path)
    if (root === homedir() || root === '/' || !(await lstat(root)).isDirectory()) throw new Error('Choose a project folder')
    if (!this.config.projects.some(p => p.path === root)) this.config.projects.push({ id: randomUUID(), path: root, name: basename(root) })
    await this.save(); return this.status()
  }
  async removeProject(id: string): Promise<MobileStatus> {
    const project = this.config.projects.find(p => p.id === id)
    if (project) for (const task of this.coding.list()) {
      if (task.projectPath === project.path && task.requestKey?.startsWith('mobile:') && task.status === 'running') this.coding.cancel(task.id)
    }
    this.config.projects = this.config.projects.filter(p => p.id !== id)
    await this.save(); return this.status()
  }
  async revoke(id: string): Promise<MobileStatus> {
    this.config.devices = this.config.devices.filter(d => d.id !== id)
    for (const task of this.coding.list()) if (task.requestKey?.startsWith(`mobile:${id}:`) && task.status === 'running') this.coding.cancel(task.id)
    await this.save(); return this.status()
  }
  async createPairing(): Promise<MobilePairing> {
    if (!this.server) throw new Error('Enable iPhone access first')
    const code = randomBytes(24).toString('hex')
    const expires = Date.now() + 5 * 60000
    this.pairing = { hash: digest(code), expires }
    const params = new URLSearchParams({ url: this.url, code, fingerprint: this.fingerprint })
    const url = `crest://pair?${params}`
    return { url, qrDataURL: await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'M' }), expiresAt: new Date(expires).toISOString() }
  }
  async stop(): Promise<void> {
    const server = this.server; this.server = undefined
    if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    for (const task of this.coding.list()) if (task.status === 'running' && task.requestKey?.startsWith('mobile:')) this.coding.cancel(task.id)
  }

  private async start(): Promise<void> {
    const keyPath = join(this.configDir, 'mobile-key.pem'), certPath = join(this.configDir, 'mobile-cert.pem')
    const localHost = hostname().replace(/\.local$/, '').replace(/[^A-Za-z0-9-]/g, '-') + '.local'
    const addresses = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4').map(i => i!.address)
    let needsCertificate = false
    try {
      await readFile(keyPath)
      needsCertificate = !new X509Certificate(await readFile(certPath)).keyUsage?.includes('1.3.6.1.5.5.7.3.1')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      needsCertificate = true
    }
    if (needsCertificate) {
      const san = ['DNS:localhost', `DNS:${localHost}`, ...addresses.map(ip => `IP:${ip}`)].join(',')
      await execFileAsync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
        '-keyout', keyPath, '-out', certPath, '-subj', '/CN=Crest Laptop', '-addext', `subjectAltName=${san}`,
        '-addext', 'extendedKeyUsage=serverAuth', '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment', '-addext', 'basicConstraints=critical,CA:FALSE'])
    }
    await chmod(keyPath, 0o600); await chmod(certPath, 0o600)
    const key = await readFile(keyPath), cert = await readFile(certPath)
    this.fingerprint = new X509Certificate(cert).fingerprint256.replace(/:/g, '').toLowerCase()
    const server = createServer({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => { void this.handle(req, res) })
    server.requestTimeout = 30000; server.headersTimeout = 10000
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(this.port, '0.0.0.0', () => { server.off('error', reject); resolve() })
      })
      this.server = server
      const address = server.address()
      this.url = `https://${localHost}:${typeof address === 'object' && address ? address.port : this.port}`
      this.error = undefined
    } catch (error) { this.error = String(error); throw error }
  }
  private async files(project: MobileProject): Promise<string[]> {
    const result: string[] = []; let visited = 0
    const walk = async (dir: string, depth: number) => {
      if (depth > 8 || result.length >= 1000 || visited >= 3000) return
      for (const entry of await readdir(join(project.path, dir), { withFileTypes: true })) {
        if (++visited > 3000 || result.length >= 1000) break
        if (entry.name.startsWith('.') || ['node_modules', 'dist', 'out', 'build', 'DerivedData', 'Pods', 'vendor'].includes(entry.name) || entry.isSymbolicLink()) continue
        const path = dir ? `${dir}/${entry.name}` : entry.name
        try { await codingFile(project.path, path) } catch { continue }
        if (entry.isDirectory()) await walk(path, depth + 1)
        else if (/\.(swift|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|html|css|scss|json|md|txt|yaml|yml|toml|sql|sh|c|h|cpp|rb|php)$/.test(path)) result.push(path)
      }
    }
    await walk('', 0); return result.sort()
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID()
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', 'Cache-Control': 'no-store', 'X-Request-Id': requestId })
      res.end(JSON.stringify(data))
    }
    try {
      const remote = req.socket.remoteAddress ?? ''
      if (!isPrivateAddress(remote) || req.headers.origin) throw new IntegrationError(403, 'private_network', 'Use the paired private network connection')
      const allowedHosts = new Set(['localhost', hostname().replace(/\.local$/, '').replace(/[^A-Za-z0-9-]/g, '-') + '.local',
        ...Object.values(networkInterfaces()).flat().filter(Boolean).map(i => i!.address)].map(host => host.toLowerCase()))
      const requestHost = new URL(`https://${req.headers.host}`).hostname
      if (!allowedHosts.has(requestHost)) throw new IntegrationError(403, 'host', 'Unexpected host')
      const url = new URL(req.url ?? '/', this.url)
      if (req.method === 'POST' && url.pathname === '/pair') {
        const now = Date.now(), attempts = this.attempts.get(remote)
        if (attempts && attempts.until > now && attempts.count >= 10) throw new IntegrationError(429, 'pair_limit', 'Wait a minute before trying again')
        this.attempts.set(remote, { count: attempts && attempts.until > now ? attempts.count + 1 : 1, until: attempts && attempts.until > now ? attempts.until : now + 60000 })
        if (this.attempts.size > 100) for (const [ip, attempt] of this.attempts) if (attempt.until < now) this.attempts.delete(ip)
        const input = z.object({ code: z.string().length(48), name: z.string().min(1).max(80) }).strict().parse(await body(req))
        const hash = digest(input.code)
        if (!this.pairing || this.pairing.expires < now || !timingSafeEqual(Buffer.from(hash), Buffer.from(this.pairing.hash))) throw new IntegrationError(401, 'pair_expired', 'Scan a fresh pairing code from Crest')
        this.pairing = undefined
        if (this.config.devices.length >= 10) throw new IntegrationError(409, 'device_limit', 'Revoke an old device in Crest first')
        const token = randomBytes(32).toString('hex'), id = randomUUID()
        this.config.devices.push({ id, name: input.name, createdAt: new Date().toISOString(), hash: digest(token) })
        await this.save()
        return send(201, { token, deviceId: id, laptopName: hostname() })
      }
      const authorization = req.headers.authorization ?? ''
      const hash = digest(authorization.startsWith('Bearer ') ? authorization.slice(7) : '')
      const device = this.config.devices.find(d => timingSafeEqual(Buffer.from(d.hash), Buffer.from(hash)))
      if (!device) { res.setHeader('WWW-Authenticate', 'Bearer realm="Crest Mobile"'); throw new IntegrationError(401, 'not_paired', 'Pair this phone with Crest again') }
      const prefix = `mobile:${device.id}:`
      const owns = (id: string) => {
        const task = this.coding.get(id)
        if (!task.requestKey?.startsWith(prefix) || !this.config.projects.some(p => p.path === task.projectPath)) throw new IntegrationError(404, 'task_not_found', 'Task is not available to this device')
        return task
      }
      if (req.method === 'GET' && url.pathname === '/v1/status') return send(200, { app: 'Crest', laptopName: hostname(), localInference: true })
      if (req.method === 'GET' && url.pathname === '/v1/models') return send(200, await this.getModels())
      if (req.method === 'GET' && url.pathname === '/v1/projects') return send(200, this.config.projects)
      const fileMatch = url.pathname.match(/^\/v1\/projects\/([a-f0-9-]{36})\/files$/)
      if (req.method === 'GET' && fileMatch) {
        const project = this.config.projects.find(p => p.id === fileMatch[1])
        if (!project) throw new IntegrationError(404, 'project_not_found', 'Project access was removed on the laptop')
        if (await realpath(project.path) !== project.path) throw new IntegrationError(403, 'project_moved', 'Reapprove this project on the laptop')
        return send(200, { files: await this.files(project) })
      }
      const previewMatch = url.pathname.match(/^\/v1\/projects\/([a-f0-9-]{36})\/file$/)
      if (req.method === 'POST' && previewMatch) {
        const project = this.config.projects.find(p => p.id === previewMatch[1])
        if (!project) throw new IntegrationError(404, 'project_not_found', 'Project access was removed on the laptop')
        if (await realpath(project.path) !== project.path) throw new IntegrationError(403, 'project_moved', 'Reapprove this project on the laptop')
        const { path } = z.object({ path: z.string().min(1).max(1000) }).strict().parse(await body(req))
        if (!(await this.files(project)).includes(path)) throw new IntegrationError(403, 'file_not_allowed', 'Choose a listed project source file')
        const content = await readSource(await codingFile(project.path, path))
        if (content === null) throw new IntegrationError(404, 'file_not_found', 'File no longer exists')
        return send(200, { path, content })
      }
      if (req.method === 'POST' && url.pathname === '/v1/tasks') {
        const input = taskInput.parse(await body(req))
        const project = this.config.projects.find(p => p.id === input.projectId)
        if (!project) throw new IntegrationError(403, 'project_not_allowed', 'Allow this project in Crest on the laptop first')
        if (await realpath(project.path) !== project.path) throw new IntegrationError(403, 'project_moved', 'Reapprove this project on the laptop')
        const task = await this.coding.start({ prompt: input.prompt, projectPath: project.path, files: input.files, mode: input.mode, model: input.model, requestKey: prefix + input.requestKey, ...(input.history ? { history: input.history } : {}) })
        res.setHeader('Location', `/v1/tasks/${task.id}`)
        return send(202, task)
      }
      const match = url.pathname.match(/^\/v1\/tasks\/([a-f0-9-]{36})$/)
      if (match) {
        const task = owns(match[1])
        if (req.method === 'GET') return send(200, task)
        if (req.method === 'DELETE') return send(200, this.coding.cancel(task.id))
      }
      throw new IntegrationError(404, 'not_found', 'Unknown mobile endpoint')
    } catch (error) {
      const status = error instanceof IntegrationError ? error.status : 422
      if (!res.headersSent) send(status, { type: 'about:blank', title: error instanceof IntegrationError ? error.code : 'invalid_request', status, detail: error instanceof Error ? error.message : String(error), requestId })
      else res.end()
    }
  }
}
