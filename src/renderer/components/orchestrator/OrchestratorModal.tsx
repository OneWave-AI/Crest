import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Loader2,
  Rocket,
  Clock,
  Shield,
  ShieldAlert,
  ShieldOff,
  ChevronDown,
  ArrowRight,
  SplitSquareVertical,
  LayoutGrid,
  Plus,
  Minus,
  Bot
} from 'lucide-react'
import { useOrchestrator } from '../../hooks/useOrchestrator'
import { useSuperAgentStore } from '../../store/superAgentStore'
import { useAppStore } from '../../store'
import type { SafetyLevel, LLMProvider } from '../../../shared/types'

interface OrchestratorModalProps {
  isOpen: boolean
  onClose: () => void
  terminalMapping: Record<string, { tabId: string; panelId: string }>
  onStart: () => void
  onCreateGrid?: () => void
}

const SAFETY_OPTIONS = [
  { level: 'safe' as SafetyLevel, icon: Shield, color: 'emerald', label: 'Safe' },
  { level: 'moderate' as SafetyLevel, icon: ShieldAlert, color: 'amber', label: 'Balanced' },
  { level: 'yolo' as SafetyLevel, icon: ShieldOff, color: 'red', label: 'YOLO' }
]

export function OrchestratorModal({ isOpen, onClose, terminalMapping, onStart, onCreateGrid }: OrchestratorModalProps) {
  const {
    startOrchestrator, config, provider, setProvider, timeLimit, setTimeLimit,
    safetyLevel, setSafetyLevel, mode, setMode, decomposeTask
  } = useOrchestrator()
  const { cwd } = useAppStore()
  const superAgentRunning = useSuperAgentStore((s) => s.isRunning)

  const [masterTask, setMasterTask] = useState('')
  const [parallelTasks, setParallelTasks] = useState<Record<string, string>>({})
  const [isStarting, setIsStarting] = useState(false)
  const [startPhase, setStartPhase] = useState<'idle' | 'creating' | 'launching'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [decomposedPreview, setDecomposedPreview] = useState<string[] | null>(null)
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [splitTerminalCount, setSplitTerminalCount] = useState(2)

  // Track latest terminalMapping via ref for polling
  const terminalMappingRef = useRef(terminalMapping)
  useEffect(() => { terminalMappingRef.current = terminalMapping }, [terminalMapping])

  const terminalIds = Object.keys(terminalMapping)

  // Poll until enough terminals appear after grid creation
  const pollForTerminals = useCallback(async (minCount: number, timeoutMs: number): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 500))
      const currentIds = Object.keys(terminalMappingRef.current)
      if (currentIds.length >= minCount) return true
    }
    return Object.keys(terminalMappingRef.current).length >= minCount
  }, [])

  useEffect(() => {
    if (isOpen) {
      setMasterTask('')
      setParallelTasks({})
      setError(null)
      setIsStarting(false)
      setStartPhase('idle')
      setShowSettings(false)
      setDecomposedPreview(null)
      setIsDecomposing(false)
    }
  }, [isOpen])

  const handleDecompose = async () => {
    if (!masterTask.trim()) {
      setError('Enter a task to decompose')
      return
    }
    setIsDecomposing(true)
    setError(null)
    const tasks = await decomposeTask(masterTask, splitTerminalCount)
    if (tasks) {
      setDecomposedPreview(tasks)
    } else {
      setError('Failed to decompose task. Check your API key.')
    }
    setIsDecomposing(false)
  }

  const handleStart = async () => {
    if (superAgentRunning) {
      setError('Stop Super Agent first')
      return
    }

    if (mode === 'parallel') {
      const hasAnyTask = terminalIds.some(id => parallelTasks[id]?.trim())
      if (!hasAnyTask && !masterTask.trim()) {
        setError('Enter at least one task')
        return
      }
    } else if (!masterTask.trim()) {
      setError('Enter a master task')
      return
    }

    setIsStarting(true)
    setError(null)

    // Auto-create terminals if not enough available
    const neededCount = mode === 'split' ? splitTerminalCount : 2
    let currentTerminalIds = Object.keys(terminalMappingRef.current)

    if (currentTerminalIds.length < neededCount && onCreateGrid) {
      setStartPhase('creating')
      onCreateGrid()
      const ready = await pollForTerminals(neededCount, 10000)
      if (!ready) {
        setError(`Only ${Object.keys(terminalMappingRef.current).length} terminals created. Try again or create terminals manually.`)
        setIsStarting(false)
        setStartPhase('idle')
        return
      }
      // Re-read terminal IDs after grid creation
      currentTerminalIds = Object.keys(terminalMappingRef.current)
    }

    setStartPhase('launching')

    // Build terminal list from the latest mapping
    const latestMapping = terminalMappingRef.current
    const terminalList = mode === 'split'
      ? currentTerminalIds.slice(0, splitTerminalCount).map(terminalId => ({
          terminalId,
          tabId: latestMapping[terminalId].tabId,
          panelId: latestMapping[terminalId].panelId
        }))
      : currentTerminalIds.map(terminalId => ({
          terminalId,
          tabId: latestMapping[terminalId].tabId,
          panelId: latestMapping[terminalId].panelId
        }))

    if (terminalList.length === 0) {
      setError('No terminals available. Open terminal tabs first.')
      setIsStarting(false)
      setStartPhase('idle')
      return
    }

    // Re-map parallel tasks from old terminal IDs to current terminal IDs
    // (terminal IDs may change if grid was auto-created)
    let resolvedTasks: Record<string, string> | undefined
    if (mode === 'parallel') {
      const oldIds = Object.keys(parallelTasks).filter(id => parallelTasks[id]?.trim())
      const taskValues = oldIds.map(id => parallelTasks[id].trim())
      resolvedTasks = {}
      terminalList.forEach(({ terminalId }, i) => {
        // Map by index: first task → first terminal, etc.
        if (i < taskValues.length) {
          resolvedTasks![terminalId] = taskValues[i]
        }
        // Terminals without a specific task will use masterTask (handled in startOrchestrator)
      })
    }

    const success = await startOrchestrator({
      mode,
      masterTask: masterTask.trim() || 'Work on assigned tasks',
      tasks: resolvedTasks,
      terminalIds: terminalList,
      timeLimit,
      safetyLevel,
      projectFolder: cwd
    })

    if (success) {
      setStartPhase('idle')
      onStart()
      onClose()
    } else {
      setError('Failed to start. Check API keys in Settings.')
      setIsStarting(false)
      setStartPhase('idle')
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[#141416] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden border border-white/[0.08] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Orchestrator</h2>
              <p className="text-xs text-gray-500">Multi-terminal coordination</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Super Agent guard */}
          {superAgentRunning && (
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs">
              Super Agent is running. Stop it before starting the Orchestrator.
            </div>
          )}

          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-[#0a0a0b] rounded-lg">
            <button
              onClick={() => { setMode('split'); setDecomposedPreview(null) }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'split'
                  ? 'bg-cyan-500 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <SplitSquareVertical className="w-4 h-4" />
              Split
            </button>
            <button
              onClick={() => { setMode('parallel'); setDecomposedPreview(null) }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'parallel'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Parallel
            </button>
          </div>

          {/* Mode description */}
          <p className="text-[11px] text-gray-600">
            {mode === 'split'
              ? 'One task decomposed across multiple terminals working together.'
              : 'Each terminal gets a separate, independent task.'}
          </p>

          {/* Split Mode */}
          {mode === 'split' && (
            <>
              <textarea
                value={masterTask}
                onChange={(e) => setMasterTask(e.target.value.slice(0, 1000))}
                placeholder="Describe the full task to decompose..."
                className="w-full h-24 bg-[#0a0a0b] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 resize-none text-sm"
                autoFocus
              />

              {/* Terminal count */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Terminals:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSplitTerminalCount(Math.max(2, splitTerminalCount - 1))}
                    className="p-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm text-white font-mono w-6 text-center">{splitTerminalCount}</span>
                  <button
                    onClick={() => setSplitTerminalCount(Math.min(terminalIds.length || 6, splitTerminalCount + 1))}
                    className="p-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[10px] text-gray-600">({terminalIds.length} available)</span>
              </div>

              {/* Decompose button */}
              {!decomposedPreview && (
                <button
                  onClick={handleDecompose}
                  disabled={!masterTask.trim() || isDecomposing}
                  className="w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDecomposing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Decomposing...</>
                  ) : (
                    <><SplitSquareVertical className="w-4 h-4" /> Decompose & Preview</>
                  )}
                </button>
              )}

              {/* Decomposed preview */}
              {decomposedPreview && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-medium">Sub-tasks Preview:</div>
                  {decomposedPreview.map((task, i) => (
                    <div key={i} className="flex gap-2 items-start px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                      <span className="text-xs text-cyan-400 font-mono shrink-0 mt-0.5">T{i + 1}</span>
                      <p className="text-xs text-gray-300">{task}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => setDecomposedPreview(null)}
                    className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Re-decompose
                  </button>
                </div>
              )}
            </>
          )}

          {/* Parallel Mode */}
          {mode === 'parallel' && (
            <>
              {/* Shared task (optional) */}
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Default task (for terminals without a specific task):</label>
                <textarea
                  value={masterTask}
                  onChange={(e) => setMasterTask(e.target.value.slice(0, 500))}
                  placeholder="Optional: default task for all terminals..."
                  className="w-full h-16 bg-[#0a0a0b] border border-white/[0.08] rounded-xl px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                  autoFocus
                />
              </div>

              {/* Per-terminal tasks */}
              {terminalIds.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-medium">Per-terminal tasks:</div>
                  {terminalIds.map((id, i) => (
                    <div key={id} className="flex gap-2 items-start">
                      <span className="text-xs text-blue-400 font-mono shrink-0 mt-2.5">T{i + 1}</span>
                      <input
                        type="text"
                        value={parallelTasks[id] || ''}
                        onChange={(e) => setParallelTasks(prev => ({ ...prev, [id]: e.target.value }))}
                        placeholder={masterTask.trim() || `Task for terminal ${i + 1}...`}
                        className="flex-1 px-3 py-2 bg-[#0a0a0b] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  ))}
                </div>
              )}

              {terminalIds.length === 0 && (
                <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs">
                  No terminals detected. Open terminal tabs first, then reopen the Orchestrator.
                </div>
              )}

              {/* Quick setup: create grid of 6 terminals */}
              {terminalIds.length < 2 && onCreateGrid && (
                <button
                  onClick={() => {
                    onCreateGrid()
                    // Close and reopen after a brief delay so terminals register
                    onClose()
                    setTimeout(() => {
                      // The user will need to reopen the modal after grid is created
                    }, 500)
                  }}
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 border border-white/[0.08] border-dashed"
                >
                  <LayoutGrid className="w-4 h-4 text-cyan-400" />
                  Create 6-Terminal Grid
                  <span className="text-[10px] text-gray-500 ml-1">then reopen Orchestrator</span>
                </button>
              )}
            </>
          )}

          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] rounded-lg text-xs text-gray-500 transition-colors"
          >
            <span>Settings</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>

          {showSettings && (
            <div className="space-y-4 p-3 bg-white/[0.02] rounded-lg animate-in slide-in-from-top-1 duration-150">
              {/* Provider */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16">Provider</span>
                <div className="flex-1 flex gap-2">
                  {(['groq', 'openai'] as LLMProvider[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        provider === p ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {p === 'groq' ? 'Groq' : 'OpenAI'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Limit */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </span>
                <div className="flex-1 flex gap-1">
                  {[5, 15, 30, 0].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setTimeLimit(mins)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        timeLimit === mins ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {mins === 0 ? '\u221E' : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Safety */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Safety
                </span>
                <div className="flex-1 flex gap-1">
                  {SAFETY_OPTIONS.map(({ level, icon: Icon, color, label }) => (
                    <button
                      key={level}
                      onClick={() => setSafetyLevel(level)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        safetyLevel === level
                          ? color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400'
                          : color === 'amber' ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-red-500/20 text-red-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Launch Button */}
          <button
            onClick={handleStart}
            disabled={isStarting || superAgentRunning}
            className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              isStarting || superAgentRunning
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white'
            }`}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {startPhase === 'creating' ? 'Creating terminals...' : 'Launching...'}
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                {mode === 'split' ? 'Decompose & Launch' : 'Launch All'}
                <ArrowRight className="w-4 h-4 opacity-50" />
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-gray-600">
            {terminalIds.length > 0
              ? `${terminalIds.length} terminal${terminalIds.length !== 1 ? 's' : ''} will be managed`
              : 'Terminals will be auto-created on launch'}
          </p>
        </div>
      </div>
    </div>
  )
}
