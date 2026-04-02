import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X, Monitor, Type, Palette, Keyboard, Info, Check, Download, Upload,
  Trash2, RefreshCw, Key, Bell, BellOff, Eye, EyeOff, Plus, Settings,
  AlertTriangle, ExternalLink, Loader2, FolderOpen, Sparkles, Zap, CheckCircle, Save
} from 'lucide-react'
import { useAppStore } from '../../store'
import type { CustomTheme, UpdateInfo, SuperAgentConfig, LLMProvider, SafetyLevel, CLIProvider } from '../../../shared/types'
import { CLI_PROVIDERS } from '../../../shared/providers'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

const BUILT_IN_THEMES = [
  { id: 'default', name: 'Default', bg: '#1a1a1a', accent: '#cc785c' },
  { id: 'pro', name: 'Pro', bg: '#1e1e1e', accent: '#569cd6' },
  { id: 'homebrew', name: 'Homebrew', bg: '#000000', accent: '#00ff00' },
  { id: 'ocean', name: 'Ocean', bg: '#1b2b34', accent: '#5fb3b3' },
  { id: 'dracula', name: 'Dracula', bg: '#282a36', accent: '#ff79c6' },
  { id: 'neon', name: 'Neon', bg: '#0a0a0f', accent: '#00ffff' },
  { id: 'aurora', name: 'Aurora', bg: '#0d0d0d', accent: '#ff9500' },
  { id: 'solarized', name: 'Solarized', bg: '#002b36', accent: '#b58900' },
  // New premium themes
  { id: 'midnight', name: 'Midnight', bg: '#0d1117', accent: '#58a6ff' },
  { id: 'ember', name: 'Ember', bg: '#1a1210', accent: '#ff6b35' },
  { id: 'matrix', name: 'Matrix', bg: '#0c0c0c', accent: '#00ff41' },
  { id: 'frost', name: 'Frost', bg: '#1e2a38', accent: '#a3c9f1' },
  { id: 'synthwave', name: 'Synthwave', bg: '#1a1a2e', accent: '#ff6bcb' },
  { id: 'tokyonight', name: 'Tokyo Night', bg: '#1a1b26', accent: '#7aa2f7' }
]

// Full theme presets for the theme creator
const THEME_PRESETS: Record<string, Omit<CustomTheme, 'id' | 'name'>> = {
  default: {
    background: '#1a1a1a', foreground: '#e0e0e0', accent: '#cc785c', cursor: '#cc785c', selection: '#3d3d3d',
    black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#6272a4', magenta: '#ff79c6', cyan: '#8be9fd', white: '#ffffff'
  },
  pro: {
    background: '#1e1e1e', foreground: '#d4d4d4', accent: '#569cd6', cursor: '#569cd6', selection: '#264f78',
    black: '#000000', red: '#f44747', green: '#6a9955', yellow: '#dcdcaa', blue: '#569cd6', magenta: '#c586c0', cyan: '#4ec9b0', white: '#d4d4d4'
  },
  dracula: {
    background: '#282a36', foreground: '#f8f8f2', accent: '#ff79c6', cursor: '#ff79c6', selection: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#6272a4', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2'
  },
  ocean: {
    background: '#1b2b34', foreground: '#c0c5ce', accent: '#5fb3b3', cursor: '#5fb3b3', selection: '#4f5b66',
    black: '#1b2b34', red: '#ec5f67', green: '#99c794', yellow: '#fac863', blue: '#6699cc', magenta: '#c594c5', cyan: '#5fb3b3', white: '#d8dee9'
  },
  neon: {
    background: '#0a0a0f', foreground: '#e0e0e0', accent: '#00ffff', cursor: '#00ffff', selection: '#1a1a2e',
    black: '#000000', red: '#ff0055', green: '#00ff88', yellow: '#ffff00', blue: '#00aaff', magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff'
  },
  homebrew: {
    background: '#000000', foreground: '#00ff00', accent: '#00ff00', cursor: '#00ff00', selection: '#003300',
    black: '#000000', red: '#990000', green: '#00ff00', yellow: '#999900', blue: '#0000b2', magenta: '#b200b2', cyan: '#00a6b2', white: '#bfbfbf'
  },
  solarized: {
    background: '#002b36', foreground: '#839496', accent: '#b58900', cursor: '#b58900', selection: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5'
  },
  // New premium themes
  midnight: {
    background: '#0d1117', foreground: '#c9d1d9', accent: '#58a6ff', cursor: '#58a6ff', selection: '#388bfd33',
    black: '#0d1117', red: '#ff7b72', green: '#7ee787', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#76e3ea', white: '#f0f6fc'
  },
  ember: {
    background: '#1a1210', foreground: '#e8d5c4', accent: '#ff6b35', cursor: '#ff6b35', selection: '#ff6b3533',
    black: '#1a1210', red: '#ff5252', green: '#9ccc65', yellow: '#ffb74d', blue: '#64b5f6', magenta: '#f48fb1', cyan: '#4dd0e1', white: '#fafafa'
  },
  matrix: {
    background: '#0c0c0c', foreground: '#00ff41', accent: '#00ff41', cursor: '#00ff41', selection: '#00ff4133',
    black: '#0c0c0c', red: '#ff0044', green: '#00ff41', yellow: '#fffc00', blue: '#00ccff', magenta: '#ff00ff', cyan: '#00ffff', white: '#f0fff0'
  },
  frost: {
    background: '#1e2a38', foreground: '#ecf0f1', accent: '#a3c9f1', cursor: '#a3c9f1', selection: '#a3c9f133',
    black: '#1e2a38', red: '#e74c3c', green: '#27ae60', yellow: '#f39c12', blue: '#3498db', magenta: '#9b59b6', cyan: '#1abc9c', white: '#ecf0f1'
  },
  synthwave: {
    background: '#1a1a2e', foreground: '#eee8ff', accent: '#ff6bcb', cursor: '#ff6bcb', selection: '#ff6bcb33',
    black: '#1a1a2e', red: '#ff5555', green: '#72f1b8', yellow: '#fede5d', blue: '#6fc3df', magenta: '#ff6bcb', cyan: '#72f1b8', white: '#f0f0f0'
  },
  tokyonight: {
    background: '#1a1b26', foreground: '#c0caf5', accent: '#7aa2f7', cursor: '#c0caf5', selection: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#c0caf5'
  }
}

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'SF Mono',
  'Menlo',
  'Monaco',
  'Source Code Pro'
]

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20]
const LINE_HEIGHTS = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0]
const SCROLLBACK_SIZES = [1000, 5000, 10000, 25000, 50000, 100000]

