import React, { useState, useEffect } from 'react'
import {
  Square,
  Pause,
  Play,
  Zap,
  Clock,
  LayoutGrid,
  SplitSquareVertical,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { useOrchestratorStore, type TerminalAgentState } from '../../store/orchestratorStore'

interface OrchestratorStatusPanelProps {
  onStop: () => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ink-subtle',
  running: 'bg-cyan-400 animate-pulse',
  idle: 'bg-amber-400',
  completed: 'bg-green-400',
  error: 'bg-red-400'
}

export function OrchestratorStatusPanel({ onStop }: OrchestratorStatusPanelProps) {
  const isRunning = useOrchestratorStore((s) => s.isRunning)
  const isPaused = useOrchestratorStore((s) => s.isPaused)
  const mode = useOrchestratorStore((s) => s.mode)
  const masterTask = useOrchestratorStore((s) => s.masterTask)
  const startTime = useOrchestratorStore((s) => s.startTime)
  const terminals = useOrchestratorStore((s) => s.terminals)
  const coordinatorLog = useOrchestratorStore((s) => s.coordinatorLog)
  const togglePause = useOrchestratorStore((s) => s.togglePause)

  const [elapsed, setElapsed] = useState(0)
  const [showCoordinatorLog, setShowCoordinatorLog] = useState(false)

  // Update elapsed time
  useEffect(() => {
    if (!isRunning || !startTime) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, startTime])

  if (!isRunning) return null

  const terminalEntries = [...terminals.entries()]
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-72 border-l border-overlay/[0.06] bg-surface-2 flex flex-col shrink-0 overflow-hidden">
      {/* Top bar */}
      <div className="px-3 py-2.5 border-b border-overlay/[0.06] bg-gradient-to-r from-cyan-500/10 to-blue-600/10">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-cyan-400 animate-pulse'}`} />
            <span className="text-xs font-semibold text-ink-bright">Orchestrator</span>
          </div>
          <div className="flex items-center gap-1.5">
            {mode === 'split' ? (
              <SplitSquareVertical className="w-3 h-3 text-cyan-400" />
            ) : (
              <LayoutGrid className="w-3 h-3 text-blue-400" />
            )}
            <span className="text-[10px] text-ink-muted capitalize">{mode}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-ink-subtle">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{formatTime(elapsed)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={togglePause}
              className="p-1 rounded hover:bg-overlay/[0.06] text-ink-muted hover:text-ink-bright transition-colors"
              title={isPaused ? 'Resume All' : 'Pause All'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onStop}
              className="p-1 rounded hover:bg-red-500/20 text-ink-muted hover:text-red-400 transition-colors"
              title="Stop All"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Master task */}
      <div className="px-3 py-2 border-b border-overlay/[0.06]">
        <p className="text-[10px] text-ink-subtle mb-0.5">Master Task</p>
        <p className="text-xs text-ink line-clamp-2">{masterTask}</p>
      </div>

      {/* Terminal cards */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {terminalEntries.map(([id, term]) => (
          <TerminalCard key={id} terminalId={id} state={term} />
        ))}

        {terminalEntries.length === 0 && (
          <p className="text-[10px] text-ink-faint text-center py-4">No terminals managed</p>
        )}
      </div>

      {/* Coordinator log (split mode) */}
      {mode === 'split' && coordinatorLog.length > 0 && (
        <div className="border-t border-overlay/[0.06]">
          <button
            onClick={() => setShowCoordinatorLog(!showCoordinatorLog)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-ink-subtle hover:text-ink-muted transition-colors"
          >
            <span>Coordinator Log ({coordinatorLog.length})</span>
            {showCoordinatorLog ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
          {showCoordinatorLog && (
            <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-0.5">
              {coordinatorLog.slice(-20).reverse().map((entry, i) => (
                <div key={i} className="text-[9px] text-ink-faint truncate">
                  <span className="text-ink-ghost">{new Date(entry.timestamp).toLocaleTimeString()}</span>{' '}
                  {entry.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TerminalCard({ terminalId, state }: { terminalId: string; state: TerminalAgentState }) {
  const latestLog = state.activityLog.length > 0
    ? state.activityLog[state.activityLog.length - 1]
    : null

  return (
    <div className="px-2.5 py-2 bg-overlay/[0.02] rounded-lg border border-overlay/[0.04] hover:border-overlay/[0.08] transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[state.status] || 'bg-ink-subtle'}`} />
          <span className="text-[10px] font-medium text-ink-bright">T{state.tabId || terminalId.slice(-4)}</span>
        </div>
        <span className="text-[9px] text-ink-faint capitalize">{state.status}</span>
      </div>

      {/* Task */}
      <p className="text-[10px] text-ink-muted line-clamp-1 mb-1">{state.task || 'No task assigned'}</p>

      {/* Latest log */}
      {latestLog && (
        <p className="text-[9px] text-ink-faint line-clamp-1 italic">
          {latestLog.message}
        </p>
      )}

      {/* Mini stats */}
      <div className="flex items-center gap-2 mt-1.5">
        {state.sessionStats.llmDecisions > 0 && (
          <span className="text-[8px] text-ink-faint bg-overlay/[0.03] px-1 py-0.5 rounded">
            {state.sessionStats.llmDecisions} LLM
          </span>
        )}
        {state.sessionStats.jevDecisions > 0 && (
          <span className="text-[8px] text-ink-faint bg-overlay/[0.03] px-1 py-0.5 rounded">
            {state.sessionStats.jevDecisions} Jev
          </span>
        )}
        {state.sessionStats.fastPathDecisions > 0 && (
          <span className="text-[8px] text-ink-faint bg-overlay/[0.03] px-1 py-0.5 rounded">
            {state.sessionStats.fastPathDecisions} fast
          </span>
        )}
        {state.sessionStats.filesWritten > 0 && (
          <span className="text-[8px] text-ink-faint bg-overlay/[0.03] px-1 py-0.5 rounded">
            {state.sessionStats.filesWritten} writes
          </span>
        )}
      </div>
    </div>
  )
}
