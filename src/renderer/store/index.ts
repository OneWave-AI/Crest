import { create } from 'zustand'
import type { AppSettings, CustomTheme, CLIProvider, ModelRuntime } from '../../shared/types'
import { supportsLocalRuntime } from '../../shared/providers'

/** Sensible starting point; the picker replaces this with whatever ollama reports. */
const DEFAULT_LOCAL_MODEL = 'qwen3-coder:30b'

// Debounce helper
let saveTimeout: NodeJS.Timeout | null = null
const debouncedSave = (saveFn: () => Promise<void>) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveFn()
  }, 500) // Wait 500ms after last change before saving
}

// Open files storage key
const OPEN_FILES_KEY = 'claudeui_open_files'
const MAX_OPEN_FILES = 50

interface AppState {
  // Current working directory
  cwd: string
  setCwd: (cwd: string) => void

  // Theme
  theme: string
  setTheme: (theme: string) => void

  // Terminal tabs
  activeTerminalId: string | null
  setActiveTerminalId: (id: string | null) => void

  // Open files (file tab bar)
  openFiles: string[]
  activeFilePath: string | null
  addOpenFile: (path: string) => void
  removeOpenFile: (path: string) => void
  setActiveFile: (path: string | null) => void
  closeOtherFiles: (keepPath: string) => void
  clearOpenFiles: () => void
  reorderOpenFiles: (files: string[]) => void

  // All settings
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void

  // Settings loading state
  settingsLoaded: boolean
  setSettingsLoaded: (loaded: boolean) => void

  // Convenience getters/setters for common settings
  fontSize: number
  setFontSize: (size: number) => void
  fontFamily: string
  setFontFamily: (family: string) => void
  lineHeight: number
  setLineHeight: (height: number) => void
  cursorStyle: 'block' | 'underline' | 'bar'
  setCursorStyle: (style: 'block' | 'underline' | 'bar') => void
  cursorBlink: boolean
  setCursorBlink: (blink: boolean) => void
  bellSound: boolean
  setBellSound: (sound: boolean) => void
  scrollbackBuffer: number
  setScrollbackBuffer: (size: number) => void
  windowOpacity: number
  setWindowOpacity: (opacity: number) => void
  confirmBeforeClose: boolean
  setConfirmBeforeClose: (confirm: boolean) => void
  autoUpdate: boolean
  setAutoUpdate: (auto: boolean) => void
  claudeApiKey: string
  setClaudeApiKey: (key: string) => void

  // CLI Provider
  cliProvider: CLIProvider
  setCLIProvider: (provider: CLIProvider) => void

  // Model runtime (cloud API vs local ollama)
  modelRuntime: ModelRuntime
  setModelRuntime: (runtime: ModelRuntime) => void
  localModel: string
  setLocalModel: (model: string) => void

  // Session Context
  sessionContextEnabled: boolean
  setSessionContextEnabled: (enabled: boolean) => void
  sessionContextDays: number
  setSessionContextDays: (days: number) => void

  // Custom themes
  customThemes: CustomTheme[]
  setCustomThemes: (themes: CustomTheme[]) => void
  addCustomTheme: (theme: CustomTheme) => void
  removeCustomTheme: (themeId: string) => void

  // Initialize settings from storage
  initializeSettings: () => Promise<void>
  saveAllSettings: () => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'default',
  customThemes: [],
  windowOpacity: 1.0,
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  lineHeight: 1.4,
  cursorStyle: 'block',
  cursorBlink: true,
  bellSound: false,
  scrollbackBuffer: 10000,
  confirmBeforeClose: true,
  showTabCloseButton: true,
  autoUpdate: true,
  claudeApiKey: '',
  cliProvider: 'claude' as CLIProvider,
  modelRuntime: 'api' as ModelRuntime,
  localModel: DEFAULT_LOCAL_MODEL,
  sessionContextEnabled: true,
  sessionContextDays: 7
}

