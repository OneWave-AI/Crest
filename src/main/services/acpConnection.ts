/**
 * ACP (Agent Client Protocol) connection.
 *
 * Speaks newline-delimited JSON-RPC 2.0 over the agent's stdio. This is the
 * structured replacement for scraping the PTY: tool calls, diffs, plans and
 * permission requests arrive as typed messages instead of ANSI text we have to
 * guess at.
 *
 * Transport is hand-rolled (~200 lines) so the main bundle stays CJS and we
 * don't pull an ESM-only package into electron-vite's main build; the protocol
 * types come from `@zed-industries/agent-client-protocol` as type-only imports.
 */

import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import * as fs from 'fs/promises'
import { homedir } from 'os'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'path'
import { fileURLToPath } from 'url'
import {
  ACP_AGENTS,
  ACP_AUTH_REQUIRED_CODE,
  ACP_PROTOCOL_VERSION,
  type AcpAgentId,
  type AcpAuthMethod,
  type AcpContentBlock,
  type AcpPermissionRequest,
  type AcpSessionState,
  type AcpSessionUpdate,
  type AcpStartOptions,
  type AcpStopReason,
  type AcpTerminalState
} from '../../shared/acp'
import { AcpTerminalRegistry } from './acpTerminals'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const JSONRPC_METHOD_NOT_FOUND = -32601
const JSONRPC_INTERNAL_ERROR = -32603

/** Carries the JSON-RPC code so callers can distinguish auth_required from a real fault. */
export class AcpRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'AcpRequestError'
  }
}

function extraPaths(): string[] {
  const home = homedir()
  return [
    join(home, '.npm-global', 'bin'),
    join(home, '.nvm', 'versions', 'node', process.version, 'bin'),
    join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ]
}

