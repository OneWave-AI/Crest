import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import * as fs from 'fs/promises'
import { registerTerminalHandlers } from './terminal'
import { registerFileHandlers } from './files'
import { registerSkillsHandlers } from './skills'
import { registerConversationHandlers } from './conversations'
import { registerGitHandlers } from './git'
import { registerSettingsHandlers, initializeSettings } from './settings'
import { registerMCPHandlers } from './mcp'
import { registerSuperAgentHandlers } from './superagent'
import { registerHiveHandlers } from './hives'
import { registerMemoryHandlers } from './memory'
import { registerBackgroundAgentHandlers } from './backgroundAgents'
import { registerRepoAnalyzerHandlers } from './repoAnalyzer'
import { registerTeamHandlers } from './teams'
import { registerChatHandlers } from './chat'
import type { CLIProvider } from '../../shared/types'
import { CLI_PROVIDERS } from '../../shared/providers'

export function registerIpcHandlers(): void {
  // Terminal handlers
  registerTerminalHandlers()

  // File handlers
  registerFileHandlers()

  // Skills handlers
  registerSkillsHandlers()

  // Conversation handlers
  registerConversationHandlers()

  // Git handlers
  registerGitHandlers()

  // Settings handlers
  registerSettingsHandlers()

  // MCP handlers
  registerMCPHandlers()

  // Super Agent handlers
  registerSuperAgentHandlers()

  // Hive handlers
  registerHiveHandlers()

  // Memory handlers
  registerMemoryHandlers()

  // Background Agent handlers
  registerBackgroundAgentHandlers()

  // Repository Analyzer handlers
  registerRepoAnalyzerHandlers()

  // Teams handlers
  registerTeamHandlers()

  // Chat handlers
  registerChatHandlers()

  // Initialize settings (apply window opacity, etc.)
  initializeSettings()

  // System handlers
  ipcMain.handle('get-home-dir', () => homedir())

  // Track last opened URL to prevent spam
  let lastOpenedUrl: { url: string; time: number } | null = null

  ipcMain.handle('open-url-external', async (_, url: string) => {
    // Debounce: prevent opening same URL within 1 second
    const now = Date.now()
    if (lastOpenedUrl && lastOpenedUrl.url === url && now - lastOpenedUrl.time < 1000) {
      return // Skip duplicate
    }
    lastOpenedUrl = { url, time: now }
    await shell.openExternal(url)
  })

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: homedir()
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // File picker for chat attachments
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      defaultPath: homedir()
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const { basename } = await import('path')
    return result.filePaths.map(p => ({
      path: p,
      name: basename(p),
    }))
  })

  // Generic CLI check (provider-aware)
  async function checkCliInstalled(provider: CLIProvider): Promise<boolean> {
    const { exec } = await import('child_process')
    const { existsSync } = await import('fs')

    const config = CLI_PROVIDERS[provider]
    const home = homedir()

    // Check common installation paths first
    const commonPaths = [
      ...config.checkPaths(home),
      join(home, '.nvm', 'versions', 'node', process.version, 'bin', config.binaryName)
    ]

    for (const binPath of commonPaths) {
      if (existsSync(binPath)) {
        return true
      }
    }

    // Fallback to which command with user's shell
    return new Promise<boolean>((resolve) => {
      exec(`source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null; which ${config.binaryName}`, {
        shell: '/bin/zsh',
        env: { ...process.env, PATH: `${process.env.PATH}:${home}/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin` }
      }, (error) => {
        resolve(!error)
      })
    })
  }

  // Claude CLI check (legacy, defaults to claude)
  ipcMain.handle('check-claude-installed', async () => {
    return checkCliInstalled('claude')
  })

  // Generic CLI check
  ipcMain.handle('check-cli-installed', async (_, provider: CLIProvider) => {
    return checkCliInstalled(provider || 'claude')
  })

  // Generic CLI install
  async function installCli(provider: CLIProvider, event: Electron.IpcMainInvokeEvent): Promise<void> {
    const { spawn } = await import('child_process')

    const config = CLI_PROVIDERS[provider]

    return new Promise<void>((resolve, reject) => {
      const { CLAUDECODE: _, ...cleanEnv } = process.env
      const install = spawn('npm', ['install', '-g', config.installPackage], {
        shell: true,
        env: { ...cleanEnv }
      })

      const window = BrowserWindow.fromWebContents(event.sender)

      install.stdout?.on('data', (data) => {
        const output = data.toString()
        if (output.includes('added')) {
          window?.webContents.send('install-progress', { stage: 'Installing packages...', progress: 75 })
        }
      })

      install.stderr?.on('data', (data) => {
        const output = data.toString()
        if (output.includes('npm')) {
          window?.webContents.send('install-progress', { stage: 'Downloading...', progress: 50 })
        }
      })

      install.on('close', (code) => {
        if (code === 0) {
          window?.webContents.send('install-progress', { stage: 'Complete', progress: 100 })
          resolve()
        } else {
          reject(new Error(`Installation failed with code ${code}`))
        }
      })

      install.on('error', (err) => {
        reject(err)
      })

      window?.webContents.send('install-progress', { stage: 'Starting installation...', progress: 10 })
    })
  }

  // Claude CLI install (legacy, defaults to claude)
  ipcMain.handle('install-claude', async (event) => {
    return installCli('claude', event)
  })

  // Generic CLI install
  ipcMain.handle('install-cli', async (event, provider: CLIProvider) => {
    return installCli(provider || 'claude', event)
  })

  // Window controls
  ipcMain.handle('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.handle('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.handle('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
}
