import { useCallback, useEffect, useRef } from 'react'
import { useSuperAgentStore } from '../store/superAgentStore'
import { useAppStore } from '../store'
import { CLI_PROVIDERS } from '../../shared/providers'
import type { SafetyLevel, CLIProvider } from '../../shared/types'
import {
  stripAnsi,
  SYSTEM_PROMPT,
  detectClaudeStatus,
  fastPathResponse,
  isDangerous as isDangerousCheck,
  parseStats,
  parseLLMDecision,
  isSemanticallyDuplicate,
  summarizeTerminalOutput,
  parseClaudeCodeState,
  DANGEROUS_PATTERNS,
  type ClaudeStatus
} from './agentUtils'
import { useOrchestratorStore } from '../store/orchestratorStore'

// Helper to get store state without causing re-renders
const getStore = () => useSuperAgentStore.getState()

export function useSuperAgent() {
  // Subscribe to specific state we need for rendering
  const isRunning = useSuperAgentStore((s) => s.isRunning)
  const isPaused = useSuperAgentStore((s) => s.isPaused)
  const task = useSuperAgentStore((s) => s.task)
  const startTime = useSuperAgentStore((s) => s.startTime)
  const timeLimit = useSuperAgentStore((s) => s.timeLimit)
  const safetyLevel = useSuperAgentStore((s) => s.safetyLevel)
  const activityLog = useSuperAgentStore((s) => s.activityLog)
  const sessionStats = useSuperAgentStore((s) => s.sessionStats)
  const config = useSuperAgentStore((s) => s.config)
  const provider = useSuperAgentStore((s) => s.provider)

  // Get CLI provider from app store
  const cliProvider = useAppStore((s) => s.cliProvider)

  // Actions from store
  const setTimeLimit = useSuperAgentStore((s) => s.setTimeLimit)
  const setSafetyLevel = useSuperAgentStore((s) => s.setSafetyLevel)
  const setProvider = useSuperAgentStore((s) => s.setProvider)
  const togglePause = useSuperAgentStore((s) => s.togglePause)

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const processingRef = useRef(false)
  const taskSentRef = useRef(false) // Track if initial task has been sent
  const lastResponseRef = useRef<string>('') // Track last response to avoid repeats
  const waitingStartRef = useRef<number | null>(null) // Track when Claude started waiting
  const consecutiveWaitsRef = useRef(0) // Track consecutive WAIT responses
  const lastStatusRef = useRef<ClaudeStatus>('unknown') // Track last status to avoid duplicate logs
  const lastStatusTimeRef = useRef<number>(0) // Debounce status changes
  const statusDebounceRef = useRef<NodeJS.Timeout | null>(null) // Debounce timer
  const waitingForReadyRef = useRef(true) // Wait for user to get Claude ready before taking over
  const takeoverModeRef = useRef(false) // Track if we're in takeover mode
  const waitingForReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Fallback timer for waiting
  const decisionCountRef = useRef(0) // Track decision count for re-anchoring
  const recentSuggestionsRef = useRef<string[]>([]) // Track recent suggestions for semantic dedup
  const errorCountRef = useRef(0) // Track consecutive errors for pattern detection
  const cliProviderRef = useRef<CLIProvider>(cliProvider)

  // Keep cliProvider ref in sync
  useEffect(() => {
    cliProviderRef.current = cliProvider
  }, [cliProvider])

  // Load config function - stable, no dependencies
  const loadConfig = useCallback(async () => {
    try {
      const loadedConfig = await window.api.loadSuperAgentConfig()
      if (loadedConfig) {
        getStore().setConfig(loadedConfig)
        return loadedConfig
      }
    } catch (err) {
      console.error('Failed to load Super Agent config:', err)
    }
    return getStore().config
  }, [])

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Check if command is dangerous
  const isDangerous = useCallback((command: string, level: SafetyLevel): boolean => {
    return isDangerousCheck(command, level)
  }, [])

  // Call the LLM to decide what to do (accepts pre-cleaned output)
  const callLLM = useCallback(async (cleanOutput: string): Promise<string | null> => {
    const store = getStore()
    const { config: cfg, provider: prov, task: currentTask } = store

    if (!cfg) return null

    const apiKey = prov === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey
    const model = prov === 'openai' ? cfg.openaiModel : cfg.groqModel

    if (!apiKey) {
      store.addLog('error', `No API key configured for ${prov}`)
      return null
    }

    // Add context about state
    let stateContext = ''
    if (taskSentRef.current) {
      stateContext = '\n\nIMPORTANT: The task has ALREADY been sent. DO NOT send the task again. Either respond WAIT, answer a question, approve a prompt, or suggest an improvement.'
    }
    if (lastResponseRef.current) {
      stateContext += `\n\nYour last response was: "${lastResponseRef.current}" - DO NOT repeat it.`
    }

    // Check if Claude has been waiting too long (>7 seconds)
    const waitingTooLong = waitingStartRef.current && (Date.now() - waitingStartRef.current > 7000)
    const tooManyWaits = consecutiveWaitsRef.current >= 2

    if (waitingTooLong || tooManyWaits) {
      stateContext += `\n\nURGENT: The CLI has been WAITING for input for ${Math.floor((Date.now() - (waitingStartRef.current || Date.now())) / 1000)} seconds! You've said WAIT ${consecutiveWaitsRef.current} times. DO NOT say WAIT again. You MUST provide actual input now.`
    }

    // Task re-anchoring every 10 decisions to prevent drift
    if (decisionCountRef.current > 0 && decisionCountRef.current % 10 === 0) {
      stateContext += `\n\nREMINDER (Decision #${decisionCountRef.current}): Your original task is: "${currentTask}". Stay focused on this goal and make meaningful progress.`
    }

    const truncatedOutput = summarizeTerminalOutput(cleanOutput, 4000)

    // Add takeover context if in takeover mode
    const takeoverContext = takeoverModeRef.current
      ? `=== TAKEOVER MODE ===
You're taking control of an existing conversation that was already in progress.
- Analyze what the CLI is currently doing from the terminal output
- If it's waiting for input, provide helpful input to continue the work
- If it's working, respond WAIT
- Your task guidance may be generic - use the terminal output to understand the actual context
- Focus on helping complete whatever it was working on`
      : ''

    const systemPrompt = SYSTEM_PROMPT
      .replace('{MODE}', takeoverModeRef.current ? 'TAKEOVER' : 'NEW_TASK')
      .replace('{TASK}', currentTask)
      .replace('{TAKEOVER_CONTEXT}', takeoverContext) + stateContext

    // User message contains terminal output (cacheable)
    const userMessage = `TERMINAL OUTPUT:\n\`\`\`\n${truncatedOutput}\n\`\`\`\n\nRespond with JSON: {"action":"wait"|"send"|"done","text":"..."}`

    // Log what the LLM is seeing (last 500 chars for debugging)
    console.log('[SuperAgent] LLM seeing output (last 500 chars):', truncatedOutput.slice(-500))

    // Retry logic with exponential backoff
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

        if (response.success) {
          if (response.usage) {
            const { promptTokens, completionTokens, totalTokens } = response.usage
            console.log(`[SuperAgent] Tokens: ${promptTokens} prompt + ${completionTokens} completion = ${totalTokens} total`)
          }
          return response.content || null
        }

        if (attempt < MAX_RETRIES) {
          const delay = attempt * 1000
          store.addLog('error', `LLM failed (${response.error}), retrying in ${delay/1000}s (${attempt}/${MAX_RETRIES})...`)
          await new Promise(r => setTimeout(r, delay))
        } else {
          store.addLog('error', `LLM error after ${MAX_RETRIES} attempts: ${response.error}`)
          return null
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 1000
          store.addLog('error', `LLM call failed, retrying in ${delay/1000}s (${attempt}/${MAX_RETRIES})...`)
          await new Promise(r => setTimeout(r, delay))
        } else {
          store.addLog('error', `LLM call failed after ${MAX_RETRIES} attempts: ${error}`)
          return null
        }
      }
    }
    return null
  }, [])

  // Send input to terminal
  const sendToTerminal = useCallback(async (input: string) => {
    const store = getStore()
    const { activeTerminalId, safetyLevel: level } = store

    if (!activeTerminalId) {
      store.addLog('error', 'No active terminal')
      return
    }

    if (isDangerous(input, level)) {
      store.addLog('error', `Blocked dangerous command: ${input}`)
      return
    }

    store.addLog('input', `Sending: ${input}`)
    await window.api.terminalSendText(input, activeTerminalId)
  }, [isDangerous])

  // Handle idle detection - called when Claude stops outputting
  const handleIdle = useCallback(async () => {
    console.log('[SuperAgent] handleIdle called')
    const store = getStore()
    if (processingRef.current) {
      console.log('[SuperAgent] handleIdle skipped - already processing')
      return
    }
    if (!store.isRunning) {
      console.log('[SuperAgent] handleIdle skipped - not running')
      return
    }
    if (store.isPaused) {
      console.log('[SuperAgent] handleIdle skipped - paused')
      return
    }
    processingRef.current = true

    try {
      const { outputBuffer } = store
      console.log('[SuperAgent] Output buffer length:', outputBuffer.length)

      // Strip ANSI once for the whole cycle
      const cleanBuffer = stripAnsi(outputBuffer)
      const currentCliProvider = cliProviderRef.current

      // Parse Claude-specific state for rich awareness
      const claudeState = currentCliProvider === 'claude' ? parseClaudeCodeState(cleanBuffer) : null

      // Update session stats from output
      const stats = parseStats(cleanBuffer)
      if (Object.keys(stats).length > 0) {
        store.updateSessionStats(stats)
      }

      // Check for CLI crash (no output for 2+ minutes while running)
      if (currentCliProvider === 'claude') {
        try {
          const ptyStatus = await window.api.terminalGetClaudeStatus(store.activeTerminalId!)
          if (ptyStatus?.possibleCrash) {
            store.addLog('error', 'Claude CLI may have crashed (no output for 2min). Sending interrupt...')
            await window.api.terminalInterrupt(store.activeTerminalId!)
            processingRef.current = false
            idleTimerRef.current = setTimeout(() => handleIdle(), 3000)
            return
          }
        } catch { /* ignore if IPC not available */ }
      }

      // Auto-compact when context is running high
      if (claudeState?.contextWarning && claudeState.contextPercent && claudeState.contextPercent >= 85) {
        const status = detectClaudeStatus(cleanBuffer, currentCliProvider)
        if (status === 'waiting') {
          store.addLog('decision', `Context at ${claudeState.contextPercent}% — auto-compacting`)
          await sendToTerminal('/compact')
          processingRef.current = false
          idleTimerRef.current = setTimeout(() => handleIdle(), 5000)
          return
        }
      }

      // Skip LLM entirely when Claude is working or streaming
      const status = detectClaudeStatus(cleanBuffer, currentCliProvider)
      if (status === 'working' || status === 'streaming') {
        store.addLog('working', status === 'streaming' ? 'Claude is generating response' : 'Claude is working, skipping LLM call')
        const cfg = getStore().config
        const idleTimeout = (cfg?.idleTimeout || 5) * 1000
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => handleIdle(), Math.min(idleTimeout, 8000))
        processingRef.current = false
        return
      }

      // Handle Claude error states (rate limit, API errors)
      if (status === 'error' && claudeState?.errorMessage) {
        store.addLog('error', `Claude error detected: ${claudeState.errorMessage.slice(0, 80)}`)
        // Wait and retry -- rate limits usually clear in 10-30s
        processingRef.current = false
        idleTimerRef.current = setTimeout(() => handleIdle(), 15000)
        return
      }

      // Fast-path for known patterns (no LLM needed)
      const result = fastPathResponse(cleanBuffer, taskSentRef.current, store.task, store.safetyLevel, currentCliProvider)
      if (result !== null) {
        if (result.response === 'WAIT') {
          store.addLog('fast-path', 'WAIT (working pattern detected)')
          store.updateSessionStats({ fastPathDecisions: (store.sessionStats.fastPathDecisions || 0) + 1 })
          const cfg = getStore().config
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
          idleTimerRef.current = setTimeout(() => handleIdle(), (cfg?.idleTimeout || 5) * 1000)
          processingRef.current = false
          return
        }

        // y/n approvals get 'permission' type with detail
        if (result.response === 'y' && result.question) {
          store.addLog('permission', 'Approved: y', result.question)
        } else if (result.response === store.task) {
          store.addLog('fast-path', 'Sent task')
          taskSentRef.current = true
        } else {
          store.addLog('fast-path', `Auto: ${result.response.slice(0, 60)}${result.response.length > 60 ? '...' : ''}`)
        }

        store.updateSessionStats({ fastPathDecisions: (store.sessionStats.fastPathDecisions || 0) + 1 })
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        await sendToTerminal(result.response)
        store.markSent(result.response)
        processingRef.current = false
        return
      }

      store.setIdle(true)
      store.addLog('decision', 'Terminal idle, consulting LLM...')

      const decision = await callLLM(cleanBuffer)

      if (!decision) {
        errorCountRef.current++
        if (errorCountRef.current >= 3) {
          store.addLog('error', `${errorCountRef.current} consecutive LLM failures - consider stopping`)
        }
        processingRef.current = false
        return
      }

      // Reset error count on successful LLM response
      errorCountRef.current = 0

      // Increment decision counter
      decisionCountRef.current++
      store.updateSessionStats({ llmDecisions: (store.sessionStats.llmDecisions || 0) + 1 })

      const trimmedDecision = parseLLMDecision(decision)
      const upperDecision = trimmedDecision.toUpperCase()

      const isShortResponse = trimmedDecision.length <= 3
      if (trimmedDecision === lastResponseRef.current && upperDecision !== 'WAIT' && !isShortResponse) {
        store.addLog('decision', `Skipping repeated response: ${trimmedDecision}`)
        processingRef.current = false
        return
      }

      if (upperDecision !== 'WAIT' && !isShortResponse && isSemanticallyDuplicate(trimmedDecision, recentSuggestionsRef.current)) {
        store.addLog('decision', `Skipping similar suggestion: ${trimmedDecision.slice(0, 50)}...`)
        processingRef.current = false
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => handleIdle(), 3000)
        return
      }

      store.addLog('decision', `LLM: ${trimmedDecision}`)
      if (upperDecision !== 'WAIT') {
        lastResponseRef.current = trimmedDecision
        recentSuggestionsRef.current = [...recentSuggestionsRef.current.slice(-4), trimmedDecision]
      }

      // Handle WAIT with hard limit
      if (upperDecision === 'WAIT' || upperDecision.startsWith('WAIT') || trimmedDecision.toLowerCase().includes("i'll wait")) {
        consecutiveWaitsRef.current++

        if (consecutiveWaitsRef.current >= 5) {
          store.addLog('decision', `WAIT limit reached (${consecutiveWaitsRef.current}). Forcing action...`)
          consecutiveWaitsRef.current = 0
          waitingStartRef.current = null
          const forceMsg = 'Please continue with the next step or suggest an improvement'
          await sendToTerminal(forceMsg)
          store.markSent(forceMsg)
          processingRef.current = false
          return
        }

        if (!waitingStartRef.current) {
          waitingStartRef.current = Date.now()
        }
        const waitTime = Math.floor((Date.now() - waitingStartRef.current) / 1000)
        store.addLog('decision', `Waiting for Claude... (${waitTime}s, ${consecutiveWaitsRef.current}/5 checks)`)

        const cfg = getStore().config
        const baseTimeout = (cfg?.idleTimeout || 5) * 1000
        const idleTimeout = consecutiveWaitsRef.current >= 2 ? Math.min(baseTimeout, 3000) : baseTimeout

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          console.log('[SuperAgent] Re-checking after WAIT...')
          handleIdle()
        }, idleTimeout)
      } else if (upperDecision === 'DONE') {
        store.addLog('decision', 'Overriding DONE - asking for improvements')
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        const doneMsg = 'Please add more polish, error handling, or improvements to make this even better'
        await sendToTerminal(doneMsg)
        store.markSent(doneMsg)
      } else if (upperDecision === 'ENTER') {
        store.addLog('input', 'Pressing Enter')
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        await window.api.terminalSendText('', getStore().activeTerminalId!)
        store.markSent('[ENTER]')
      } else if (upperDecision === 'TASK') {
        const currentTask = getStore().task
        store.addLog('input', `Sending task: ${currentTask}`)
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        taskSentRef.current = true
        await sendToTerminal(currentTask)
        store.markSent(currentTask)
      } else if (upperDecision === 'Y' || upperDecision === 'N') {
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        await sendToTerminal(trimmedDecision.toLowerCase())
        store.markSent(trimmedDecision.toLowerCase())
      } else {
        waitingStartRef.current = null
        consecutiveWaitsRef.current = 0
        if (trimmedDecision.length > 20 && !taskSentRef.current) {
          taskSentRef.current = true
        }
        await sendToTerminal(trimmedDecision)
        store.markSent(trimmedDecision)
      }
    } finally {
      processingRef.current = false
    }
  }, [callLLM, sendToTerminal])

  // Process incoming terminal output
  const processOutput = useCallback((data: string, terminalId: string) => {
    const store = getStore()
    const { isRunning: running, activeTerminalId, config: cfg, outputBuffer, task: currentTask } = store

    if (!running) return
    if (terminalId !== activeTerminalId) {
      console.log('[SuperAgent] Terminal ID mismatch:', { incoming: terminalId, expected: activeTerminalId })
      return
    }

    if (store.isPaused) {
      store.appendOutput(data)
      return
    }

    store.appendOutput(data)
    const fullOutput = outputBuffer + data

    // If waiting for user to get Claude ready, watch for the ready prompt
    if (waitingForReadyRef.current) {
      const cleanOutput = stripAnsi(fullOutput)
      const lastLines = cleanOutput.split('\n').slice(-5).join('\n')
      const currentCliProvider = cliProviderRef.current
      const providerConfig = CLI_PROVIDERS[currentCliProvider]

      const hasReadyPrompt = providerConfig.promptChar.test(lastLines)
      const hasTrustPrompt = /trust this project|trust settings|\(y\)|\(n\)|y\/n/i.test(lastLines)

      console.log('[SuperAgent] Waiting for ready - hasReadyPrompt:', hasReadyPrompt, 'hasTrustPrompt:', hasTrustPrompt)
      console.log('[SuperAgent] Last lines:', lastLines.slice(-100))

      if (hasReadyPrompt && !hasTrustPrompt) {
        if (!waitingForReadyRef.current) {
          console.log('[SuperAgent] Already started, ignoring duplicate ready trigger')
          return
        }
        console.log('[SuperAgent] Claude is ready! Sending task...')
        if (waitingForReadyTimeoutRef.current) {
          clearTimeout(waitingForReadyTimeoutRef.current)
          waitingForReadyTimeoutRef.current = null
        }
        waitingForReadyRef.current = false
        taskSentRef.current = true
        store.addLog('ready', 'Claude is ready! Taking over now...')
        store.addLog('input', `Sending task: ${currentTask}`)
        window.api.terminalSendText(currentTask, activeTerminalId)
        store.markSent(currentTask)
        return
      } else {
        return
      }
    }

    console.log('[SuperAgent] Received data, setting idle timer')

    // Strip ANSI once for status detection
    const cleanFull = stripAnsi(fullOutput)
    const currentCliProvider = cliProviderRef.current

    // Detect Claude's current status with debouncing
    const currentStatus = detectClaudeStatus(cleanFull, currentCliProvider)
    const now = Date.now()

    if (statusDebounceRef.current) {
      clearTimeout(statusDebounceRef.current)
    }

    if (currentStatus !== lastStatusRef.current && currentStatus !== 'unknown') {
      const timeSinceLastChange = now - lastStatusTimeRef.current

      if (currentStatus === 'working' && timeSinceLastChange > 500) {
        lastStatusRef.current = currentStatus
        lastStatusTimeRef.current = now
        store.addLog('working', 'Claude is working...')
      } else if (currentStatus === 'waiting') {
        statusDebounceRef.current = setTimeout(() => {
          if (lastStatusRef.current !== 'waiting') {
            lastStatusRef.current = 'waiting'
            lastStatusTimeRef.current = Date.now()
            store.addLog('waiting', 'Claude is waiting for input')
          }
        }, 1500)
      }
    }

    // Reset idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    // Adaptive idle timeout based on detected status
    const baseTimeout = (cfg?.idleTimeout || 5) * 1000
    let idleTimeout: number
    if (currentStatus === 'waiting') {
      idleTimeout = Math.min(baseTimeout, 1500)
    } else if (currentStatus === 'working') {
      idleTimeout = Math.max(baseTimeout, 8000)
    } else {
      idleTimeout = baseTimeout
    }
    console.log('[SuperAgent] Idle timeout:', idleTimeout, 'ms (status:', currentStatus, ')')
    idleTimerRef.current = setTimeout(() => {
      console.log('[SuperAgent] Idle timer fired, calling handleIdle')
      handleIdle()
    }, idleTimeout)
  }, [handleIdle])

  // Start Super Agent session
  const startSuperAgent = useCallback(async (
    taskDescription: string,
    terminalId: string,
    options?: { timeLimit?: number; safetyLevel?: SafetyLevel; projectFolder?: string; takeover?: boolean }
  ) => {
    console.log('[SuperAgent] Starting with terminalId:', terminalId, 'takeover:', options?.takeover)

    // Mutual exclusion: refuse if orchestrator is running
    if (useOrchestratorStore.getState().isRunning) {
      console.error('Cannot start Super Agent while Orchestrator is running')
      return false
    }

    const store = getStore()
    const { config: cfg, provider: prov } = store

    if (!cfg) {
      console.error('Super Agent config not loaded')
      return false
    }

    const apiKey = prov === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey
    if (!apiKey) {
      console.error(`No ${prov} API key configured`)
      return false
    }

    // Reset state for new session
    taskSentRef.current = false
    lastResponseRef.current = ''
    waitingStartRef.current = null
    consecutiveWaitsRef.current = 0
    takeoverModeRef.current = options?.takeover ?? false

    // Set options
    if (options?.timeLimit !== undefined) store.setTimeLimit(options.timeLimit)
    if (options?.safetyLevel) store.setSafetyLevel(options.safetyLevel)

    // Start session with project folder
    const projectFolder = options?.projectFolder || ''
    store.startSession(taskDescription, terminalId, projectFolder)

    // Set duration timer if time limit is set
    const limit = options?.timeLimit ?? store.timeLimit
    if (limit > 0) {
      durationTimerRef.current = setTimeout(() => {
        getStore().addLog('complete', `Time limit reached (${limit} minutes) - task completed full duration`)
        getStore().stopSession('completed')
      }, limit * 60 * 1000)
    }

    if (options?.takeover) {
      waitingForReadyRef.current = false
      taskSentRef.current = true
      store.addLog('start', 'Taking over current conversation...')
      store.addLog('ready', 'Reading current terminal state...')

      window.api.terminalGetBuffer(terminalId, 200).then((buffer) => {
        if (buffer) {
          store.appendOutput(buffer)
        }
        handleIdle()
      }).catch(() => {
        setTimeout(() => handleIdle(), 500)
      })
    } else {
      waitingForReadyRef.current = true
      store.addLog('start', `Waiting for Claude to be ready... Get through any prompts, then Super Agent will take over.`)

      if (waitingForReadyTimeoutRef.current) {
        clearTimeout(waitingForReadyTimeoutRef.current)
      }
      waitingForReadyTimeoutRef.current = setTimeout(() => {
        if (waitingForReadyRef.current && getStore().isRunning) {
          console.log('[SuperAgent] Fallback: waited 30s, starting anyway')
          waitingForReadyRef.current = false
          const currentTask = getStore().task
          getStore().addLog('ready', 'Auto-starting after timeout...')
          getStore().addLog('input', `Sending task: ${currentTask}`)
          window.api.terminalSendText(currentTask, getStore().activeTerminalId!)
          getStore().markSent(currentTask)
          setTimeout(() => handleIdle(), 2000)
        }
      }, 30000)
    }

    return true
  }, [handleIdle])

  // Nudge Super Agent - force check terminal state
  const nudgeSuperAgent = useCallback(() => {
    const store = getStore()
    if (!store.isRunning) return

    if (waitingForReadyRef.current) {
      waitingForReadyRef.current = false
      taskSentRef.current = true
      store.addLog('ready', 'Nudged! Starting autonomous mode...')
    } else {
      store.addLog('decision', 'Nudged! Re-analyzing terminal...')
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (waitingForReadyTimeoutRef.current) {
      clearTimeout(waitingForReadyTimeoutRef.current)
      waitingForReadyTimeoutRef.current = null
    }

    consecutiveWaitsRef.current = 0
    waitingStartRef.current = null
    handleIdle()
  }, [handleIdle])

  // Stop Super Agent session
  const stopSuperAgent = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (durationTimerRef.current) {
      clearTimeout(durationTimerRef.current)
      durationTimerRef.current = null
    }
    if (statusDebounceRef.current) {
      clearTimeout(statusDebounceRef.current)
      statusDebounceRef.current = null
    }
    if (waitingForReadyTimeoutRef.current) {
      clearTimeout(waitingForReadyTimeoutRef.current)
      waitingForReadyTimeoutRef.current = null
    }
    lastStatusRef.current = 'unknown'
    takeoverModeRef.current = false
    getStore().stopSession()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current)
      if (statusDebounceRef.current) clearTimeout(statusDebounceRef.current)
      if (waitingForReadyTimeoutRef.current) clearTimeout(waitingForReadyTimeoutRef.current)
    }
  }, [])

  return {
    // State (subscribed via selectors)
    isRunning,
    isPaused,
    task,
    startTime,
    timeLimit,
    safetyLevel,
    activityLog,
    sessionStats,
    config,
    provider,

    // Actions
    setTimeLimit,
    setSafetyLevel,
    setProvider,
    loadConfig,
    startSuperAgent,
    stopSuperAgent,
    nudgeSuperAgent,
    togglePause,
    processOutput
  }
}