function findBinary(name: string): string | null {
  for (const dir of extraPaths()) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Resolve how to launch an agent. Prefers a locally installed bridge binary and
 * falls back to `npx -y <package>` so a first run works with zero setup.
 */
export function resolveAgentCommand(options: AcpStartOptions): { command: string; args: string[] } {
  if (options.agentId === 'custom') {
    if (!options.command) throw new Error('Custom ACP agent requires a command')
    return { command: options.command, args: options.args ?? [] }
  }

  const spec = ACP_AGENTS[options.agentId]
  if (!spec) throw new Error(`Unknown ACP agent: ${options.agentId}`)

  if (spec.binary) {
    const found = findBinary(spec.binary)
    if (found) return { command: found, args: spec.args ?? [] }
  }
  if (spec.package) {
    const npx = findBinary('npx') ?? 'npx'
    return { command: npx, args: ['-y', spec.package, ...(spec.args ?? [])] }
  }
  if (spec.binary) {
    // Not found on disk; let PATH resolution have a go and surface a real error.
    return { command: spec.binary, args: spec.args ?? [] }
  }
  throw new Error(`ACP agent ${options.agentId} has no launch configuration`)
}

/** ACP passes file paths as absolute paths, but be defensive about file:// URIs. */
function toLocalPath(pathOrUri: string, cwd: string): string {
  if (pathOrUri.startsWith('file://')) return fileURLToPath(pathOrUri)
  if (isAbsolute(pathOrUri)) return pathOrUri
  return resolvePath(cwd, pathOrUri)
}

export declare interface AcpConnection {
  on(event: 'update', listener: (update: AcpSessionUpdate) => void): this
  on(event: 'permission', listener: (request: AcpPermissionRequest) => void): this
  on(event: 'permission-resolved', listener: (requestId: string) => void): this
  on(event: 'state', listener: (patch: Partial<AcpSessionState>) => void): this
  on(event: 'log', listener: (level: 'info' | 'error', message: string) => void): this
  on(event: 'terminal', listener: (state: AcpTerminalState) => void): this
  on(event: 'exit', listener: (code: number | null) => void): this
}

export class AcpConnection extends EventEmitter {
  readonly sessionId: string
  readonly agentId: AcpAgentId
  readonly cwd: string

  private proc: ChildProcess | null = null
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly permissionResolvers = new Map<string, (optionId: string | null) => void>()
  private stdoutBuffer = ''
  private nextPermissionId = 1
  private acpSessionId: string | null = null
  private stopped = false
  private authMethods: AcpAuthMethod[] = []
  private loadSessionSupported = false
  private readonly terminals = new AcpTerminalRegistry()

  constructor(private readonly options: AcpStartOptions) {
    super()
    this.sessionId = options.sessionId
    this.agentId = options.agentId
    this.cwd = options.cwd
    this.terminals.on('changed', (state) => this.emit('terminal', state))
  }

  get agentSessionId(): string | null {
    return this.acpSessionId
  }

  // --- lifecycle ---------------------------------------------------------------

  async start(): Promise<Partial<AcpSessionState>> {
    const { command, args } = resolveAgentCommand(this.options)

    const env: NodeJS.ProcessEnv = { ...process.env, ...(this.options.env ?? {}) }
    // Claude Code sets these when Crest itself was launched from a Claude session;
    // leaking them makes the child think it is a nested run.
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_SESSION
    env.PATH = [...extraPaths(), env.PATH].filter(Boolean).join(':')

    this.emit('log', 'info', `launching ${command} ${args.join(' ')}`)

    const proc = spawn(command, args, {
      cwd: this.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.proc = proc

    if (!proc.pid) throw new Error(`Failed to spawn ACP agent: ${command}`)

    proc.stdout?.setEncoding('utf-8')
    proc.stdout?.on('data', (chunk: string) => this.onStdout(chunk))
    proc.stderr?.setEncoding('utf-8')
    proc.stderr?.on('data', (chunk: string) => {
      // Agent stderr is diagnostic chatter (claude-code-acp dumps diffs there),
      // not failure — only real transport/process faults are logged as errors.
      const text = chunk.trim()
      if (text) this.emit('log', 'info', text)
    })
    proc.on('error', (err) => {
      this.emit('log', 'error', err.message)
      this.emit('state', { status: 'error', error: err.message })
    })
    proc.on('exit', (code) => {
      this.rejectAllPending(new Error(`ACP agent exited with code ${code ?? 'null'}`))
      if (!this.stopped) this.emit('state', { status: 'stopped', error: code ? `Agent exited (${code})` : null })
      this.emit('exit', code)
    })

    const init = (await this.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true
      }
    })) as {
      protocolVersion?: number
      agentCapabilities?: {
        loadSession?: boolean
        promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }
      }
      authMethods?: { id: string; name: string }[]
    }

    const prompt = init.agentCapabilities?.promptCapabilities ?? {}
    const capabilities = {
      loadSession: Boolean(init.agentCapabilities?.loadSession),
      promptImage: Boolean(prompt.image),
      promptAudio: Boolean(prompt.audio),
      promptEmbeddedContext: Boolean(prompt.embeddedContext)
    }
    this.authMethods = (init.authMethods ?? []).map((method) => ({
      id: method.id,
      name: method.name,
      description: (method as { description?: string }).description ?? null
    }))
    this.loadSessionSupported = capabilities.loadSession

    try {
      const session = await this.openSession()
      return { ...session, capabilities, authMethods: this.authMethods }
    } catch (err) {
      // The agent wants a login before it will hand out a session. Surface the
      // methods rather than failing the connection outright.
      if (err instanceof AcpRequestError && err.code === ACP_AUTH_REQUIRED_CODE) {
        return {
          status: 'authenticating',
          error: null,
          capabilities,
          authMethods: this.authMethods
        }
      }
      throw err
    }
  }

  /** Resume when asked to and the agent supports it, otherwise start clean. */
  private async openSession(): Promise<Partial<AcpSessionState>> {
    const resumeId = this.options.resumeAcpSessionId
    if (resumeId && this.loadSessionSupported) {
      try {
        return await this.loadSession(resumeId)
      } catch (err) {
        if (err instanceof AcpRequestError && err.code === ACP_AUTH_REQUIRED_CODE) throw err
        const message = err instanceof Error ? err.message : String(err)
        this.emit('log', 'info', `resume failed (${message}); starting a new session`)
      }
    }
    return this.newSession()
  }

  /**
   * `session/load` replays the whole conversation back as session/update
   * notifications before it resolves, so the timeline rebuilds itself through
   * the same reducer that handles live updates.
   */
  private async loadSession(acpSessionId: string): Promise<Partial<AcpSessionState>> {
    const result = (await this.request('session/load', {
      sessionId: acpSessionId,
      cwd: this.cwd,
      mcpServers: this.options.mcpServers ?? []
    })) as {
      modes?: { currentModeId: string; availableModes: { id: string; name: string; description?: string }[] }
      models?: { currentModelId: string; availableModels: { modelId: string; name: string; description?: string }[] }
    } | null

    this.acpSessionId = acpSessionId

    return {
      acpSessionId,
      status: 'ready',
      error: null,
      modes: result?.modes?.availableModes ?? [],
      currentModeId: result?.modes?.currentModeId ?? null,
      models: result?.models?.availableModels ?? [],
      currentModelId: result?.models?.currentModelId ?? null
    }
  }

  private async newSession(): Promise<Partial<AcpSessionState>> {
    const result = (await this.request('session/new', {
      cwd: this.cwd,
      mcpServers: this.options.mcpServers ?? []
    })) as {
      sessionId: string
      modes?: { currentModeId: string; availableModes: { id: string; name: string; description?: string }[] }
      models?: { currentModelId: string; availableModels: { modelId: string; name: string; description?: string }[] }
    }

    this.acpSessionId = result.sessionId

    return {
      acpSessionId: result.sessionId,
      status: 'ready',
      error: null,
      modes: result.modes?.availableModes ?? [],
      currentModeId: result.modes?.currentModeId ?? null,
      models: result.models?.availableModels ?? [],
      currentModelId: result.models?.currentModelId ?? null
    }
  }

  /** Authenticate, then open the session the login was blocking. */
  async authenticate(methodId: string): Promise<Partial<AcpSessionState>> {
    await this.request('authenticate', { methodId })
    return this.openSession()
  }

  async prompt(blocks: AcpContentBlock[]): Promise<AcpStopReason> {
    if (!this.acpSessionId) throw new Error('ACP session not established')
    if (blocks.length === 0) throw new Error('Prompt is empty')
    const result = (await this.request('session/prompt', {
      sessionId: this.acpSessionId,
      prompt: blocks
    })) as { stopReason: AcpStopReason }
    return result.stopReason ?? 'end_turn'
  }

  cancel(): void {
    if (!this.acpSessionId) return
    // Spec: a client that cancels MUST answer any outstanding permission request
    // with a cancelled outcome. Skipping this leaves the agent blocked on a reply
    // and the prompt card stuck on screen.
    for (const requestId of [...this.permissionResolvers.keys()]) {
      this.resolvePermission(requestId, null)
    }
    this.notify('session/cancel', { sessionId: this.acpSessionId })
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.acpSessionId) return
    await this.request('session/set_mode', { sessionId: this.acpSessionId, modeId })
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.acpSessionId) return
    await this.request('session/set_model', { sessionId: this.acpSessionId, modelId })
  }

  resolvePermission(requestId: string, optionId: string | null): void {
    const resolver = this.permissionResolvers.get(requestId)
    if (!resolver) return
    this.permissionResolvers.delete(requestId)
    resolver(optionId)
  }

  stop(): void {
    this.stopped = true
    // Answer anything still in flight so the agent doesn't hang on shutdown.
    for (const [requestId] of this.permissionResolvers) this.resolvePermission(requestId, null)
    this.rejectAllPending(new Error('ACP session stopped'))
    this.terminals.killAll()
    this.proc?.kill('SIGTERM')
    this.proc = null
  }

  // --- transport ---------------------------------------------------------------

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newline = this.stdoutBuffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (line) {
        try {
          this.handleMessage(JSON.parse(line) as JsonRpcMessage)
        } catch (err) {
          this.emit('log', 'error', `bad JSON from agent: ${line.slice(0, 200)}`)
        }
      }
      newline = this.stdoutBuffer.indexOf('\n')
    }
  }

  private write(message: Record<string, unknown>): void {
    if (!this.proc?.stdin?.writable) return
    this.proc.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: '2.0', method, params })
  }

  private respond(id: number | string, result: unknown): void {
    this.write({ jsonrpc: '2.0', id, result })
  }

  private respondError(id: number | string, code: number, message: string): void {
    this.write({ jsonrpc: '2.0', id, error: { code, message } })
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) pending.reject(error)
    this.pending.clear()
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response to something we sent.
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id as number)
      if (!pending) return
      this.pending.delete(message.id as number)
      if (message.error) {
        pending.reject(new AcpRequestError(message.error.code, message.error.message, message.error.data))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (!message.method) return

    // Notification from the agent.
    if (message.id === undefined) {
      if (message.method === 'session/update') {
        const params = message.params as { update?: AcpSessionUpdate } | undefined
        if (params?.update) this.emit('update', params.update)
      }
      return
    }

    // Request from the agent — must be answered.
    void this.handleAgentRequest(message.id, message.method, message.params ?? {})
  }

  private async handleAgentRequest(
    id: number | string,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    try {
      switch (method) {
        case 'session/request_permission': {
          const optionId = await this.askPermission(params)
          this.respond(
            id,
            optionId
              ? { outcome: { outcome: 'selected', optionId } }
              : { outcome: { outcome: 'cancelled' } }
          )
          return
        }
        case 'fs/read_text_file': {
          const path = toLocalPath(String(params.path ?? ''), this.cwd)
          const content = await fs.readFile(path, 'utf-8')
          const line = typeof params.line === 'number' ? params.line : null
          const limit = typeof params.limit === 'number' ? params.limit : null
          if (line === null && limit === null) {
            this.respond(id, { content })
            return
          }
          const lines = content.split('\n')
          const start = line ? Math.max(0, line - 1) : 0
          const end = limit ? start + limit : lines.length
          this.respond(id, { content: lines.slice(start, end).join('\n') })
          return
        }
        case 'fs/write_text_file': {
          const path = toLocalPath(String(params.path ?? ''), this.cwd)
          await fs.mkdir(dirname(path), { recursive: true })
          await fs.writeFile(path, String(params.content ?? ''), 'utf-8')
          this.respond(id, {})
          return
        }
        case 'terminal/create': {
          const terminalId = this.terminals.create({
            command: String(params.command ?? ''),
            args: (params.args as string[]) ?? [],
            cwd: (params.cwd as string | null) ?? null,
            env: (params.env as { name: string; value: string }[]) ?? [],
            outputByteLimit: (params.outputByteLimit as number | null) ?? null,
            defaultCwd: this.cwd
          })
          this.respond(id, { terminalId })
          return
        }
        case 'terminal/output': {
          this.respond(id, this.terminals.output(String(params.terminalId ?? '')))
          return
        }
        case 'terminal/wait_for_exit': {
          const exit = await this.terminals.waitForExit(String(params.terminalId ?? ''))
          this.respond(id, exit)
          return
        }
        case 'terminal/kill': {
          this.terminals.kill(String(params.terminalId ?? ''))
          this.respond(id, {})
          return
        }
        case 'terminal/release': {
          this.terminals.release(String(params.terminalId ?? ''))
          this.respond(id, {})
          return
        }
        default:
          this.respondError(id, JSONRPC_METHOD_NOT_FOUND, `Unsupported client method: ${method}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emit('log', 'error', `${method} failed: ${message}`)
      this.respondError(id, JSONRPC_INTERNAL_ERROR, message)
    }
  }

  private askPermission(params: Record<string, unknown>): Promise<string | null> {
    const requestId = `perm-${this.nextPermissionId++}`
    const request: AcpPermissionRequest = {
      requestId,
      sessionId: this.sessionId,
      options: (params.options as AcpPermissionRequest['options']) ?? [],
      toolCall: (params.toolCall as AcpPermissionRequest['toolCall']) ?? { toolCallId: 'unknown' }
    }

    return new Promise((resolve) => {
      this.permissionResolvers.set(requestId, (optionId) => {
        this.emit('permission-resolved', requestId)
        resolve(optionId)
      })
      this.emit('permission', request)
    })
  }
}
