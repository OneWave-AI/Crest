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
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
    ]

    if (model) {
      args.push('--model', model)
    }

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
    }

    // Prompt as positional argument (no -- separator needed)
    args.push(prompt)

    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    cleanEnv.FORCE_COLOR = '0'
    // Ensure PATH includes common install locations
    const home = homedir()
    const extraPaths = [
      join(home, '.npm-global', 'bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ]
    cleanEnv.PATH = [...extraPaths, cleanEnv.PATH].join(':')

    console.log('[chat] binary:', claudeBin, 'args:', args.join(' '))
    const proc = spawn(claudeBin, args, {
      cwd,
      env: cleanEnv,
    })

    console.log('[chat] process spawned, pid:', proc.pid)
    const session: ChatSession = { process: proc, buffer: '' }
    sessions.set(sessionId, session)

    proc.stdout?.on('data', (data: Buffer) => {
      const raw = data.toString()
      console.log('[chat:stdout]', raw.substring(0, 200))
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
          console.log('[chat:event]', unwrapped.type, JSON.stringify(unwrapped).substring(0, 150))
          win.webContents.send('chat:stream-event', sessionId, unwrapped)
        } catch {
          console.log('[chat:non-json]', trimmed.substring(0, 100))
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
      console.log('[chat:stderr]', text.substring(0, 200))
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
