import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

interface ChatSession {
  process: ChildProcess | null
  buffer: string
}

const sessions = new Map<string, ChatSession>()

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

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send-prompt', async (event, options: {
    sessionId: string
    prompt: string
    cwd: string
    model?: string
    resumeSessionId?: string
  }) => {
    const { sessionId, prompt, cwd, model, resumeSessionId } = options
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Kill existing process for this session
    const existing = sessions.get(sessionId)
    if (existing?.process) {
      existing.process.kill('SIGTERM')
    }

    const claudeBin = findClaudeBinary()
    console.log('[chat] spawning claude for session', sessionId, 'cwd:', cwd)
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
    ]

    if (model) {
      args.push('--model', model)
    }

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
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

    if (!proc.pid) {
      console.error('[chat] FAILED to spawn process')
      win.webContents.send('chat:stream-event', sessionId, {
        type: 'error',
        error: 'Failed to start Claude CLI. Is it installed?',
      })
      return
    }
    console.log('[chat] process spawned, pid:', proc.pid)
    const session: ChatSession = { process: proc, buffer: '' }
    sessions.set(sessionId, session)

    // Close stdin so claude doesn't wait for input
    proc.stdin?.end()

    proc.stdout?.on('data', (data: Buffer) => {
      const raw = data.toString()
      session.buffer += raw
      // Process complete JSON lines
      const lines = session.buffer.split('\n')
      session.buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event_data = JSON.parse(trimmed)
          // Unwrap stream_event wrapper so renderer gets the inner event directly
          const unwrapped = (event_data.type === 'stream_event' && event_data.event)
            ? event_data.event
            : event_data
          win.webContents.send('chat:stream-event', sessionId, unwrapped)
        } catch {
          win.webContents.send('chat:stream-event', sessionId, {
            type: 'text',
            content: trimmed,
          })
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
        win.webContents.send('chat:stream-event', sessionId, {
          type: 'error',
          error: text,
        })
      }
    })

    proc.on('close', (code) => {
      console.log('[chat] process closed with code', code)
      // Flush remaining buffer
      if (session.buffer.trim()) {
        try {
          const event_data = JSON.parse(session.buffer.trim())
          if (event_data.type === 'stream_event' && event_data.event) {
            win.webContents.send('chat:stream-event', sessionId, event_data.event)
          } else {
            win.webContents.send('chat:stream-event', sessionId, event_data)
          }
        } catch {}
      }
      session.buffer = ''
      session.process = null

      win.webContents.send('chat:stream-event', sessionId, {
        type: 'done',
        exitCode: code,
      })
    })

    proc.on('error', (err) => {
      console.log('[chat] process error:', err.message)
      win.webContents.send('chat:stream-event', sessionId, {
        type: 'error',
        error: err.message,
      })
    })
  })

  // Respond to a permission request from the Claude process
  ipcMain.handle('chat:permission-response', async (_event, sessionId: string, toolUseId: string, allowed: boolean) => {
    const session = sessions.get(sessionId)
    if (!session?.process?.stdin?.writable) return false

    const response = JSON.stringify({
      type: 'permission_response',
      permission: {
        tool_use_id: toolUseId,
        allowed,
      },
    })
    console.log('[chat] sending permission response:', response)
    session.process.stdin.write(response + '\n')
    return true
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
