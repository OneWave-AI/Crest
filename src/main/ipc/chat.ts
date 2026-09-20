/**
 * Chat-mode harness: the Claude CLI in headless (`-p`) mode, streaming NDJSON.
 *
 * What print mode can and cannot do, verified against CLI 2.1.220:
 *  - It never asks for permission. There is no `permission_request` event and no
 *    way to answer one, because a non-interactive session has nobody to ask. A
 *    tool the current mode doesn't allow comes back as a `tool_result` with
 *    `is_error: true` reading "Claude requested permissions to ... but you
 *    haven't granted it yet."
 *  - So permission is decided *up front* by `--permission-mode` plus the
 *    allow/deny tool lists, and the renderer's job is to make the active mode
 *    obvious rather than to prompt mid-turn.
 *
 * Each turn is its own process; continuity comes from `--resume <sessionId>`.
 */

import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

/** Modes the installed CLI accepts for --permission-mode. */
export type ChatPermissionMode =
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'manual'
  | 'dontAsk'
  | 'plan'

const PERMISSION_MODES: ChatPermissionMode[] = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan'
]

/**
 * `manual` in print mode denies every gated tool with no way to grant it, which
 * reads as "the app is broken". `acceptEdits` is the mode a desktop GUI wants:
 * edits go through, genuinely dangerous things still stop.
 */
const DEFAULT_PERMISSION_MODE: ChatPermissionMode = 'acceptEdits'

interface ChatSession {
  process: ChildProcess | null
  buffer: string
  /** Window that owns this session, so events don't fan out to every window. */
  windowId: number
  /** Set after abandoning a partial line; skip bytes until the next newline. */
  resyncing: boolean
}

const sessions = new Map<string, ChatSession>()

/** Guard against a single unterminated line growing without bound. */
const MAX_BUFFERED_LINE = 8 * 1024 * 1024

