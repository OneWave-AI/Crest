import { useCallback, useEffect, useRef } from 'react'
import { useOrchestratorStore, type OrchestratorMode } from '../store/orchestratorStore'
import { useSuperAgentStore } from '../store/superAgentStore'
import { useAppStore } from '../store'
import { CLI_PROVIDERS } from '../../shared/providers'
import type { SafetyLevel, CLIProvider } from '../../shared/types'
import {
  stripAnsi,
  SYSTEM_PROMPT,
  detectClaudeStatus,
  detectTaskCompletion,
  fastPathResponse,
  isDangerous,
  parseStats,
  parseLLMDecision,
  isSemanticallyDuplicate,
  summarizeTerminalOutput,
  parseClaudeCodeState,
} from './agentUtils'

// Per-terminal refs for timers and state
interface TerminalRefs {
  idleTimer: NodeJS.Timeout | null
  processing: boolean
  taskSent: boolean
  lastResponse: string
  waitingStart: number | null
  consecutiveWaits: number
  lastStatus: 'working' | 'waiting' | 'unknown'
  lastStatusTime: number
  statusDebounce: NodeJS.Timeout | null
  waitingForReady: boolean
  waitingForReadyTimeout: NodeJS.Timeout | null
  decisionCount: number
  recentSuggestions: string[]
  errorCount: number
}

function createTerminalRefs(): TerminalRefs {
  return {
    idleTimer: null,
    processing: false,
    taskSent: false,
    lastResponse: '',
    waitingStart: null,
    consecutiveWaits: 0,
    lastStatus: 'unknown',
    lastStatusTime: 0,
    statusDebounce: null,
    waitingForReady: true,
    waitingForReadyTimeout: null,
    decisionCount: 0,
    recentSuggestions: [],
    errorCount: 0
  }
}

const getStore = () => useOrchestratorStore.getState()

// LLM rate limiter
let llmCallQueue: Array<() => Promise<void>> = []
let activeLLMCalls = 0
const MAX_CONCURRENT_LLM = 3
const LLM_STAGGER_MS = 100

async function processLLMQueue() {
  while (llmCallQueue.length > 0 && activeLLMCalls < MAX_CONCURRENT_LLM) {
    const next = llmCallQueue.shift()
    if (next) {
      activeLLMCalls++
      next().finally(() => {
        activeLLMCalls--
        processLLMQueue()
      })
      await new Promise(r => setTimeout(r, LLM_STAGGER_MS))
    }
  }
}

function enqueueLLMCall(fn: () => Promise<void>) {
  llmCallQueue.push(fn)
  processLLMQueue()
}

