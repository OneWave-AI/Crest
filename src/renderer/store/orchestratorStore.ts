import { create } from 'zustand'
import type { CLIProvider, LLMProvider, SafetyLevel, ActivityLogEntry, SuperAgentConfig } from '../../shared/types'

export type OrchestratorMode = 'split' | 'parallel'

export interface TerminalAgentState {
  terminalId: string
  tabId: string
  panelId: string
  /**
   * Which CLI harness is actually running in this PTY. Per-terminal because a
   * swarm can mix agents (Claude in one panel, Codex in the next) and every
   * busy/idle decision is made with that agent's own prompt and status
   * patterns -- a single global here silently parses one TUI with another's
   * regexes.
   */
  cliProvider: CLIProvider
  task: string
  status: 'pending' | 'running' | 'idle' | 'completed' | 'error'
  outputBuffer: string
  lastOutputTime: number
  isIdle: boolean
  taskSent: boolean
  lastResponse: string
  consecutiveWaits: number
  activityLog: ActivityLogEntry[]
  sessionStats: SessionStats
}

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

export interface DecomposedTask {
  terminalId: string
  task: string
  order: number
}

interface OrchestratorState {
  // Global state
  isRunning: boolean
  isPaused: boolean
  mode: OrchestratorMode
  masterTask: string
  startTime: number | null
  timeLimit: number
  safetyLevel: SafetyLevel
  projectFolder: string
  provider: LLMProvider
  config: SuperAgentConfig

  // Per-terminal state
  terminals: Map<string, TerminalAgentState>

  // Coordination
  coordinatorLog: ActivityLogEntry[]
  decomposedTasks: DecomposedTask[]

  // Actions - global
  setMode: (mode: OrchestratorMode) => void
  setProvider: (provider: LLMProvider) => void
  setTimeLimit: (minutes: number) => void
  setSafetyLevel: (level: SafetyLevel) => void
  setConfig: (config: SuperAgentConfig) => void
  togglePause: () => void

  // Actions - terminal management
  addTerminal: (id: string, state: Partial<TerminalAgentState>) => void
  removeTerminal: (id: string) => void
  updateTerminalState: (id: string, updates: Partial<TerminalAgentState>) => void
  appendTerminalOutput: (id: string, data: string) => void
  markTerminalSent: (id: string, message: string) => void
  addTerminalLog: (id: string, type: ActivityLogEntry['type'], message: string, detail?: string) => void
  updateTerminalStats: (id: string, stats: Partial<SessionStats>) => void

  // Actions - coordination
  addCoordinatorLog: (type: ActivityLogEntry['type'], message: string, detail?: string) => void
  setDecomposedTasks: (tasks: DecomposedTask[]) => void

  // Actions - session management
  startSession: (masterTask: string, mode: OrchestratorMode, projectFolder: string) => void
  stopSession: (status?: 'completed' | 'stopped' | 'error') => void
  reset: () => void
}