type SectionType = 'appearance' | 'terminal' | 'behavior' | 'api' | 'superagent' | 'data' | 'shortcuts' | 'about'

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    theme, setTheme,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    lineHeight, setLineHeight,
    cursorStyle, setCursorStyle,
    cursorBlink, setCursorBlink,
    bellSound, setBellSound,
    scrollbackBuffer, setScrollbackBuffer,
    windowOpacity, setWindowOpacity,
    confirmBeforeClose, setConfirmBeforeClose,
    autoUpdate, setAutoUpdate,
    claudeApiKey, setClaudeApiKey,
    cliProvider, setCLIProvider,
    sessionContextEnabled, setSessionContextEnabled,
    sessionContextDays, setSessionContextDays,
    customThemes, addCustomTheme, removeCustomTheme,
    initializeSettings, settings
  } = useAppStore()

  const [activeSection, setActiveSection] = useState<SectionType>('appearance')
  const [showApiKey, setShowApiKey] = useState(false)
  const [appVersion, setAppVersion] = useState('2.0.0')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showThemeCreator, setShowThemeCreator] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>('default')
  const [newTheme, setNewTheme] = useState<CustomTheme>({
    id: '',
    name: '',
    background: '#1a1a1a',
    foreground: '#ffffff',
    accent: '#cc785c',
    cursor: '#cc785c',
    selection: '#3d3d3d',
    black: '#000000',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#ffffff'
  })
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Local state for API key input (sync on blur only - prevents freeze)
  const [localApiKey, setLocalApiKey] = useState(claudeApiKey)

  // Super Agent state
  const [superAgentConfig, setSuperAgentConfig] = useState<SuperAgentConfig | null>(null)
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [savingSuperAgent, setSavingSuperAgent] = useState(false)
  const [superAgentSaved, setSuperAgentSaved] = useState(false)

  // Sync local API key when store changes (e.g., on initial load)
  useEffect(() => {
    setLocalApiKey(claudeApiKey)
  }, [claudeApiKey])

  useEffect(() => {
    if (isOpen) {
      initializeSettings()
      window.api?.getAppVersion().then(setAppVersion)

      // Default Super Agent config
      const defaultConfig: SuperAgentConfig = {
        groqApiKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        openaiApiKey: '',
        openaiModel: 'gpt-4o-mini',
        defaultProvider: 'groq',
        idleTimeout: 5,
        maxDuration: 30,
        defaultSafetyLevel: 'safe'
      }

      // Set default immediately to prevent stuck loading
      setSuperAgentConfig(defaultConfig)

      // Then try to load saved config and overwrite
      if (window.api?.loadSuperAgentConfig) {
        window.api.loadSuperAgentConfig()
          .then((config) => {
            if (config) {
              setSuperAgentConfig(config)
            }
          })
          .catch((err) => {
            console.error('Failed to load Super Agent config:', err)
          })
      }
    }
  }, [isOpen, initializeSettings])

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  // Simple visibility state - no complex animations
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => setIsVisible(true))
    } else {
      setIsVisible(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const allThemes = [
    ...BUILT_IN_THEMES,
    ...customThemes.map(t => ({ id: t.id, name: t.name, bg: t.background, accent: t.accent }))
  ]

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true)
    try {
      const info = await window.api?.checkForUpdates()
      setUpdateInfo(info || null)
      if (info && !info.hasUpdate && !info.error) {
        setStatusMessage({ type: 'success', text: 'You are running the latest version!' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to check for updates' })
    }
    setIsCheckingUpdate(false)
  }

  const handleExportSettings = async () => {
    try {
      const result = await window.api?.exportSettings()
      if (result?.success) {
        setStatusMessage({ type: 'success', text: 'Settings exported successfully!' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to export settings' })
    }
  }

  const handleImportSettings = async () => {
    try {
      const result = await window.api?.importSettings()
      if (result?.success && result.settings) {
        useAppStore.getState().setSettings(result.settings)
        setStatusMessage({ type: 'success', text: 'Settings imported successfully!' })
      } else if (result?.error) {
        setStatusMessage({ type: 'error', text: result.error })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to import settings' })
    }
  }

  const handleResetToDefaults = async () => {
    try {
      const defaults = await window.api?.resetSettings()
      if (defaults) {
        useAppStore.getState().setSettings(defaults)
        setStatusMessage({ type: 'success', text: 'Settings reset to defaults!' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to reset settings' })
    }
    setShowResetConfirm(false)
  }

  const handleClearAllData = async () => {
    try {
      const result = await window.api?.clearAllData()
      if (result?.success) {
        setStatusMessage({ type: 'success', text: 'All data cleared! Restart the app for changes to take effect.' })
      } else {
        setStatusMessage({ type: 'error', text: result?.error || 'Failed to clear data' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to clear data' })
    }
    setShowClearConfirm(false)
  }

  const handleSaveCustomTheme = async () => {
    if (!newTheme.name.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a theme name' })
      return
    }

    const themeToSave = {
      ...newTheme,
      id: newTheme.id || `custom-${Date.now()}`
    }

    try {
      await window.api?.saveCustomTheme(themeToSave)
      addCustomTheme(themeToSave)
      setShowThemeCreator(false)
      setNewTheme({
        id: '',
        name: '',
        background: '#1a1a1a',
        foreground: '#ffffff',
        accent: '#cc785c',
        cursor: '#cc785c',
        selection: '#3d3d3d',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#ffffff'
      })
      setStatusMessage({ type: 'success', text: 'Custom theme saved!' })
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to save theme' })
    }
  }

  const handleDeleteCustomTheme = async (themeId: string) => {
    try {
      await window.api?.deleteCustomTheme(themeId)
      removeCustomTheme(themeId)
      if (theme === themeId) {
        setTheme('default')
      }
      setStatusMessage({ type: 'success', text: 'Theme deleted!' })
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to delete theme' })
    }
  }

  const renderToggle = (
    enabled: boolean,
    onChange: (value: boolean) => void,
    label: string,
    description?: string
  ) => (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div>
        <div className="text-sm text-white">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-1">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-[#cc785c]' : 'bg-white/10'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  )

  const renderSlider = (
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
    label: string,
    formatValue?: (value: number) => string
  ) => (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-white">{label}</div>
        <div className="text-sm text-[#cc785c] font-medium">
          {formatValue ? formatValue(value) : value}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[#cc785c]
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={`fixed inset-y-0 right-0 w-[540px] bg-[#0d0d0d] border-l border-white/[0.06] z-50 flex flex-col shadow-2xl transition-transform duration-200 ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 id="settings-title" className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors focus-ring"
            aria-label="Close settings"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm animate-fade-in-up ${
            statusMessage.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20 animate-shake-subtle'
          }`}>
            {statusMessage.text}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <nav className="w-44 border-r border-white/[0.06] py-4" aria-label="Settings sections">
            <div className="space-y-1 px-3" role="tablist" aria-orientation="vertical">
              {[
                { id: 'appearance', icon: Palette, label: 'Appearance' },
                { id: 'terminal', icon: Monitor, label: 'Terminal' },
                { id: 'behavior', icon: Settings, label: 'Behavior' },
                { id: 'api', icon: Key, label: 'API' },
                { id: 'superagent', icon: Zap, label: 'Super Agent' },
                { id: 'data', icon: FolderOpen, label: 'Data' },
                { id: 'shortcuts', icon: Keyboard, label: 'Shortcuts' },
                { id: 'about', icon: Info, label: 'About' }
              ].map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={activeSection === item.id}
                  aria-controls={`settings-panel-${item.id}`}
                  id={`settings-tab-${item.id}`}
                  onClick={() => setActiveSection(item.id as SectionType)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    activeSection === item.id
                      ? 'bg-[#cc785c]/15 text-[#cc785c]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="space-y-8">
                {/* Theme Selection */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white">Terminal Theme</h3>
                    <button
                      onClick={() => setShowThemeCreator(true)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#cc785c]/10 text-[#cc785c] text-xs font-medium hover:bg-[#cc785c]/20 transition-colors"
                    >
                      <Plus size={14} />
                      Create Theme
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {allThemes.map((t) => {
                      const isCustom = customThemes.some(ct => ct.id === t.id)
                      return (
                        <div key={t.id} className="relative group">
                          <button
                            onClick={() => setTheme(t.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                              theme === t.id
                                ? 'border-[#cc785c] bg-[#cc785c]/10'
                                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'
                            }`}
                          >
                            <div
                              className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center"
                              style={{ backgroundColor: t.bg }}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: t.accent }}
                              />
                            </div>
                            <span className="text-sm text-white">{t.name}</span>
                            {theme === t.id && (
                              <Check size={16} className="absolute right-3 text-[#cc785c]" />
                            )}
                          </button>
                          {isCustom && (
                            <button
                              onClick={() => handleDeleteCustomTheme(t.id)}
                              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Window Opacity */}
                {renderSlider(
                  windowOpacity,
                  0.5,
                  1.0,
                  0.05,
                  setWindowOpacity,
                  'Window Opacity',
                  (v) => `${Math.round(v * 100)}%`
                )}

                {/* Custom Theme Creator Modal - Redesigned */}
                {showThemeCreator && (
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141416] rounded-2xl border border-white/[0.08] w-[680px] max-h-[90vh] overflow-hidden shadow-2xl">
                      {/* Header */}
                      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-[#1a1a1c] to-[#141416]">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Sparkles size={18} className="text-[#cc785c]" />
                          Create Custom Theme
                        </h3>
                        <button
                          onClick={() => setShowThemeCreator(false)}
                          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                        {/* Theme Name */}
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-2">Theme Name</label>
                          <input
                            type="text"
                            value={newTheme.name}
                            onChange={(e) => setNewTheme({ ...newTheme, name: e.target.value })}
                            placeholder="My Custom Theme"
                            className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.06] text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#cc785c]/50 focus:ring-1 focus:ring-[#cc785c]/20"
                          />
                        </div>

                        {/* Start From Preset */}
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-3">Start From</label>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(THEME_PRESETS).map(([presetId, preset]) => (
                              <button
                                key={presetId}
                                onClick={() => {
                                  setSelectedPreset(presetId)
                                  setNewTheme({ ...newTheme, ...preset })
                                }}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                                  selectedPreset === presetId
                                    ? 'bg-[#cc785c] text-white ring-2 ring-[#cc785c]/50'
                                    : 'bg-black/30 text-gray-400 hover:bg-white/[0.06] hover:text-white border border-white/[0.06]'
                                }`}
                              >
                                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.background }} />
                                {presetId.charAt(0).toUpperCase() + presetId.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Color Sections */}
                        <div className="grid grid-cols-2 gap-6">
                          {/* UI Colors */}
                          <div className="space-y-3">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">UI Colors</div>
                            <div className="space-y-2 p-4 rounded-xl bg-black/20 border border-white/[0.04]">
                              {[
                                { key: 'background', label: 'Background' },
                                { key: 'foreground', label: 'Text' },
                                { key: 'accent', label: 'Accent' },
                                { key: 'cursor', label: 'Cursor' },
                                { key: 'selection', label: 'Selection' }
                              ].map(({ key, label }) => (
                                <div key={key} className="flex items-center gap-3">
                                  <div className="relative">
                                    <input
                                      type="color"
                                      value={newTheme[key as keyof CustomTheme] as string}
                                      onChange={(e) => setNewTheme({ ...newTheme, [key]: e.target.value })}
                                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/10 hover:border-white/20 transition-colors"
                                      style={{ backgroundColor: newTheme[key as keyof CustomTheme] as string }}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-xs text-gray-300">{label}</div>
                                    <input
                                      type="text"
                                      value={newTheme[key as keyof CustomTheme] as string}
                                      onChange={(e) => setNewTheme({ ...newTheme, [key]: e.target.value })}
                                      className="w-full text-[10px] text-gray-500 font-mono bg-transparent border-none focus:outline-none focus:text-gray-400"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Terminal Colors */}
                          <div className="space-y-3">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Terminal Colors</div>
                            <div className="p-4 rounded-xl bg-black/20 border border-white/[0.04]">
                              <div className="grid grid-cols-4 gap-2">
                                {[
                                  { key: 'black', label: 'Blk' },
                                  { key: 'red', label: 'Red' },
                                  { key: 'green', label: 'Grn' },
                                  { key: 'yellow', label: 'Yel' },
                                  { key: 'blue', label: 'Blu' },
                                  { key: 'magenta', label: 'Mag' },
                                  { key: 'cyan', label: 'Cyn' },
                                  { key: 'white', label: 'Wht' }
                                ].map(({ key, label }) => (
                                  <div key={key} className="flex flex-col items-center gap-1">
                                    <input
                                      type="color"
                                      value={newTheme[key as keyof CustomTheme] as string}
                                      onChange={(e) => setNewTheme({ ...newTheme, [key]: e.target.value })}
                                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/10 hover:border-white/20 transition-colors"
                                      style={{ backgroundColor: newTheme[key as keyof CustomTheme] as string }}
                                    />
                                    <span className="text-[9px] text-gray-500">{label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Live Preview */}
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Preview</div>
                          <div
                            className="rounded-xl border border-white/[0.08] overflow-hidden font-mono text-sm"
                            style={{ backgroundColor: newTheme.background }}
                          >
                            {/* Terminal header bar */}
                            <div className="flex items-center gap-2 px-4 py-2 bg-black/30 border-b border-white/[0.06]">
                              <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                                <div className="w-3 h-3 rounded-full bg-[#27ca40]" />
                              </div>
                              <span className="text-xs text-gray-500 ml-2">Terminal Preview</span>
                            </div>
                            {/* Terminal content */}
                            <div className="p-4 space-y-1.5 text-[13px] leading-relaxed">
                              <div style={{ color: newTheme.foreground }}>
                                <span style={{ color: newTheme.accent }}>❯</span> claude
                              </div>
                              <div style={{ color: newTheme.cyan }}>╭───────────────────────────────────────────╮</div>
                              <div style={{ color: newTheme.cyan }}>│</div>
                              <div style={{ color: newTheme.foreground }}>
                                <span style={{ color: newTheme.cyan }}>│</span>  Welcome to <span style={{ color: newTheme.accent }}>Claude Code</span>!
                              </div>
                              <div style={{ color: newTheme.cyan }}>│</div>
                              <div style={{ color: newTheme.cyan }}>╰───────────────────────────────────────────╯</div>
                              <div style={{ color: newTheme.foreground }} className="mt-2">
                                <span style={{ color: newTheme.accent }}>❯</span> npm install
                              </div>
                              <div style={{ color: newTheme.foreground }}>added 245 packages in 3.2s</div>
                              <div style={{ color: newTheme.green }}>✓ Dependencies installed successfully</div>
                              <div style={{ color: newTheme.yellow }}>⚠ 2 moderate vulnerabilities found</div>
                              <div style={{ color: newTheme.red }}>✗ Error: Missing required configuration</div>
                              <div style={{ color: newTheme.foreground }} className="mt-2">
                                <span style={{ color: newTheme.accent }}>❯</span> <span style={{ backgroundColor: newTheme.cursor, color: newTheme.background }} className="px-0.5">▌</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-black/20">
                        <button
                          onClick={() => setShowThemeCreator(false)}
                          className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveCustomTheme}
                          className="px-5 py-2.5 rounded-xl text-sm bg-[#cc785c] text-white hover:bg-[#b86a50] transition-colors flex items-center gap-2"
                        >
                          <Save size={14} />
                          Save Theme
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Terminal Section */}
            {activeSection === 'terminal' && (
              <div className="space-y-6">
                {/* Font Family */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Font Family</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_FAMILIES.map((family) => (
                      <button
                        key={family}
                        onClick={() => setFontFamily(family)}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          fontFamily === family
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                        style={{ fontFamily: family }}
                      >
                        {family}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Font Size</h3>
                  <div className="flex flex-wrap gap-2">
                    {FONT_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => setFontSize(size)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          fontSize === size
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {size}px
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line Height */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Line Height</h3>
                  <div className="flex flex-wrap gap-2">
                    {LINE_HEIGHTS.map((height) => (
                      <button
                        key={height}
                        onClick={() => setLineHeight(height)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          lineHeight === height
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {height}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cursor Style */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Cursor Style</h3>
                  <div className="flex gap-2">
                    {(['block', 'underline', 'bar'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setCursorStyle(style)}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                          cursorStyle === style
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cursor Blink */}
                {renderToggle(cursorBlink, setCursorBlink, 'Cursor Blink', 'Enable blinking cursor animation')}

                {/* Bell Sound */}
                {renderToggle(bellSound, setBellSound, 'Bell Sound', 'Play sound on terminal bell character')}

                {/* Scrollback Buffer */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Scrollback Buffer</h3>
                  <div className="flex flex-wrap gap-2">
                    {SCROLLBACK_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => setScrollbackBuffer(size)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          scrollbackBuffer === size
                            ? 'bg-[#cc785c] text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {size >= 1000 ? `${size / 1000}k` : size}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Number of lines to keep in terminal history</p>
                </div>

                {/* Font Preview */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Preview</h3>
                  <div
                    className="p-4 rounded-xl bg-[#1a1a1a] border border-white/[0.06]"
                    style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }}
                  >
                    <div className="text-gray-400">$ claude</div>
                    <div className="text-green-400">Welcome to Claude Code!</div>
                    <div className="text-gray-500">Type your message...</div>
                  </div>
                </div>
              </div>
            )}

            {/* Behavior Section */}
            {activeSection === 'behavior' && (
              <div className="space-y-6">
                <h3 className="text-sm font-medium text-white mb-4">Default CLI Provider</h3>
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Choose the default CLI for new terminal tabs. You can override per-tab from the + menu.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.values(CLI_PROVIDERS) as import('../../../shared/types').CLIProviderConfig[]).map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setCLIProvider(provider.id)}
                        className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-all ${
                          cliProvider === provider.id
                            ? 'border-[#cc785c] bg-[#cc785c]/10'
                            : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-sm font-semibold text-white">{provider.name}</span>
                          {cliProvider === provider.id && (
                            <CheckCircle size={14} className="text-[#cc785c] ml-auto" />
                          )}
                        </div>
                        <span className="text-[11px] text-gray-500">{provider.binaryName} CLI</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {provider.models.map((m) => (
                            <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400">{m.name}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-6" />
                <h3 className="text-sm font-medium text-white mb-4">Tab Behavior</h3>
                {renderToggle(
                  confirmBeforeClose,
                  setConfirmBeforeClose,
                  'Confirm Before Close',
                  'Ask for confirmation before closing tabs with active sessions'
                )}

                <h3 className="text-sm font-medium text-white mb-4 mt-8">Updates</h3>
                {renderToggle(
                  autoUpdate,
                  setAutoUpdate,
                  'Auto-Update',
                  'Automatically check for and install updates'
                )}

                <button
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                </button>

                {updateInfo && updateInfo.hasUpdate && (
                  <div className="p-4 rounded-xl bg-[#cc785c]/10 border border-[#cc785c]/20">
                    <div className="flex items-center gap-2 text-[#cc785c] mb-2">
                      <Sparkles size={16} />
                      <span className="font-medium">Update Available!</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      Version {updateInfo.latestVersion} is available (you have {updateInfo.currentVersion})
                    </p>
                    {updateInfo.releaseUrl && (
                      <button
                        onClick={() => window.api?.openUrlExternal(updateInfo.releaseUrl!)}
                        className="flex items-center gap-2 text-sm text-[#cc785c] hover:underline"
                      >
                        <ExternalLink size={14} />
                        View Release Notes
                      </button>
                    )}
                  </div>
                )}

                <div className="border-t border-white/[0.06] pt-6" />
                <h3 className="text-sm font-medium text-white mb-4">Session Context</h3>
                {renderToggle(
                  sessionContextEnabled,
                  setSessionContextEnabled,
                  'Include Recent Activity Context',
                  'Auto-generate context about recent work when starting new sessions'
                )}

                {sessionContextEnabled && (
                  <div className="mt-4">
                    <label className="block text-sm text-gray-400 mb-2">History Window</label>
                    <div className="flex gap-2">
                      {[7, 14, 30].map((d) => (
                        <button
                          key={d}
                          onClick={() => setSessionContextDays(d)}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            sessionContextDays === d
                              ? 'bg-[#cc785c] text-white'
                              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {d} days
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* API Section */}
            {activeSection === 'api' && (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-400">
                    Configure your Claude API key if you want to use the API directly instead of the CLI.
                    This is optional if you have the Claude CLI installed and authenticated.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Claude API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                      onBlur={() => {
                        if (localApiKey !== claudeApiKey) {
                          setClaudeApiKey(localApiKey)
                        }
                      }}
                      placeholder="sk-ant-..."
                      className="w-full px-4 py-3 pr-12 rounded-lg bg-white/5 border border-white/[0.06] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#cc785c]/50 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-white"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Your API key is stored locally and never sent anywhere except to Anthropic servers.
                  </p>
                </div>

                <button
                  onClick={() => window.api?.openUrlExternal('https://console.anthropic.com/settings/keys')}
                  className="flex items-center gap-2 text-sm text-[#cc785c] hover:underline"
                >
                  <ExternalLink size={14} />
                  Get API Key from Anthropic Console
                </button>
              </div>
            )}

            {/* Super Agent Section */}
            {activeSection === 'superagent' && (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Super Agent Mode</h3>
                    <p className="text-xs text-purple-300/70">Configure LLM providers for autonomous operation</p>
                  </div>
                </div>

                {superAgentConfig && (
                  <>
                    {/* Groq Section */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          Groq API (Fast)
                        </h4>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            window.api?.openUrlExternal('https://console.groq.com/keys')
                          }}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Get API Key →
                        </a>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-2">API Key</label>
                          <div className="relative">
                            <input
                              type={showGroqKey ? 'text' : 'password'}
                              value={superAgentConfig.groqApiKey}
                              onChange={(e) => {
                                setSuperAgentConfig({ ...superAgentConfig, groqApiKey: e.target.value })
                                setSuperAgentSaved(false)
                              }}
                              placeholder="gsk_..."
                              className="w-full px-4 py-2.5 pr-12 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/50 font-mono"
                            />
                            <button
                              onClick={() => setShowGroqKey(!showGroqKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-500 hover:text-gray-300"
                            >
                              {showGroqKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Model</label>
                          <select
                            value={superAgentConfig.groqModel}
                            onChange={(e) => {
                              setSuperAgentConfig({ ...superAgentConfig, groqModel: e.target.value })
                              setSuperAgentSaved(false)
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm focus:outline-none focus:border-purple-500/50"
                          >
                            <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Recommended)</option>
                            <option value="llama-3.1-70b-versatile">Llama 3.1 70B</option>
                            <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
                            <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* OpenAI Section */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          OpenAI API
                        </h4>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            window.api?.openUrlExternal('https://platform.openai.com/api-keys')
                          }}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Get API Key →
                        </a>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-2">API Key</label>
                          <div className="relative">
                            <input
                              type={showOpenAIKey ? 'text' : 'password'}
                              value={superAgentConfig.openaiApiKey}
                              onChange={(e) => {
                                setSuperAgentConfig({ ...superAgentConfig, openaiApiKey: e.target.value })
                                setSuperAgentSaved(false)
                              }}
                              placeholder="sk-..."
                              className="w-full px-4 py-2.5 pr-12 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/50 font-mono"
                            />
                            <button
                              onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-500 hover:text-gray-300"
                            >
                              {showOpenAIKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Model</label>
                          <select
                            value={superAgentConfig.openaiModel}
                            onChange={(e) => {
                              setSuperAgentConfig({ ...superAgentConfig, openaiModel: e.target.value })
                              setSuperAgentSaved(false)
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm focus:outline-none focus:border-purple-500/50"
                          >
                            <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Default Provider */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <label className="block text-xs text-gray-500 mb-3">Default Provider</label>
                      <div className="flex gap-2">
                        {(['groq', 'openai'] as LLMProvider[]).map((provider) => (
                          <button
                            key={provider}
                            onClick={() => {
                              setSuperAgentConfig({ ...superAgentConfig, defaultProvider: provider })
                              setSuperAgentSaved(false)
                            }}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors text-sm ${
                              superAgentConfig.defaultProvider === provider
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                : 'bg-black/30 text-gray-400 hover:bg-black/50 hover:text-white'
                            }`}
                          >
                            {provider === 'groq' ? 'Groq (Fast)' : 'OpenAI'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Advanced Settings */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <h4 className="text-sm font-medium text-white mb-4">Advanced Settings</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Idle Detection Timeout</label>
                          <select
                            value={superAgentConfig.idleTimeout}
                            onChange={(e) => {
                              setSuperAgentConfig({ ...superAgentConfig, idleTimeout: parseInt(e.target.value) })
                              setSuperAgentSaved(false)
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm focus:outline-none focus:border-purple-500/50"
                          >
                            <option value={3}>3 seconds</option>
                            <option value={5}>5 seconds (Recommended)</option>
                            <option value={8}>8 seconds</option>
                            <option value={10}>10 seconds</option>
                          </select>
                          <p className="text-xs text-gray-600 mt-1">How long to wait before considering Claude idle</p>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Default Safety Level</label>
                          <select
                            value={superAgentConfig.defaultSafetyLevel}
                            onChange={(e) => {
                              setSuperAgentConfig({ ...superAgentConfig, defaultSafetyLevel: e.target.value as SafetyLevel })
                              setSuperAgentSaved(false)
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.06] text-white text-sm focus:outline-none focus:border-purple-500/50"
                          >
                            <option value="safe">Safe - Block dangerous commands</option>
                            <option value="moderate">Moderate - Allow with caution</option>
                            <option value="yolo">YOLO - No restrictions</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={async () => {
                        setSavingSuperAgent(true)
                        const result = await window.api?.saveSuperAgentConfig(superAgentConfig)
                        setSavingSuperAgent(false)
                        if (result?.success) {
                          setSuperAgentSaved(true)
                          setStatusMessage({ type: 'success', text: 'Super Agent settings saved!' })
                          setTimeout(() => setSuperAgentSaved(false), 2000)
                        } else {
                          setStatusMessage({ type: 'error', text: 'Failed to save settings' })
                        }
                      }}
                      disabled={savingSuperAgent}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {superAgentSaved ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Saved!
                        </>
                      ) : savingSuperAgent ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Settings
                        </>
                      )}
                    </button>
                  </>
                )}

                {!superAgentConfig && (
                  <div className="text-center py-8 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading settings...
                  </div>
                )}
              </div>
            )}

            {/* Data Section */}
            {activeSection === 'data' && (
              <div className="space-y-6">
                {/* Export/Import */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Settings Backup</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={handleExportSettings}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Download size={16} />
                      <span>Export Settings</span>
                    </button>
                    <button
                      onClick={handleImportSettings}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Upload size={16} />
                      <span>Import Settings</span>
                    </button>
                  </div>
                </div>

                {/* Reset to Defaults */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Reset Settings</h3>
                  {showResetConfirm ? (
                    <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-center gap-2 text-yellow-400 mb-3">
                        <AlertTriangle size={16} />
                        <span className="font-medium">Confirm Reset</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-4">
                        This will reset all settings to their default values. Your custom themes will be preserved.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowResetConfirm(false)}
                          className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleResetToDefaults}
                          className="flex-1 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <RefreshCw size={16} />
                      <span>Reset to Defaults</span>
                    </button>
                  )}
                </div>

                {/* Clear All Data */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Clear Data</h3>
                  {showClearConfirm ? (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2 text-red-400 mb-3">
                        <AlertTriangle size={16} />
                        <span className="font-medium">Danger Zone</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-4">
                        This will delete all app data including settings, themes, and cached data.
                        This action cannot be undone. You will need to restart the app.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleClearAllData}
                          className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Clear All Data
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 size={16} />
                      <span>Clear All Data</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Shortcuts Section */}
            {activeSection === 'shortcuts' && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white mb-4">Keyboard Shortcuts</h3>
                <div className="space-y-2">
                  {[
                    { keys: ['Cmd', 'P'], action: 'Command Palette' },
                    { keys: ['Cmd', 'O'], action: 'Quick Open File' },
                    { keys: ['Cmd', 'Enter'], action: 'Start Session' },
                    { keys: ['Cmd', '\\'], action: 'Toggle Split View' },
                    { keys: ['Cmd', 'Shift', 'T'], action: 'New Terminal Tab' },
                    { keys: ['Cmd', 'Shift', 'C'], action: 'Git Commit' },
                    { keys: ['Cmd', 'K'], action: 'Clear Terminal' },
                    { keys: ['Cmd', 'R'], action: 'Refresh Files' },
                    { keys: ['Cmd', ','], action: 'Open Settings' },
                    { keys: ['Cmd', '1-9'], action: 'Switch Project' },
                    { keys: ['Alt', 'Cmd', 'Right'], action: 'Expand All' },
                    { keys: ['Alt', 'Cmd', 'Left'], action: 'Collapse All' }
                  ].map((shortcut, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <span className="text-sm text-gray-400">{shortcut.action}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, j) => (
                          <kbd
                            key={j}
                            className="px-2 py-1 rounded bg-white/10 text-xs text-white font-medium"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* About Section */}
            {activeSection === 'about' && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  {/* Logo */}
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2d2d2d] to-[#0a0a0a] mb-4 shadow-lg">
                    <svg width="48" height="48" viewBox="0 0 80 44">
                      <defs>
                        <linearGradient id="aboutLogoAccent" x1="0" y1="0" x2="80" y2="44" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" style={{ stopColor: '#cc785c' }} />
                          <stop offset="100%" style={{ stopColor: '#e8956e' }} />
                        </linearGradient>
                      </defs>
                      {/* Wave crest made of dots */}
                      <circle cx="4" cy="32" r="2.5" fill="url(#aboutLogoAccent)" opacity="0.5" />
                      <circle cx="12" cy="26" r="2.8" fill="url(#aboutLogoAccent)" opacity="0.6" />
                      <circle cx="21" cy="18" r="3.1" fill="url(#aboutLogoAccent)" opacity="0.7" />
                      <circle cx="30" cy="10" r="3.4" fill="url(#aboutLogoAccent)" opacity="0.85" />
                      <circle cx="40" cy="5" r="3.8" fill="url(#aboutLogoAccent)" opacity="1" />
                      <circle cx="50" cy="10" r="3.4" fill="url(#aboutLogoAccent)" opacity="0.85" />
                      <circle cx="59" cy="18" r="3.1" fill="url(#aboutLogoAccent)" opacity="0.7" />
                      <circle cx="68" cy="26" r="2.8" fill="url(#aboutLogoAccent)" opacity="0.6" />
                      <circle cx="76" cy="32" r="2.5" fill="url(#aboutLogoAccent)" opacity="0.5" />
                      {/* Subtle secondary wave */}
                      <circle cx="10" cy="40" r="1.8" fill="url(#aboutLogoAccent)" opacity="0.2" />
                      <circle cx="25" cy="36" r="2" fill="url(#aboutLogoAccent)" opacity="0.25" />
                      <circle cx="40" cy="34" r="2.2" fill="url(#aboutLogoAccent)" opacity="0.3" />
                      <circle cx="55" cy="36" r="2" fill="url(#aboutLogoAccent)" opacity="0.25" />
                      <circle cx="70" cy="40" r="1.8" fill="url(#aboutLogoAccent)" opacity="0.2" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-1">Crest</h2>
                  <p className="text-gray-500 text-sm mb-4">The Premium Desktop Experience for AI Coding Agents</p>
                  <span className="inline-block px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">
                    Version {appVersion}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-xs text-gray-500 mb-1">Built with</div>
                    <div className="text-sm text-white">Electron + React + TypeScript</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-xs text-gray-500 mb-1">License</div>
                    <div className="text-sm text-white">MIT License</div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={isCheckingUpdate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/5 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {isCheckingUpdate ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