export function useOrchestrator() {
  const isRunning = useOrchestratorStore((s) => s.isRunning)
  const isPaused = useOrchestratorStore((s) => s.isPaused)
  const mode = useOrchestratorStore((s) => s.mode)
  const masterTask = useOrchestratorStore((s) => s.masterTask)
  const startTime = useOrchestratorStore((s) => s.startTime)
  const timeLimit = useOrchestratorStore((s) => s.timeLimit)
  const safetyLevel = useOrchestratorStore((s) => s.safetyLevel)
  const config = useOrchestratorStore((s) => s.config)
  const provider = useOrchestratorStore((s) => s.provider)
  const terminals = useOrchestratorStore((s) => s.terminals)
  const coordinatorLog = useOrchestratorStore((s) => s.coordinatorLog)
  const decomposedTasks = useOrchestratorStore((s) => s.decomposedTasks)

  const cliProvider = useAppStore((s) => s.cliProvider)
  const cliProviderRef = useRef<CLIProvider>(cliProvider)
  useEffect(() => { cliProviderRef.current = cliProvider }, [cliProvider])

  // Per-terminal ref map
  const terminalRefsMap = useRef<Map<string, TerminalRefs>>(new Map())
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Get or create refs for a terminal
  const getTerminalRefs = useCallback((terminalId: string): TerminalRefs => {
    if (!terminalRefsMap.current.has(terminalId)) {
      terminalRefsMap.current.set(terminalId, createTerminalRefs())
    }
    return terminalRefsMap.current.get(terminalId)!
  }, [])

  // Send input to a specific terminal
  const sendToTerminal = useCallback(async (input: string, terminalId: string) => {
    const store = getStore()
    if (isDangerous(input, store.safetyLevel)) {
      store.addTerminalLog(terminalId, 'error', `Blocked dangerous command: ${input}`)
      return
    }
    store.addTerminalLog(terminalId, 'input', `Sending: ${input}`)
    await window.api.terminalSendText(input, terminalId)
  }, [])

  // Call LLM for a specific terminal
  const callLLMForTerminal = useCallback(async (terminalId: string, cleanOutput: string): Promise<string | null> => {
    const store = getStore()
    const { config: cfg, provider: prov } = store
    const termState = store.terminals.get(terminalId)
    if (!cfg || !termState) return null

    const apiKey = prov === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey
    const model = prov === 'openai' ? cfg.openaiModel : cfg.groqModel
    if (!apiKey) {
      store.addTerminalLog(terminalId, 'error', `No API key configured for ${prov}`)
      return null
    }

    const refs = getTerminalRefs(terminalId)

    let stateContext = ''
    if (refs.taskSent) {
      stateContext = '\n\nIMPORTANT: The task has ALREADY been sent. DO NOT send the task again.'
    }
    if (refs.lastResponse) {
      stateContext += `\n\nYour last response was: "${refs.lastResponse}" - DO NOT repeat it.`
    }

    const waitingTooLong = refs.waitingStart && (Date.now() - refs.waitingStart > 7000)
    const tooManyWaits = refs.consecutiveWaits >= 2
    if (waitingTooLong || tooManyWaits) {
      stateContext += `\n\nURGENT: The CLI has been WAITING for input. You MUST provide actual input now.`
    }

    if (refs.decisionCount > 0 && refs.decisionCount % 10 === 0) {
      stateContext += `\n\nREMINDER: Your task is: "${termState.task}". Stay focused.`
    }

    // Add cross-terminal awareness for BOTH modes
    const otherTerminals = [...store.terminals.entries()]
      .filter(([id]) => id !== terminalId)
      .map(([id, t]) => {
        const lastLog = t.activityLog[t.activityLog.length - 1]
        // Include Claude state if available (context %, model, tool in use)
        let claudeInfo = ''
        if (cliProviderRef.current === 'claude' && t.outputBuffer) {
          const otherState = parseClaudeCodeState(stripAnsi(t.outputBuffer))
          const parts: string[] = []
          if (otherState.contextPercent !== null) parts.push(`ctx:${otherState.contextPercent}%`)
          if (otherState.lastToolCall) parts.push(`tool:${otherState.lastToolCall.slice(0, 30)}`)
          if (otherState.hasError) parts.push('ERROR')
          if (parts.length) claudeInfo = ` {${parts.join(', ')}}`
        }
        return `- "${t.task.slice(0, 80)}" [${t.status}]${claudeInfo}${lastLog ? ` (${lastLog.message.slice(0, 50)})` : ''}`
      })
      .join('\n')

    if (otherTerminals) {
      const modeNote = store.mode === 'split'
        ? 'These terminals are working on sub-tasks of the same project. Avoid duplicating their work or editing the same files.'
        : 'These terminals are working on separate tasks. Avoid interfering with their files.'
      stateContext += `\n\n=== OTHER TERMINALS ===\n${otherTerminals}\n${modeNote}`
    }

    const truncatedOutput = summarizeTerminalOutput(cleanOutput, 4000)
    const systemPrompt = SYSTEM_PROMPT
      .replace('{MODE}', 'NEW_TASK')
      .replace('{TASK}', termState.task)
      .replace('{TAKEOVER_CONTEXT}', '') + stateContext

    const userMessage = `TERMINAL OUTPUT:\n\`\`\`\n${truncatedOutput}\n\`\`\`\n\nRespond with JSON: {"action":"wait"|"send"|"done","text":"..."}`

    const MAX_RETRIES = 3
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await window.api.callLLMApi({
          provider: prov,
          apiKey,
          model,
          systemPrompt,
          userPrompt: userMessage,
          temperature: 0.2
        })

        if (response.success) return response.content || null

        if (attempt < MAX_RETRIES) {
          const delay = attempt * 1000
          store.addTerminalLog(terminalId, 'error', `LLM failed, retrying in ${delay / 1000}s (${attempt}/${MAX_RETRIES})...`)
          await new Promise(r => setTimeout(r, delay))
        } else {
          store.addTerminalLog(terminalId, 'error', `LLM error after ${MAX_RETRIES} attempts: ${response.error}`)
          return null
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 1000))
        } else {
          store.addTerminalLog(terminalId, 'error', `LLM call failed after ${MAX_RETRIES} attempts: ${error}`)
          return null
        }
      }
    }
    return null
  }, [getTerminalRefs])

  // Handle idle for a specific terminal
  const handleIdleForTerminal = useCallback(async (terminalId: string) => {
    const store = getStore()
    const refs = getTerminalRefs(terminalId)
    const termState = store.terminals.get(terminalId)

    if (refs.processing || !store.isRunning || store.isPaused || !termState) return
    refs.processing = true

    try {
      const cleanBuffer = stripAnsi(termState.outputBuffer)
      const currentCliProvider = cliProviderRef.current

      // Update stats
      const stats = parseStats(cleanBuffer)
      if (Object.keys(stats).length > 0) {
        store.updateTerminalStats(terminalId, stats)
      }

      // Parse Claude-specific state for richer awareness
      const claudeState = currentCliProvider === 'claude' ? parseClaudeCodeState(cleanBuffer) : null

      // Check for crash via main process (no output for 2+ minutes while "working")
      if (currentCliProvider === 'claude') {
        try {
          const ptyStatus = await window.api.terminalGetClaudeStatus(terminalId)
          if (ptyStatus?.possibleCrash) {
            store.addTerminalLog(terminalId, 'error', 'Claude CLI may have crashed (no output for 2min). Sending interrupt...')
            await window.api.terminalInterrupt(terminalId)
            refs.processing = false
            // Retry after a brief pause
            refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), 3000)
            return
          }
        } catch { /* ignore if IPC not available */ }
      }

      // Auto-compact when context is running high
      if (claudeState?.contextWarning && claudeState.contextPercent && claudeState.contextPercent >= 85) {
        const status = detectClaudeStatus(cleanBuffer, currentCliProvider)
        if (status === 'waiting') {
          store.addTerminalLog(terminalId, 'decision', `Context at ${claudeState.contextPercent}% — sending /compact`)
          await sendToTerminal('/compact', terminalId)
          refs.processing = false
          refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), 5000)
          return
        }
      }

      // Log Claude errors if detected
      if (claudeState?.hasError && claudeState.errorMessage) {
        store.addTerminalLog(terminalId, 'error', `Claude error: ${claudeState.errorMessage.slice(0, 100)}`)
      }

      // Skip LLM when working or streaming
      const status = detectClaudeStatus(cleanBuffer, currentCliProvider)
      if (status === 'working' || status === 'streaming') {
        store.addTerminalLog(terminalId, 'working', status === 'streaming' ? 'Claude is generating response, skipping LLM call' : 'Claude is working, skipping LLM call')
        const idleTimeout = (store.config?.idleTimeout || 5) * 1000
        if (refs.idleTimer) clearTimeout(refs.idleTimer)
        refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), Math.min(idleTimeout, 8000))
        refs.processing = false
        return
      }

      // Fast-path
      const result = fastPathResponse(cleanBuffer, refs.taskSent, termState.task, store.safetyLevel, currentCliProvider)
      if (result !== null) {
        if (result.response === 'WAIT') {
          store.addTerminalLog(terminalId, 'fast-path', 'WAIT (working pattern detected)')
          store.updateTerminalStats(terminalId, { fastPathDecisions: (termState.sessionStats.fastPathDecisions || 0) + 1 })
          if (refs.idleTimer) clearTimeout(refs.idleTimer)
          refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), (store.config?.idleTimeout || 5) * 1000)
          refs.processing = false
          return
        }

        if (result.response === 'y' && result.question) {
          store.addTerminalLog(terminalId, 'permission', 'Approved: y', result.question)
        } else if (result.response === termState.task) {
          store.addTerminalLog(terminalId, 'fast-path', 'Sent task')
          refs.taskSent = true
        } else {
          store.addTerminalLog(terminalId, 'fast-path', `Auto: ${result.response.slice(0, 60)}`)
        }

        store.updateTerminalStats(terminalId, { fastPathDecisions: (termState.sessionStats.fastPathDecisions || 0) + 1 })
        refs.waitingStart = null
        refs.consecutiveWaits = 0
        await sendToTerminal(result.response, terminalId)
        store.markTerminalSent(terminalId, result.response)
        refs.processing = false
        return
      }

      // Check for task completion before making an LLM call
      if (detectTaskCompletion(cleanBuffer, currentCliProvider)) {
        store.addTerminalLog(terminalId, 'complete', 'Task appears complete!')
        store.updateTerminalState(terminalId, { status: 'completed' })
        store.addCoordinatorLog('complete', `Terminal ${termState.tabId} finished its task`)
        refs.processing = false

        // Check if all terminals are done
        const allDone = [...store.terminals.values()].every(t => t.status === 'completed' || t.status === 'error')
        if (allDone) {
          store.addCoordinatorLog('complete', 'All terminals finished! Stopping orchestrator.')
          store.stopSession('completed')
          clearAllTimers()
        }
        return
      }

      store.updateTerminalState(terminalId, { isIdle: true })
      store.addTerminalLog(terminalId, 'decision', 'Terminal idle, consulting LLM...')

      // Queue LLM call with rate limiting
      await new Promise<void>((resolve) => {
        enqueueLLMCall(async () => {
          try {
            const decision = await callLLMForTerminal(terminalId, cleanBuffer)
            if (!decision) {
              refs.errorCount++
              if (refs.errorCount >= 3 && refs.errorCount < 8) {
                const backoff = Math.min(30000, 5000 * Math.pow(2, refs.errorCount - 3))
                store.addTerminalLog(terminalId, 'error', `${refs.errorCount} failures, retrying in ${backoff / 1000}s...`)
                store.updateTerminalState(terminalId, { status: 'error' })
                refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), backoff)
              } else if (refs.errorCount >= 8) {
                store.addTerminalLog(terminalId, 'error', 'Terminal permanently failed after 8 errors')
                store.updateTerminalState(terminalId, { status: 'error' })
                store.addCoordinatorLog('error', `Terminal ${termState.tabId} failed permanently`)
              }
              return
            }

            refs.errorCount = 0
            refs.decisionCount++
            store.updateTerminalStats(terminalId, { llmDecisions: (termState.sessionStats.llmDecisions || 0) + 1 })

            const trimmedDecision = parseLLMDecision(decision)
            const upperDecision = trimmedDecision.toUpperCase()

            const isShortResponse = trimmedDecision.length <= 3
            if (trimmedDecision === refs.lastResponse && upperDecision !== 'WAIT' && !isShortResponse) {
              store.addTerminalLog(terminalId, 'decision', `Skipping repeated response`)
              return
            }

            if (upperDecision !== 'WAIT' && !isShortResponse && isSemanticallyDuplicate(trimmedDecision, refs.recentSuggestions)) {
              store.addTerminalLog(terminalId, 'decision', `Skipping similar suggestion`)
              if (refs.idleTimer) clearTimeout(refs.idleTimer)
              refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), 3000)
              return
            }

            store.addTerminalLog(terminalId, 'decision', `LLM: ${trimmedDecision}`)
            if (upperDecision !== 'WAIT') {
              refs.lastResponse = trimmedDecision
              refs.recentSuggestions = [...refs.recentSuggestions.slice(-4), trimmedDecision]
            }

            if (upperDecision === 'WAIT' || upperDecision.startsWith('WAIT') || trimmedDecision.toLowerCase().includes("i'll wait")) {
              refs.consecutiveWaits++
              if (refs.consecutiveWaits >= 5) {
                store.addTerminalLog(terminalId, 'decision', `WAIT limit reached. Forcing action...`)
                refs.consecutiveWaits = 0
                refs.waitingStart = null
                const forceMsg = 'Please continue with the next step or suggest an improvement'
                await sendToTerminal(forceMsg, terminalId)
                store.markTerminalSent(terminalId, forceMsg)
                return
              }
              if (!refs.waitingStart) refs.waitingStart = Date.now()
              const baseTimeout = (store.config?.idleTimeout || 5) * 1000
              const idleTimeout = refs.consecutiveWaits >= 2 ? Math.min(baseTimeout, 3000) : baseTimeout
              if (refs.idleTimer) clearTimeout(refs.idleTimer)
              refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), idleTimeout)
            } else if (upperDecision === 'DONE') {
              store.addTerminalLog(terminalId, 'complete', 'LLM reports task complete')
              store.updateTerminalState(terminalId, { status: 'completed' })
              refs.waitingStart = null
              refs.consecutiveWaits = 0
              // Check if all done
              const allDone = [...getStore().terminals.values()].every(t => t.status === 'completed' || t.status === 'error')
              if (allDone) {
                getStore().addCoordinatorLog('complete', 'All terminals finished!')
                getStore().stopSession('completed')
                clearAllTimers()
              }
            } else if (upperDecision === 'Y' || upperDecision === 'N') {
              refs.waitingStart = null
              refs.consecutiveWaits = 0
              await sendToTerminal(trimmedDecision.toLowerCase(), terminalId)
              store.markTerminalSent(terminalId, trimmedDecision.toLowerCase())
            } else {
              refs.waitingStart = null
              refs.consecutiveWaits = 0
              if (trimmedDecision.length > 20 && !refs.taskSent) {
                refs.taskSent = true
              }
              await sendToTerminal(trimmedDecision, terminalId)
              store.markTerminalSent(terminalId, trimmedDecision)
            }
          } finally {
            resolve()
          }
        })
      })
    } finally {
      refs.processing = false
    }
  }, [getTerminalRefs, callLLMForTerminal, sendToTerminal])

  // Process incoming terminal output - called for every terminal
  const processOutput = useCallback((data: string, terminalId: string) => {
    const store = getStore()
    if (!store.isRunning || store.isPaused) return

    // Only process terminals we're managing
    const termState = store.terminals.get(terminalId)
    if (!termState) return

    store.appendTerminalOutput(terminalId, data)
    const refs = getTerminalRefs(terminalId)

    // If waiting for ready, watch for the ready prompt
    if (refs.waitingForReady) {
      const fullOutput = termState.outputBuffer + data
      const cleanOutput = stripAnsi(fullOutput)
      const lastLines = cleanOutput.split('\n').slice(-5).join('\n')
      const currentCliProvider = cliProviderRef.current
      const providerConfig = CLI_PROVIDERS[currentCliProvider]

      const hasReadyPrompt = providerConfig.promptChar.test(lastLines)
      const hasTrustPrompt = /trust this project|trust settings|\(y\)|\(n\)|y\/n/i.test(lastLines)

      if (hasReadyPrompt && !hasTrustPrompt) {
        if (!refs.waitingForReady) return
        if (refs.waitingForReadyTimeout) {
          clearTimeout(refs.waitingForReadyTimeout)
          refs.waitingForReadyTimeout = null
        }
        refs.waitingForReady = false
        refs.taskSent = true
        store.addTerminalLog(terminalId, 'ready', 'Claude is ready! Sending task...')
        store.addTerminalLog(terminalId, 'input', `Sending task: ${termState.task}`)
        window.api.terminalSendText(termState.task, terminalId)
        store.markTerminalSent(terminalId, termState.task)
        store.updateTerminalState(terminalId, { status: 'running' })
        return
      }
      return
    }

    // Reset idle timer
    if (refs.idleTimer) clearTimeout(refs.idleTimer)

    const fullOutput = termState.outputBuffer + data
    const cleanFull = stripAnsi(fullOutput)
    const currentCliProvider = cliProviderRef.current
    const currentStatus = detectClaudeStatus(cleanFull, currentCliProvider)

    const baseTimeout = (store.config?.idleTimeout || 5) * 1000
    let idleTimeout: number
    if (currentStatus === 'waiting') {
      idleTimeout = Math.min(baseTimeout, 1500)
    } else if (currentStatus === 'working') {
      idleTimeout = Math.max(baseTimeout, 8000)
    } else {
      idleTimeout = baseTimeout
    }

    refs.idleTimer = setTimeout(() => handleIdleForTerminal(terminalId), idleTimeout)
  }, [getTerminalRefs, handleIdleForTerminal])

  // Decompose task via LLM (split mode)
  const decomposeTask = useCallback(async (masterTask: string, terminalCount: number): Promise<string[] | null> => {
    // Load config first to ensure we have API keys
    try {
      const loadedConfig = await window.api.loadSuperAgentConfig()
      if (loadedConfig) getStore().setConfig(loadedConfig)
    } catch (err) {
      console.error('Failed to load config for decompose:', err)
    }

    const { config: cfg, provider: prov } = getStore()
    if (!cfg) return null

    const apiKey = prov === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey
    const model = prov === 'openai' ? cfg.openaiModel : cfg.groqModel
    if (!apiKey) return null

    const systemPrompt = `You are a task decomposition assistant. You take a master task and break it into ${terminalCount} DISTINCT sub-tasks for parallel execution by separate Claude Code CLI terminals.

RULES:
- Each sub-task MUST be different -- never repeat the same task
- Each sub-task should focus on a different aspect/area of the project
- Each sub-task must be self-contained and actionable
- Include enough context that each terminal can work independently
- Tell each terminal what the OTHER terminals are working on so they avoid conflicts
- Make tasks roughly equal in scope

GOOD examples of splitting "Build a todo app":
["Build the backend API with Express: routes for CRUD operations on todos, database setup with SQLite. Other terminals handle frontend and testing.",
 "Build the React frontend: todo list component, add/edit/delete UI, connect to the API on port 3000. Other terminals handle backend and testing.",
 "Write tests for the todo app: unit tests for API routes, integration tests, and E2E tests. Wait for backend/frontend to be scaffolded first."]

BAD example (all the same):
["Build a todo app", "Build a todo app", "Build a todo app"]

Respond ONLY with a valid JSON array of ${terminalCount} strings. No markdown, no explanation.`

    const userMessage = `Break this master task into exactly ${terminalCount} distinct parallel sub-tasks:\n\n${masterTask}`

    // Retry up to 2 times for more reliable decomposition
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await window.api.callLLMApi({
          provider: prov,
          apiKey,
          model,
          systemPrompt,
          userPrompt: userMessage,
          temperature: attempt === 1 ? 0.3 : 0.5 // bump temp on retry for different output
        })

        if (response.success && response.content) {
          const content = response.content.trim()
          // Try direct JSON parse
          try {
            const tasks = JSON.parse(content)
            if (Array.isArray(tasks) && tasks.length >= terminalCount) {
              const result = tasks.slice(0, terminalCount).map(String)
              // Verify tasks are actually different (not all the same)
              const unique = new Set(result)
              if (unique.size >= Math.ceil(terminalCount * 0.6)) return result
              console.warn('[Orchestrator] LLM returned duplicate tasks, retrying...')
              continue
            }
            if (Array.isArray(tasks) && tasks.length > 0) {
              return tasks.map(String)
            }
          } catch {
            // Try to extract JSON array from response (LLM sometimes wraps in markdown)
            const match = content.match(/\[[\s\S]*?\]/)
            if (match) {
              try {
                const tasks = JSON.parse(match[0])
                if (Array.isArray(tasks) && tasks.length > 0) return tasks.map(String)
              } catch { /* fall through */ }
            }
          }
        }

        if (attempt < 2) {
          console.warn(`[Orchestrator] Decompose attempt ${attempt} failed, retrying...`)
          await new Promise(r => setTimeout(r, 1000))
        }
      } catch (err) {
        console.error(`[Orchestrator] Decompose attempt ${attempt} failed:`, err)
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000))
      }
    }
    return null
  }, [])

  // Start orchestrator
  const startOrchestrator = useCallback(async (config: {
    mode: OrchestratorMode
    masterTask: string
    tasks?: Record<string, string> // terminalId -> task (parallel mode)
    terminalIds: Array<{ terminalId: string; tabId: string; panelId: string }>
    timeLimit?: number
    safetyLevel?: SafetyLevel
    projectFolder?: string
  }) => {
    // Mutual exclusion
    if (useSuperAgentStore.getState().isRunning) {
      console.error('Cannot start Orchestrator while Super Agent is running')
      return false
    }

    const store = getStore()
    if (store.isRunning) {
      console.error('Orchestrator already running')
      return false
    }

    // Load config
    try {
      const loadedConfig = await window.api.loadSuperAgentConfig()
      if (loadedConfig) store.setConfig(loadedConfig)
    } catch (err) {
      console.error('Failed to load config:', err)
    }

    // Re-read store after setConfig to get fresh values
    const cfg = getStore().config
    const prov = getStore().provider
    const apiKey = prov === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey
    if (!apiKey) {
      console.error(`No ${prov} API key configured`)
      return false
    }

    if (config.timeLimit !== undefined) store.setTimeLimit(config.timeLimit)
    if (config.safetyLevel) store.setSafetyLevel(config.safetyLevel)

    store.startSession(config.masterTask, config.mode, config.projectFolder || '')

    // Set up terminals
    if (config.mode === 'parallel') {
      // Each terminal gets its own task
      for (const { terminalId, tabId, panelId } of config.terminalIds) {
        const task = config.tasks?.[terminalId] || config.masterTask
        store.addTerminal(terminalId, { tabId, panelId, task, status: 'pending' })
        const refs = getTerminalRefs(terminalId)
        refs.waitingForReady = true
        refs.taskSent = false
        refs.lastResponse = ''
        refs.consecutiveWaits = 0
        refs.waitingStart = null
        refs.decisionCount = 0
        refs.recentSuggestions = []
        refs.errorCount = 0

        // Fallback timeout per terminal
        refs.waitingForReadyTimeout = setTimeout(() => {
          if (refs.waitingForReady && getStore().isRunning) {
            refs.waitingForReady = false
            refs.taskSent = true
            const termState = getStore().terminals.get(terminalId)
            if (termState) {
              store.addTerminalLog(terminalId, 'ready', 'Auto-starting after timeout...')
              window.api.terminalSendText(termState.task, terminalId)
              store.markTerminalSent(terminalId, termState.task)
              store.updateTerminalState(terminalId, { status: 'running' })
              setTimeout(() => handleIdleForTerminal(terminalId), 2000)
            }
          }
        }, 30000)
      }
    } else {
      // Split mode: decompose first, then assign
      store.addCoordinatorLog('decision', 'Decomposing master task...')
      const subTasks = await decomposeTask(config.masterTask, config.terminalIds.length)

      if (!subTasks || subTasks.length === 0) {
        store.addCoordinatorLog('error', 'Failed to decompose task. Creating numbered sub-tasks as fallback.')
        // Instead of giving everyone the SAME task, create distinct sub-tasks
        const fallbackAspects = [
          'Focus on the core logic and main functionality',
          'Focus on the UI/UX, styling, and user-facing components',
          'Focus on tests, error handling, and edge cases',
          'Focus on documentation, types, and code quality',
          'Focus on performance optimization and cleanup',
          'Focus on integration and connecting the pieces together'
        ]
        for (let i = 0; i < config.terminalIds.length; i++) {
          const { terminalId, tabId, panelId } = config.terminalIds[i]
          const aspect = fallbackAspects[i % fallbackAspects.length]
          const fallbackTask = `${config.masterTask}\n\n${aspect}. This is terminal ${i + 1} of ${config.terminalIds.length} working on this task in parallel -- coordinate to avoid duplicate work.`
          store.addTerminal(terminalId, { tabId, panelId, task: fallbackTask, status: 'pending' })
          const refs = getTerminalRefs(terminalId)
          refs.waitingForReady = true
          refs.taskSent = false
        }
      } else {
        const decomposed = config.terminalIds.map(({ terminalId, tabId, panelId }, i) => {
          const task = subTasks[i] || subTasks[subTasks.length - 1]
          store.addTerminal(terminalId, { tabId, panelId, task, status: 'pending' })
          const refs = getTerminalRefs(terminalId)
          refs.waitingForReady = true
          refs.taskSent = false
          refs.lastResponse = ''
          refs.consecutiveWaits = 0
          refs.decisionCount = 0
          refs.recentSuggestions = []
          refs.errorCount = 0

          refs.waitingForReadyTimeout = setTimeout(() => {
            if (refs.waitingForReady && getStore().isRunning) {
              refs.waitingForReady = false
              refs.taskSent = true
              const termState = getStore().terminals.get(terminalId)
              if (termState) {
                store.addTerminalLog(terminalId, 'ready', 'Auto-starting after timeout...')
                window.api.terminalSendText(termState.task, terminalId)
                store.markTerminalSent(terminalId, termState.task)
                store.updateTerminalState(terminalId, { status: 'running' })
                setTimeout(() => handleIdleForTerminal(terminalId), 2000)
              }
            }
          }, 30000)

          return { terminalId, task, order: i }
        })

        store.setDecomposedTasks(decomposed)
        store.addCoordinatorLog('decision', `Decomposed into ${decomposed.length} sub-tasks`)
      }
    }

    // Duration timer
    const limit = config.timeLimit ?? store.timeLimit
    if (limit > 0) {
      durationTimerRef.current = setTimeout(() => {
        getStore().addCoordinatorLog('complete', `Time limit reached (${limit} minutes)`)
        getStore().stopSession('completed')
        clearAllTimers()
      }, limit * 60 * 1000)
    }

    return true
  }, [getTerminalRefs, decomposeTask, handleIdleForTerminal])

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (durationTimerRef.current) {
      clearTimeout(durationTimerRef.current)
      durationTimerRef.current = null
    }
    for (const [, refs] of terminalRefsMap.current) {
      if (refs.idleTimer) clearTimeout(refs.idleTimer)
      if (refs.statusDebounce) clearTimeout(refs.statusDebounce)
      if (refs.waitingForReadyTimeout) clearTimeout(refs.waitingForReadyTimeout)
    }
    terminalRefsMap.current.clear()
    llmCallQueue = []
  }, [])

  // Stop orchestrator
  const stopOrchestrator = useCallback(() => {
    clearAllTimers()
    getStore().stopSession()
  }, [clearAllTimers])

  // Nudge all terminals
  const nudgeAll = useCallback(() => {
    const store = getStore()
    if (!store.isRunning) return

    for (const [terminalId] of store.terminals) {
      const refs = getTerminalRefs(terminalId)
      if (refs.waitingForReady) {
        refs.waitingForReady = false
        refs.taskSent = true
        store.addTerminalLog(terminalId, 'ready', 'Nudged! Starting...')
      } else {
        store.addTerminalLog(terminalId, 'decision', 'Nudged! Re-analyzing...')
      }
      refs.consecutiveWaits = 0
      refs.waitingStart = null
      if (refs.idleTimer) clearTimeout(refs.idleTimer)
      if (refs.waitingForReadyTimeout) clearTimeout(refs.waitingForReadyTimeout)
      handleIdleForTerminal(terminalId)
    }
  }, [getTerminalRefs, handleIdleForTerminal])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [clearAllTimers])

  return {
    // State
    isRunning,
    isPaused,
    mode,
    masterTask,
    startTime,
    timeLimit,
    safetyLevel,
    config,
    provider,
    terminals,
    coordinatorLog,
    decomposedTasks,

    // Actions
    startOrchestrator,
    stopOrchestrator,
    nudgeAll,
    processOutput,
    decomposeTask,
    setMode: useOrchestratorStore((s) => s.setMode),
    setProvider: useOrchestratorStore((s) => s.setProvider),
    setTimeLimit: useOrchestratorStore((s) => s.setTimeLimit),
    setSafetyLevel: useOrchestratorStore((s) => s.setSafetyLevel),
    togglePause: useOrchestratorStore((s) => s.togglePause),
  }
}