export const useAppStore = create<AppState>((set, get) => ({
  cwd: '',
  setCwd: (cwd) => set({ cwd }),

  theme: 'default',
  setTheme: (theme) => {
    set({ theme })
    const settings = { ...get().settings, theme }
    set({ settings })
    get().saveAllSettings()
  },

  activeTerminalId: null,
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),

  // Open files management
  openFiles: (() => {
    try {
      const stored = localStorage.getItem(OPEN_FILES_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })(),
  activeFilePath: null,

  addOpenFile: (path) => {
    const current = get().openFiles
    // Don't add duplicates, just activate it
    if (current.includes(path)) {
      set({ activeFilePath: path })
      return
    }
    // Add to end, limit to max
    const newFiles = [...current, path].slice(-MAX_OPEN_FILES)
    set({ openFiles: newFiles, activeFilePath: path })
    try {
      localStorage.setItem(OPEN_FILES_KEY, JSON.stringify(newFiles))
    } catch { /* ignore */ }
  },

  removeOpenFile: (path) => {
    const current = get().openFiles
    const newFiles = current.filter(f => f !== path)
    const wasActive = get().activeFilePath === path

    // If closing active file, activate the previous one or next one
    let newActive = get().activeFilePath
    if (wasActive) {
      const closedIndex = current.indexOf(path)
      if (newFiles.length > 0) {
        // Prefer the file before, otherwise the file after
        newActive = newFiles[Math.min(closedIndex, newFiles.length - 1)] || null
      } else {
        newActive = null
      }
    }

    set({ openFiles: newFiles, activeFilePath: newActive })
    try {
      localStorage.setItem(OPEN_FILES_KEY, JSON.stringify(newFiles))
    } catch { /* ignore */ }
  },

  setActiveFile: (path) => {
    set({ activeFilePath: path })
  },

  closeOtherFiles: (keepPath) => {
    const newFiles = get().openFiles.filter(f => f === keepPath)
    set({ openFiles: newFiles, activeFilePath: keepPath })
    try {
      localStorage.setItem(OPEN_FILES_KEY, JSON.stringify(newFiles))
    } catch { /* ignore */ }
  },

  clearOpenFiles: () => {
    set({ openFiles: [], activeFilePath: null })
    try {
      localStorage.removeItem(OPEN_FILES_KEY)
    } catch { /* ignore */ }
  },

  reorderOpenFiles: (files) => {
    set({ openFiles: files })
    try {
      localStorage.setItem(OPEN_FILES_KEY, JSON.stringify(files))
    } catch { /* ignore */ }
  },

  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => {
    set({
      settings,
      theme: settings.theme,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: settings.lineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      bellSound: settings.bellSound,
      scrollbackBuffer: settings.scrollbackBuffer,
      windowOpacity: settings.windowOpacity,
      confirmBeforeClose: settings.confirmBeforeClose,
      autoUpdate: settings.autoUpdate,
      claudeApiKey: settings.claudeApiKey,
      cliProvider: settings.cliProvider || 'claude',
      modelRuntime: settings.modelRuntime || 'api',
      localModel: settings.localModel || DEFAULT_LOCAL_MODEL,
      sessionContextEnabled: settings.sessionContextEnabled !== false,
      sessionContextDays: settings.sessionContextDays ?? 7,
      customThemes: settings.customThemes
    })
  },

  updateSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value }
    set({ settings, [key]: value })
    get().saveAllSettings()
  },

  settingsLoaded: false,
  setSettingsLoaded: (loaded) => set({ settingsLoaded: loaded }),

  // Individual settings with auto-save
  fontSize: 14,
  setFontSize: (fontSize) => {
    set({ fontSize })
    const settings = { ...get().settings, fontSize }
    set({ settings })
    get().saveAllSettings()
  },

  fontFamily: 'JetBrains Mono',
  setFontFamily: (fontFamily) => {
    set({ fontFamily })
    const settings = { ...get().settings, fontFamily }
    set({ settings })
    get().saveAllSettings()
  },

  lineHeight: 1.4,
  setLineHeight: (lineHeight) => {
    set({ lineHeight })
    const settings = { ...get().settings, lineHeight }
    set({ settings })
    get().saveAllSettings()
  },

  cursorStyle: 'block',
  setCursorStyle: (cursorStyle) => {
    set({ cursorStyle })
    const settings = { ...get().settings, cursorStyle }
    set({ settings })
    get().saveAllSettings()
  },

  cursorBlink: true,
  setCursorBlink: (cursorBlink) => {
    set({ cursorBlink })
    const settings = { ...get().settings, cursorBlink }
    set({ settings })
    get().saveAllSettings()
  },

  bellSound: false,
  setBellSound: (bellSound) => {
    set({ bellSound })
    const settings = { ...get().settings, bellSound }
    set({ settings })
    get().saveAllSettings()
  },

  scrollbackBuffer: 10000,
  setScrollbackBuffer: (scrollbackBuffer) => {
    set({ scrollbackBuffer })
    const settings = { ...get().settings, scrollbackBuffer }
    set({ settings })
    get().saveAllSettings()
  },

  windowOpacity: 1.0,
  setWindowOpacity: (windowOpacity) => {
    set({ windowOpacity })
    const settings = { ...get().settings, windowOpacity }
    set({ settings })
    window.api?.setWindowOpacity(windowOpacity)
    get().saveAllSettings()
  },

  confirmBeforeClose: true,
  setConfirmBeforeClose: (confirmBeforeClose) => {
    set({ confirmBeforeClose })
    const settings = { ...get().settings, confirmBeforeClose }
    set({ settings })
    get().saveAllSettings()
  },

  autoUpdate: true,
  setAutoUpdate: (autoUpdate) => {
    set({ autoUpdate })
    const settings = { ...get().settings, autoUpdate }
    set({ settings })
    get().saveAllSettings()
  },

  claudeApiKey: '',
  setClaudeApiKey: (claudeApiKey) => {
    set({ claudeApiKey })
    const settings = { ...get().settings, claudeApiKey }
    set({ settings })
    get().saveAllSettings()
  },

  cliProvider: 'claude' as CLIProvider,
  setCLIProvider: (cliProvider) => {
    set({ cliProvider })
    // Switching to an agent that cannot run locally must not leave the runtime
    // stuck on 'local' -- that combination has no valid launch command.
    const modelRuntime = supportsLocalRuntime(cliProvider) ? get().modelRuntime : 'api'
    const settings = { ...get().settings, cliProvider, modelRuntime }
    set({ settings, modelRuntime })
    get().saveAllSettings()
  },

  modelRuntime: 'api' as ModelRuntime,
  setModelRuntime: (modelRuntime) => {
    set({ modelRuntime })
    const settings = { ...get().settings, modelRuntime }
    set({ settings })
    get().saveAllSettings()
  },

  localModel: DEFAULT_LOCAL_MODEL,
  setLocalModel: (localModel) => {
    set({ localModel })
    const settings = { ...get().settings, localModel }
    set({ settings })
    get().saveAllSettings()
  },

  sessionContextEnabled: true,
  setSessionContextEnabled: (sessionContextEnabled) => {
    set({ sessionContextEnabled })
    const settings = { ...get().settings, sessionContextEnabled }
    set({ settings })
    get().saveAllSettings()
  },

  sessionContextDays: 7,
  setSessionContextDays: (sessionContextDays) => {
    set({ sessionContextDays })
    const settings = { ...get().settings, sessionContextDays }
    set({ settings })
    get().saveAllSettings()
  },

  customThemes: [],
  setCustomThemes: (customThemes) => {
    set({ customThemes })
    const settings = { ...get().settings, customThemes }
    set({ settings })
  },

  addCustomTheme: (theme) => {
    const customThemes = [...get().customThemes, theme]
    set({ customThemes })
    const settings = { ...get().settings, customThemes }
    set({ settings })
    get().saveAllSettings()
  },

  removeCustomTheme: (themeId) => {
    const customThemes = get().customThemes.filter(t => t.id !== themeId)
    set({ customThemes })
    const settings = { ...get().settings, customThemes }
    set({ settings })
    get().saveAllSettings()
  },

  initializeSettings: async () => {
    try {
      const settings = await window.api?.loadSettings()
      if (settings) {
        get().setSettings(settings)
        // Apply window opacity
        if (settings.windowOpacity !== 1.0) {
          window.api?.setWindowOpacity(settings.windowOpacity)
        }
      }
      set({ settingsLoaded: true })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ settingsLoaded: true })
    }
  },

  saveAllSettings: async () => {
    debouncedSave(async () => {
      try {
        const settings = get().settings
        await window.api?.saveSettings(settings)
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    })
  }
}))
