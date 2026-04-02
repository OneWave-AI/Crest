import { create } from 'zustand'
import type { LLMProvider, SafetyLevel, ActivityLogEntry, SuperAgentConfig } from '../../shared/types'

interface SessionStats {
  filesWritten: number
  filesRead: number
  testsPassed: number
  testsFailed: number
  errorsEncountered: number
  fastPathDecisions: number
  llmDecisions: number
}

const DEFAULT_SESSION_STATS: SessionStats = {
  filesWritten: 0,
  filesRead: 0,
  testsPassed: 0,
  testsFailed: 0,
  errorsEncountered: 0,
  fastPathDecisions: 0,
  llmDecisions: 0
}

interface SuperAgentState {
  // Running state
  isRunning: boolean
  isPaused: boolean
  task: string
  startTime: number | null
  timeLimit: number // minutes (0 = unlimited)
  safetyLevel: SafetyLevel
  projectFolder: string

  // Output tracking
  outputBuffer: string
  lastOutputTime: number
  isIdle: boolean

  // Activity log
  activityLog: ActivityLogEntry[]

  // Session stats
  sessionStats: SessionStats

  // Config
  config: SuperAgentConfig
  provider: LLMProvider

  // Terminal reference
  activeTerminalId: string | null

  // Actions
  setRunning: (running: boolean) => void
  setTask: (task: string) => void
  setTimeLimit: (minutes: number) => void
  setSafetyLevel: (level: SafetyLevel) => void
  setProvider: (provider: LLMProvider) => void
  setConfig: (config: SuperAgentConfig) => void
  setActiveTerminalId: (id: string | null) => void
  setProjectFolder: (folder: string) => void
  togglePause: () => void

  // Output handling
  appendOutput: (data: string) => void
  clearOutput: () => void
  markSent: (message: string) => void
  setIdle: (idle: boolean) => void

  // Logging
  addLog: (type: ActivityLogEntry['type'], message: string, detail?: string) => void
  clearLogs: () => void

  // Stats
  updateSessionStats: (stats: Partial<SessionStats>) => void

  // Session management
  startSession: (task: string, terminalId: string, projectFolder: string) => void
  stopSession: (status?: 'completed' | 'stopped' | 'error') => void
  reset: () => void
}

const DEFAULT_CONFIG: SuperAgentConfig = {
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  defaultProvider: 'groq',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe'
}

export const useSuperAgentStore = create<SuperAgentState>((set, get) => ({
  // Initial state - use DEFAULT_CONFIG immediately to prevent loading state
  isRunning: false,
  isPaused: false,
  task: '',
  startTime: null,
  timeLimit: 15,
  safetyLevel: 'safe',
  projectFolder: '',
  outputBuffer: '',
  lastOutputTime: 0,
  isIdle: false,
  activityLog: [],
  sessionStats: { ...DEFAULT_SESSION_STATS },
  config: DEFAULT_CONFIG,
  provider: 'groq',
  activeTerminalId: null,

  // Actions
  setRunning: (running) => set({ isRunning: running }),
  setTask: (task) => set({ task }),
  setTimeLimit: (minutes) => set({ timeLimit: minutes }),
  setSafetyLevel: (level) => set({ safetyLevel: level }),
  setProvider: (provider) => set({ provider }),
  setConfig: (config) => set({ config, provider: config.defaultProvider }),
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),
  setProjectFolder: (folder) => set({ projectFolder: folder }),
  togglePause: () => {
    const state = get()
    const newPaused = !state.isPaused
    // Log the pause/resume action - limit to 500 entries
    set((s) => ({
      isPaused: newPaused,
      activityLog: [
        ...s.activityLog.slice(-499),
        { timestamp: Date.now(), type: newPaused ? 'stop' : 'start', message: newPaused ? 'Agent paused' : 'Agent resumed' }
      ]
    }))
  },

  // Output handling - cap buffer at 100KB to prevent memory leaks
  appendOutput: (data) =>
    set((state) => {
      const MAX_BUFFER = 100_000 // 100KB max
      const newBuffer = state.outputBuffer + data
      return {
        outputBuffer: newBuffer.length > MAX_BUFFER
          ? newBuffer.slice(-MAX_BUFFER)
          : newBuffer,
        lastOutputTime: Date.now(),
        isIdle: false
      }
    }),

  clearOutput: () => set({ outputBuffer: '', isIdle: false }),

  markSent: (message) =>
    set((state) => {
      const MAX_BUFFER = 100_000
      const marker = `\n--- AGENT SENT: "${message}" ---\n`
      const newBuffer = state.outputBuffer + marker
      return {
        outputBuffer: newBuffer.length > MAX_BUFFER
          ? newBuffer.slice(-MAX_BUFFER)
          : newBuffer,
        isIdle: false
      }
    }),

  setIdle: (idle) => set({ isIdle: idle }),

  // Logging - limit to 500 entries to prevent memory leaks
  addLog: (type, message, detail?) =>
    set((state) => ({
      activityLog: [
        ...state.activityLog.slice(-499), // Keep last 499 + new = 500 max
        { timestamp: Date.now(), type, message, ...(detail ? { detail } : {}) }
      ]
    })),

  clearLogs: () => set({ activityLog: [] }),

  // Session stats
  updateSessionStats: (stats) =>
    set((state) => ({
      sessionStats: {
        ...state.sessionStats,
        ...Object.fromEntries(
          Object.entries(stats).map(([k, v]) => [k, Math.max(v as number, (state.sessionStats as unknown as Record<string, number>)[k] || 0)])
        )
      }
    })),

  // Session management
  startSession: (task, terminalId, projectFolder) =>
    set({
      isRunning: true,
      task,
      startTime: Date.now(),
      activeTerminalId: terminalId,
      projectFolder,
      outputBuffer: '',
      lastOutputTime: Date.now(),
      isIdle: false,
      sessionStats: { ...DEFAULT_SESSION_STATS },
      activityLog: [
        { timestamp: Date.now(), type: 'start', message: `Task started: ${task}` }
      ]
    }),

  stopSession: (status = 'stopped') => {
    const state = get()
    const endTime = Date.now()
    const duration = state.startTime ? Math.floor((endTime - state.startTime) / 1000) : 0

    // Add stop log entry
    const finalLog = [
      ...state.activityLog,
      { timestamp: endTime, type: 'stop' as const, message: `Super Agent ${status}` }
    ]

    // Save session to history
    if (state.startTime && state.task) {
      const session = {
        id: `sa_${state.startTime}_${Math.random().toString(36).substr(2, 9)}`,
        task: state.task,
        startTime: state.startTime,
        endTime,
        duration,
        status,
        activityLog: finalLog,
        provider: state.provider,
        projectFolder: state.projectFolder
      }
      // Save async - don't block
      window.api.saveSuperAgentSession(session).catch(err =>
        console.error('Failed to save Super Agent session:', err)
      )
    }

    set({
      isRunning: false,
      isPaused: false,
      startTime: null,
      activeTerminalId: null,
      isIdle: false,
      activityLog: finalLog
    })
  },

  reset: () =>
    set({
      isRunning: false,
      isPaused: false,
      task: '',
      startTime: null,
      timeLimit: 15,
      safetyLevel: 'safe',
      projectFolder: '',
      outputBuffer: '',
      lastOutputTime: 0,
      isIdle: false,
      activityLog: [],
      sessionStats: { ...DEFAULT_SESSION_STATS },
      activeTerminalId: null
    })
}))
