import { ipcMain } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

const MCP_ENV = {
  ...process.env,
  PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${homedir()}/.npm-global/bin`,
}

function findClaudeBinary(): string {
  const home = homedir()
  const paths = [
    join(home, '.npm-global', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return 'claude'
}

/** Validate MCP server name — alphanumeric, hyphens, underscores only */
function validateName(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid MCP server name: "${name}". Use only alphanumeric, hyphens, underscores.`)
  }
  return name
}

async function runClaude(...args: string[]): Promise<string> {
  const bin = findClaudeBinary()
  const { stdout } = await execFileAsync(bin, args, { env: MCP_ENV })
  return stdout
}

async function parseClaudeMCPList(): Promise<Array<{
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  status: string
}>> {
  try {
    const stdout = await runClaude('mcp', 'list')

    const servers: Array<{
      name: string
      command: string
      args: string[]
      env: Record<string, string>
      enabled: boolean
      status: string
    }> = []

    const lines = stdout.split('\n')
    for (const line of lines) {
      const match = line.match(/^(\S+):\s+(.+?)\s+-\s+(.+)$/)
      if (match) {
        const [, name, commandWithArgs, statusPart] = match
        const parts = commandWithArgs.trim().split(/\s+/)
        const command = parts[0] || ''
        const args = parts.slice(1)
        const isConnected = statusPart.includes('\u2713') || statusPart.includes('Connected')

        servers.push({
          name,
          command,
          args,
          env: {},
          enabled: true,
          status: isConnected ? 'connected' : 'failed',
        })
      }
    }

    return servers
  } catch (error) {
    console.error('Failed to list MCP servers:', error)
    return []
  }
}

async function getMCPServerDetails(name: string): Promise<{
  command: string
  args: string[]
  env: Record<string, string>
} | null> {
  try {
    const stdout = await runClaude('mcp', 'get', validateName(name))

    const commandMatch = stdout.match(/Command:\s*(.+)/i)
    const argsMatch = stdout.match(/Args:\s*(.+)/i)

    if (commandMatch) {
      return {
        command: commandMatch[1].trim(),
        args: argsMatch ? argsMatch[1].trim().split(/\s+/) : [],
        env: {},
      }
    }

    return null
  } catch {
    return null
  }
}

export function registerMCPHandlers(): void {
  ipcMain.handle('mcp-list', async () => {
    return parseClaudeMCPList()
  })

  ipcMain.handle('mcp-get', async (_, name: string) => {
    const details = await getMCPServerDetails(name)
    if (!details) return null
    return { name, command: details.command, args: details.args, env: details.env, enabled: true }
  })

  ipcMain.handle(
    'mcp-add',
    async (_, name: string, command: string, args: string[], env: Record<string, string>) => {
      try {
        const cliArgs = ['mcp', 'add', validateName(name), command, ...args]
        for (const [key, value] of Object.entries(env)) {
          cliArgs.push('-e', `${key}=${value}`)
        }
        await runClaude(...cliArgs)
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add server'
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    'mcp-update',
    async (_, name: string, command: string, args: string[], env: Record<string, string>) => {
      try {
        const safeName = validateName(name)
        await runClaude('mcp', 'remove', safeName, '-s', 'user')

        const cliArgs = ['mcp', 'add', safeName, command, ...args]
        for (const [key, value] of Object.entries(env)) {
          cliArgs.push('-e', `${key}=${value}`)
        }
        await runClaude(...cliArgs)
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update server'
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle('mcp-remove', async (_, name: string) => {
    try {
      await runClaude('mcp', 'remove', validateName(name), '-s', 'user')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove server'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('mcp-toggle', async (_, _name: string, _enabled: boolean) => {
    return { success: true, note: 'Claude CLI does not support disabling servers' }
  })

  ipcMain.handle('mcp-check-config', async () => {
    try {
      await runClaude('mcp', 'list')
      return { exists: true, path: 'claude mcp' }
    } catch {
      return { exists: false, path: 'claude mcp' }
    }
  })

  ipcMain.handle('mcp-init-config', async () => {
    return { success: true, created: false }
  })
}
