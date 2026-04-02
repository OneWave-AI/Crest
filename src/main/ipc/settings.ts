import { ipcMain, app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import type { AppSettings, CustomTheme } from '../../shared/types'

const SETTINGS_FILE = 'settings.json'
// GitHub repo for update checks - change this to your actual repo
const GITHUB_REPO = 'OneWave-AI/Crest'

function getSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function getDefaultSettings(): AppSettings {
  return {
    // Appearance
    theme: 'default',
    customThemes: [],
    windowOpacity: 1.0,

    // Terminal
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    lineHeight: 1.4,
    cursorStyle: 'block',
    cursorBlink: true,
    bellSound: false,
    scrollbackBuffer: 10000,

    // Tab behavior
    confirmBeforeClose: true,
    showTabCloseButton: true,

    // Updates
    autoUpdate: true,

    // API
    claudeApiKey: '',

    // CLI Provider
    cliProvider: 'claude',

    // Session Context
    sessionContextEnabled: true,
    sessionContextDays: 7
  }
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const settingsPath = getSettingsPath()
    if (existsSync(settingsPath)) {
      const data = await fs.readFile(settingsPath, 'utf-8')
      const saved = JSON.parse(data)
      const defaults = getDefaultSettings()
      // Merge with defaults to ensure all fields exist
      // Handle arrays specially - don't merge, use saved if exists
      return {
        ...defaults,
        ...saved,
        customThemes: Array.isArray(saved.customThemes) ? saved.customThemes : defaults.customThemes
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
  return getDefaultSettings()
}

async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const settingsPath = getSettingsPath()
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save settings:', error)
    throw error
  }
}

// Apply window opacity to all windows
function applyWindowOpacity(opacity: number): void {
  const windows = BrowserWindow.getAllWindows()
  const clampedOpacity = Math.max(0.5, Math.min(1, opacity))
  windows.forEach((win) => {
    win.setOpacity(clampedOpacity)
  })
}

// Initialize settings and apply them to the app
export async function initializeSettings(): Promise<void> {
  try {
    const settings = await loadSettings()
    // Apply window opacity if it's been customized
    if (settings.windowOpacity !== 1.0) {
      // Delay slightly to ensure window is created
      setTimeout(() => {
        applyWindowOpacity(settings.windowOpacity)
      }, 100)
    }
  } catch (error) {
    console.error('Failed to initialize settings:', error)
  }
}

export function registerSettingsHandlers(): void {
  // Load settings
  ipcMain.handle('settings:load', async () => {
    return await loadSettings()
  })

  // Save settings
  ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
    await saveSettings(settings)
    return { success: true }
  })

  // Reset to defaults
  ipcMain.handle('settings:reset', async () => {
    const defaults = getDefaultSettings()
    await saveSettings(defaults)
    return defaults
  })

  // Export settings
  ipcMain.handle('settings:export', async () => {
    const settings = await loadSettings()
    const result = await dialog.showSaveDialog({
      title: 'Export Settings',
      defaultPath: 'crest-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })

  // Import settings
  ipcMain.handle('settings:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (!result.canceled && result.filePaths[0]) {
      try {
        const data = await fs.readFile(result.filePaths[0], 'utf-8')
        const imported = JSON.parse(data)

        // Validate that it looks like a settings object
        if (typeof imported !== 'object' || imported === null) {
          return { success: false, error: 'Invalid settings file: not an object' }
        }

        // Check for at least one expected setting field
        const expectedFields = ['theme', 'fontSize', 'fontFamily', 'windowOpacity']
        const hasExpectedField = expectedFields.some((field) => field in imported)
        if (!hasExpectedField) {
          return { success: false, error: 'Invalid settings file: missing expected fields' }
        }

        const defaults = getDefaultSettings()
        const settings: AppSettings = {
          ...defaults,
          ...imported,
          // Ensure customThemes is always an array
          customThemes: Array.isArray(imported.customThemes)
            ? imported.customThemes
            : defaults.customThemes
        }
        await saveSettings(settings)
        return { success: true, settings }
      } catch (error) {
        return { success: false, error: 'Invalid settings file: ' + String(error) }
      }
    }
    return { success: false }
  })

  // Clear all data
  ipcMain.handle('settings:clearAllData', async () => {
    try {
      const userDataPath = app.getPath('userData')

      let files: string[]
      try {
        files = await fs.readdir(userDataPath)
      } catch (readError) {
        // userData directory doesn't exist or can't be read
        console.warn('userData directory not accessible:', readError)
        return { success: true } // Nothing to clear
      }

      // Keep only essential Electron files
      const keepFiles = ['Preferences', 'Local State', 'GPUCache', 'Code Cache', 'Network']
      const errors: string[] = []

      for (const file of files) {
        if (!keepFiles.includes(file)) {
          const filePath = join(userDataPath, file)
          try {
            const stat = await fs.stat(filePath)
            if (stat.isDirectory()) {
              await fs.rm(filePath, { recursive: true, force: true })
            } else {
              await fs.unlink(filePath)
            }
          } catch (fileError) {
            // Log but continue - some files may be locked
            console.warn(`Failed to delete ${file}:`, fileError)
            errors.push(file)
          }
        }
      }

      if (errors.length > 0) {
        return {
          success: true,
          warning: `Some files could not be deleted: ${errors.join(', ')}`
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to clear data:', error)
      return { success: false, error: String(error) }
    }
  })

  // Check for updates (using GitHub releases API)
  ipcMain.handle('settings:checkForUpdates', async () => {
    try {
      const { net } = await import('electron')

      return new Promise((resolve) => {
        const request = net.request({
          method: 'GET',
          url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          headers: {
            'User-Agent': 'Crest',
            'Accept': 'application/vnd.github.v3+json'
          }
        })

        let data = ''

        request.on('response', (response) => {
          response.on('data', (chunk) => {
            data += chunk.toString()
          })

          response.on('end', () => {
            try {
              const release = JSON.parse(data)
              const latestVersion = release.tag_name?.replace('v', '') || '0.0.0'
              const currentVersion = app.getVersion()

              const isNewer = compareVersions(latestVersion, currentVersion) > 0

              resolve({
                hasUpdate: isNewer,
                currentVersion,
                latestVersion,
                releaseUrl: release.html_url || '',
                releaseNotes: release.body || ''
              })
            } catch {
              resolve({
                hasUpdate: false,
                currentVersion: app.getVersion(),
                latestVersion: app.getVersion(),
                error: 'Failed to parse update info'
              })
            }
          })
        })

        request.on('error', () => {
          resolve({
            hasUpdate: false,
            currentVersion: app.getVersion(),
            latestVersion: app.getVersion(),
            error: 'Failed to check for updates'
          })
        })

        request.end()
      })
    } catch (error) {
      return {
        hasUpdate: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        error: String(error)
      }
    }
  })

  // Set window opacity
  ipcMain.handle('settings:setWindowOpacity', async (_, opacity: number) => {
    applyWindowOpacity(opacity)
    return { success: true }
  })

  // Get app version
  ipcMain.handle('settings:getAppVersion', () => {
    return app.getVersion()
  })

  // Save custom theme
  ipcMain.handle('settings:saveCustomTheme', async (_, theme: CustomTheme) => {
    const settings = await loadSettings()
    const existingIndex = settings.customThemes.findIndex(t => t.id === theme.id)

    if (existingIndex >= 0) {
      settings.customThemes[existingIndex] = theme
    } else {
      settings.customThemes.push(theme)
    }

    await saveSettings(settings)
    return { success: true, themes: settings.customThemes }
  })

  // Delete custom theme
  ipcMain.handle('settings:deleteCustomTheme', async (_, themeId: string) => {
    const settings = await loadSettings()
    settings.customThemes = settings.customThemes.filter(t => t.id !== themeId)
    await saveSettings(settings)
    return { success: true, themes: settings.customThemes }
  })
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }

  return 0
}