const DEFAULT_CONFIG: SuperAgentConfig = {
  ollamaModel: 'qwen3-coder:30b',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  defaultProvider: 'groq',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe'
}

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  // Initial state
  isRunning: false,
  isPaused: false,
  mode: 'parallel',
  masterTask: '',
  startTime: null,
  timeLimit: 15,
  safetyLevel: 'safe',
  projectFolder: '',
  provider: 'groq',
  config: DEFAULT_CONFIG,
  terminals: new Map(),
  coordinatorLog: [],
  decomposedTasks: [],

  // Global actions
  setMode: (mode) => set({ mode }),
  setProvider: (provider) => set({ provider }),
  setTimeLimit: (minutes) => set({ timeLimit: minutes }),
  setSafetyLevel: (level) => set({ safetyLevel: level }),
  setConfig: (config) => set({ config, provider: config.defaultProvider }),
  togglePause: () => {
    const newPaused = !get().isPaused
    set((s) => ({
      isPaused: newPaused,
      coordinatorLog: [
        ...s.coordinatorLog.slice(-499),
        { timestamp: Date.now(), type: newPaused ? 'stop' : 'start', message: newPaused ? 'Orchestrator paused' : 'Orchestrator resumed' }
      ]
    }))
  },

  // Terminal management
  addTerminal: (id, state) => {
    const terminals = new Map(get().terminals)
    terminals.set(id, {
      terminalId: id,
      tabId: state.tabId || '',
      panelId: state.panelId || '',
      cliProvider: state.cliProvider || 'claude',
      task: state.task || '',
      status: 'pending',
      outputBuffer: '',
      lastOutputTime: 0,
      isIdle: false,
      taskSent: false,
      lastResponse: '',
      consecutiveWaits: 0,
      activityLog: [],
      sessionStats: { ...DEFAULT_SESSION_STATS },
      ...state
    })
    set({ terminals })
  },

  removeTerminal: (id) => {
    const terminals = new Map(get().terminals)
    terminals.delete(id)
    set({ terminals })
  },

  updateTerminalState: (id, updates) => {
    const terminals = new Map(get().terminals)
    const existing = terminals.get(id)
    if (existing) {
      terminals.set(id, { ...existing, ...updates })
      set({ terminals })
    }
  },

  appendTerminalOutput: (id, data) => {
    const terminals = new Map(get().terminals)
    const existing = terminals.get(id)
    if (existing) {
      const MAX_BUFFER = 100_000
      const newBuffer = existing.outputBuffer + data
      terminals.set(id, {
        ...existing,
        outputBuffer: newBuffer.length > MAX_BUFFER ? newBuffer.slice(-MAX_BUFFER) : newBuffer,
        lastOutputTime: Date.now(),
        isIdle: false
      })
      set({ terminals })
    }
  },

  markTerminalSent: (id, message) => {
    const terminals = new Map(get().terminals)
    const existing = terminals.get(id)
    if (existing) {
      const MAX_BUFFER = 100_000
      const marker = `\n--- AGENT SENT: "${message}" ---\n`
      const newBuffer = existing.outputBuffer + marker
      terminals.set(id, {
        ...existing,
        outputBuffer: newBuffer.length > MAX_BUFFER ? newBuffer.slice(-MAX_BUFFER) : newBuffer,
        isIdle: false
      })
      set({ terminals })
    }
  },

  addTerminalLog: (id, type, message, detail?) => {
    const terminals = new Map(get().terminals)
    const existing = terminals.get(id)
    if (existing) {
      terminals.set(id, {
        ...existing,
        activityLog: [
          ...existing.activityLog.slice(-499),
          { timestamp: Date.now(), type, message, ...(detail ? { detail } : {}) }
        ]
      })
      set({ terminals })
    }
  },

  updateTerminalStats: (id, stats) => {
    const terminals = new Map(get().terminals)
    const existing = terminals.get(id)
    if (existing) {
      terminals.set(id, {
        ...existing,
        sessionStats: {
          ...existing.sessionStats,
          ...Object.fromEntries(
            Object.entries(stats).map(([k, v]) => [k, Math.max(v as number, (existing.sessionStats as unknown as Record<string, number>)[k] || 0)])
          )
        }
      })
      set({ terminals })
    }
  },

  // Coordination
  addCoordinatorLog: (type, message, detail?) => {
    set((s) => ({
      coordinatorLog: [
        ...s.coordinatorLog.slice(-499),
        { timestamp: Date.now(), type, message, ...(detail ? { detail } : {}) }
      ]
    }))
  },

  setDecomposedTasks: (tasks) => set({ decomposedTasks: tasks }),

  // Session management
  startSession: (masterTask, mode, projectFolder) => {
    set({
      isRunning: true,
      isPaused: false,
      masterTask,
      mode,
      startTime: Date.now(),
      projectFolder,
      coordinatorLog: [
        { timestamp: Date.now(), type: 'start', message: `Orchestrator started in ${mode} mode: ${masterTask}` }
      ],
      decomposedTasks: []
    })
  },

  stopSession: (status = 'stopped') => {
    const state = get()
    const endTime = Date.now()

    // Save session
    if (state.startTime && state.masterTask) {
      const session = {
        id: `orch_${state.startTime}_${Math.random().toString(36).substr(2, 9)}`,
        task: state.masterTask,
        startTime: state.startTime,
        endTime,
        duration: Math.floor((endTime - state.startTime) / 1000),
        status,
        activityLog: [
          ...state.coordinatorLog,
          { timestamp: endTime, type: 'stop' as const, message: `Orchestrator ${status}` }
        ],
        provider: state.provider,
        projectFolder: state.projectFolder,
        mode: state.mode,
        terminalCount: state.terminals.size
      }
      window.api.saveSuperAgentSession(session).catch(err =>
        console.error('Failed to save Orchestrator session:', err)
      )
    }

    set({
      isRunning: false,
      isPaused: false,
      startTime: null,
      terminals: new Map(),
      coordinatorLog: [
        ...state.coordinatorLog,
        { timestamp: endTime, type: 'stop', message: `Orchestrator ${status}` }
      ]
    })
  },

  reset: () => set({
    isRunning: false,
    isPaused: false,
    mode: 'parallel',
    masterTask: '',
    startTime: null,
    timeLimit: 15,
    safetyLevel: 'safe',
    projectFolder: '',
    terminals: new Map(),
    coordinatorLog: [],
    decomposedTasks: []
  })
}))