function findClaudeBinary(): string {
  const home = homedir()
  const paths = [
    join(home, '.npm-global', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(home, '.nvm', 'versions', 'node', process.version, 'bin', 'claude'),
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return 'claude' // fallback to PATH
}

function resolveMode(mode?: string): ChatPermissionMode {
  return PERMISSION_MODES.includes(mode as ChatPermissionMode)
    ? (mode as ChatPermissionMode)
    : DEFAULT_PERMISSION_MODE
}

export function registerChatHandlers(): void {
  ipcMain.handle('chat:permission-modes', () => PERMISSION_MODES)

  ipcMain.handle('chat:send-prompt', async (event, options: {
    sessionId: string
    prompt: string
    cwd: string
    model?: string
    resumeSessionId?: string
    permissionMode?: string
    allowedTools?: string[]
    disallowedTools?: string[]
    addDirs?: string[]
  }) => {
    const {
      sessionId, prompt, cwd, model, resumeSessionId,
      permissionMode, allowedTools, disallowedTools, addDirs,
    } = options
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Kill existing process for this session
    const existing = sessions.get(sessionId)
    if (existing?.process) {
      existing.process.kill('SIGTERM')
    }

    const mode = resolveMode(permissionMode)
    const claudeBin = findClaudeBinary()
    console.log('[chat] spawning claude for session', sessionId, 'cwd:', cwd, 'mode:', mode)
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--permission-mode', mode,
    ]

    if (model) {
      args.push('--model', model)
    }

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
    }

    if (allowedTools?.length) {
      args.push('--allowedTools', ...allowedTools)
    }

    if (disallowedTools?.length) {
      args.push('--disallowedTools', ...disallowedTools)
    }

    for (const dir of addDirs ?? []) {
      args.push('--add-dir', dir)
    }

    // Prompt as positional argument
    args.push('--', prompt)

    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
    delete cleanEnv.CLAUDE_CODE_SESSION
    cleanEnv.FORCE_COLOR = '0'
    // Ensure PATH includes common install locations
    const home = homedir()
    const extraPaths = [
      join(home, '.npm-global', 'bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ]
    cleanEnv.PATH = [...extraPaths, cleanEnv.PATH].join(':')

    console.log('[chat] binary:', claudeBin)
    console.log('[chat] args:', JSON.stringify(args))
    console.log('[chat] cwd:', cwd)
    const proc = spawn(claudeBin, args, {
      cwd,
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const send = (payload: unknown): void => {
      const target = BrowserWindow.fromId(win.id)
      if (!target || target.isDestroyed()) return
      target.webContents.send('chat:stream-event', sessionId, payload)
    }

    if (!proc.pid) {
      console.error('[chat] FAILED to spawn process')
      send({ type: 'error', error: 'Failed to start Claude CLI. Is it installed?' })
      return
    }
    console.log('[chat] process spawned, pid:', proc.pid)
    const session: ChatSession = { process: proc, buffer: '', windowId: win.id, resyncing: false }
    sessions.set(sessionId, session)

    // Tell the renderer which permission mode this turn is actually running under,
    // so a blocked tool can be explained instead of looking like a silent failure.
    send({ type: 'harness_info', permissionMode: mode, model: model ?? null })

    // Print mode reads the prompt from argv and never asks for anything else;
    // leaving stdin open just makes the CLI wait on a pipe that will never speak.
    proc.stdin?.end()

    proc.stdout?.on('data', (data: Buffer) => {
      const raw = data.toString()
      session.buffer += raw

      // Finish discarding a line we already abandoned, so its tail doesn't get
      // glued onto the next real message.
      if (session.resyncing) {
        const boundary = session.buffer.indexOf('\n')
        if (boundary === -1) {
          session.buffer = ''
          return
        }
        session.buffer = session.buffer.slice(boundary + 1)
        session.resyncing = false
      }

      // Process complete JSON lines
      const lines = session.buffer.split('\n')
      session.buffer = lines.pop() || ''

      if (session.buffer.length > MAX_BUFFERED_LINE) {
        console.error('[chat] dropping oversized partial line', session.buffer.length)
        session.buffer = ''
        session.resyncing = true
        send({ type: 'error', error: 'Dropped an oversized message from the CLI.' })
      }

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event_data = JSON.parse(trimmed)
          // Unwrap stream_event wrapper so renderer gets the inner event directly
          const unwrapped = (event_data.type === 'stream_event' && event_data.event)
            ? event_data.event
            : event_data
          send(unwrapped)
        } catch {
          send({ type: 'text', content: trimmed })
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (!text) return
      // Whitelist known-safe stderr noise to suppress (everything else is a real error)
      const isSafeNoise = /^Connected to |^MCP |^Debugger |^Warning: .*(MCP|experimental|deprecated)/i.test(text)
        || /^\[MCP\]|^npm warn|^ExperimentalWarning/i.test(text)
      if (!isSafeNoise) {
        send({ type: 'error', error: text })
      }
    })

    proc.on('close', (code) => {
      console.log('[chat] process closed with code', code)
      // Flush remaining buffer
      if (session.buffer.trim()) {
        try {
          const event_data = JSON.parse(session.buffer.trim())
          if (event_data.type === 'stream_event' && event_data.event) {
            send(event_data.event)
          } else {
            send(event_data)
          }
        } catch {}
      }
      session.buffer = ''
      session.process = null

      send({ type: 'done', exitCode: code })
    })

    proc.on('error', (err) => {
      console.log('[chat] process error:', err.message)
      send({ type: 'error', error: err.message })
    })
  })

  ipcMain.handle('chat:stop', async (_event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (session?.process) {
      session.process.kill('SIGTERM')
      return true
    }
    return false
  })

  // Clean up all chat processes on app quit
  app.on('before-quit', () => {
    for (const [, session] of sessions) {
      if (session.process) {
        try { session.process.kill('SIGTERM') } catch { /* already dead */ }
      }
    }
    sessions.clear()
  })
}
