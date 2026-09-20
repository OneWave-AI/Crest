import React, { useState, useEffect, useRef } from 'react'
import {
  Zap,
  Square,
  Clock,
  Brain,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Hand,
  Pause,
  Play,
  Shield
} from 'lucide-react'
import { useSuperAgent } from '../../hooks/useSuperAgent'

interface SuperAgentStatusBarProps {
  onStop: () => void
}

// Map log types to visual config
const LOG_CONFIG = {
  start: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', label: 'Waiting' },
  ready: { icon: Zap, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: 'Ready' },
  input: { icon: Send, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: 'Sent' },
  decision: { icon: Brain, color: 'text-indigo-400', bg: 'bg-indigo-400/10', border: 'border-indigo-400/20', label: 'LLM' },
  'fast-path': { icon: Zap, color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20', label: 'Auto' },
  permission: { icon: Shield, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', label: 'Approved' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: 'Error' },
  complete: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: 'Done' },
  stop: { icon: Square, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20', label: 'Stopped' },
  working: { icon: Loader2, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20', label: 'Working' },
  waiting: { icon: Clock, color: 'text-sand-400', bg: 'bg-sand-400/10', border: 'border-sand-400/20', label: 'Waiting' },
  default: { icon: Brain, color: 'text-ink-muted', bg: 'bg-ink-muted/10', border: 'border-ink-muted/20', label: 'Info' }
}

export function SuperAgentStatusBar({ onStop }: SuperAgentStatusBarProps) {
  const { isRunning, isPaused, task, startTime, timeLimit, activityLog, sessionStats, stopSuperAgent, nudgeSuperAgent, togglePause } = useSuperAgent()
  const [elapsed, setElapsed] = useState(0)
  const [isThinking, setIsThinking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Update elapsed time
  useEffect(() => {
    if (!isRunning || !startTime) return

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, startTime])

  // Auto-scroll log and detect thinking state
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }

    // Check if last log entry indicates thinking
    const lastLog = activityLog[activityLog.length - 1]
    if (lastLog?.message.includes('consulting LLM')) {
      setIsThinking(true)
    } else if (lastLog?.type === 'input' || lastLog?.type === 'error') {
      setIsThinking(false)
    }
  }, [activityLog])

  // Handle escape key to stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRunning) {
        handleStop()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRunning])

  const handleStop = () => {
    stopSuperAgent()
    onStop()
  }

  const handleCopyLog = async () => {
    await navigator.clipboard.writeText(
      activityLog.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.message}${l.detail ? ` (${l.detail})` : ''}`).join('\n')
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isRunning) return null

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const remaining = timeLimit > 0 ? timeLimit * 60 - elapsed : null
  const progress = timeLimit > 0 ? (elapsed / (timeLimit * 60)) * 100 : null

  // Collapsed mini view
  if (collapsed) {
    return (
      <div className="w-12 h-full bg-surface-3 border-l border-overlay/[0.06] flex flex-col items-center py-4 gap-4">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 hover:bg-overlay/[0.06] rounded-lg transition-colors"
        >
          <ChevronLeft size={16} className="text-ink-muted" />
        </button>

        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center">
            {isThinking ? (
              <Loader2 className="w-4 h-4 text-ink-bright animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-ink-bright" />
            )}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-3" />
        </div>

        <div className="text-[10px] font-mono text-ink-muted writing-mode-vertical">
          {formatTime(elapsed)}
        </div>

        <div className="flex-1" />

        <button
          onClick={handleStop}
          className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
          title="Stop (Esc)"
        >
          <Square size={14} />
        </button>
      </div>
    )
  }

  // Full panel view
  return (
    <div className="w-72 h-full bg-surface-3 border-l border-overlay/[0.06] flex flex-col">
      {/* Progress bar */}
      {progress !== null && (
        <div className="h-1 bg-black/30 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-700 transition-all duration-1000 relative"
            style={{ width: `${Math.min(progress, 100)}%` }}
          >
            <div className="absolute right-0 top-0 w-8 h-full bg-gradient-to-r from-transparent to-overlay/20 animate-pulse" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 p-3 border-b border-overlay/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center shadow-lg">
                {isThinking ? (
                  <Loader2 className="w-4 h-4 text-ink-bright animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 text-ink-bright" />
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-surface-3" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-ink-bright">Super Agent</h3>
              <p className="text-[10px] text-ink-subtle">
                {isPaused ? 'Paused' : isThinking ? 'Analyzing...' : 'Running'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 hover:bg-overlay/[0.06] rounded transition-colors"
          >
            <ChevronRight size={14} className="text-ink-subtle" />
          </button>
        </div>

        {/* Timer */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-black/20 rounded-lg text-xs">
          <div className="flex items-center gap-1.5 text-ink-muted">
            <Clock size={12} className="text-accent" />
            <span>Elapsed</span>
          </div>
          <div className="font-mono">
            <span className="text-ink-bright">{formatTime(elapsed)}</span>
            {remaining !== null && remaining > 0 && (
              <span className="text-ink-subtle ml-1">/ {formatTime(remaining)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Task */}
      <div className="shrink-0 px-3 py-2 border-b border-overlay/[0.06]">
        <div className="text-[9px] uppercase tracking-wider text-ink-subtle mb-1">Task</div>
        <p className="text-[11px] text-ink line-clamp-2 leading-relaxed">{task}</p>
      </div>

      {/* Session Stats */}
      {(sessionStats.filesWritten > 0 || sessionStats.testsPassed > 0 || sessionStats.testsFailed > 0 || sessionStats.errorsEncountered > 0) && (
        <div className="shrink-0 px-3 py-1.5 border-b border-overlay/[0.06] flex gap-3 text-[10px]">
          {sessionStats.filesWritten > 0 && <span className="text-blue-400">{sessionStats.filesWritten} written</span>}
          {sessionStats.testsPassed > 0 && <span className="text-green-400">{sessionStats.testsPassed} passed</span>}
          {sessionStats.testsFailed > 0 && <span className="text-red-400">{sessionStats.testsFailed} failed</span>}
          {sessionStats.errorsEncountered > 0 && <span className="text-red-400">{sessionStats.errorsEncountered} errors</span>}
        </div>
      )}

      {/* Activity Log */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-overlay/[0.06]">
          <div className="text-[9px] uppercase tracking-wider text-ink-subtle">
            Thoughts ({activityLog.length})
          </div>
          <button
            onClick={handleCopyLog}
            className="flex items-center gap-1 text-[9px] text-ink-subtle hover:text-ink px-1.5 py-0.5 hover:bg-overlay/[0.04] rounded transition-colors"
          >
            {copied ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {activityLog.map((entry, i) => {
            const config = LOG_CONFIG[entry.type as keyof typeof LOG_CONFIG] || LOG_CONFIG.default
            const Icon = config.icon
            const isWorkingType = entry.type === 'working'

            // Clean up message for display
            let displayMsg = entry.message
            if (displayMsg.startsWith('LLM decided: ')) {
              displayMsg = displayMsg.replace('LLM decided: ', '')
            }

            return (
              <div
                key={i}
                className={`p-2 rounded-lg ${config.bg} border ${config.border}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon size={10} className={`${config.color} ${isWorkingType ? 'animate-spin' : ''}`} />
                  <span className={`text-[9px] font-medium uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[9px] text-ink-faint ml-auto">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-ink leading-relaxed break-words pl-4">
                  {displayMsg}
                </p>
                {entry.detail && (
                  <p className="text-[10px] text-ink-subtle pl-4 mt-0.5 italic">{entry.detail}</p>
                )}
              </div>
            )
          })}
          {activityLog.length === 0 && (
            <div className="text-center py-8">
              <Brain className="w-8 h-8 mx-auto mb-2 text-ink-ghost" />
              <p className="text-xs text-ink-subtle">Waiting for activity...</p>
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="shrink-0 p-3 border-t border-overlay/[0.06] space-y-2">
        {/* Nudge Button */}
        <button
          onClick={nudgeSuperAgent}
          disabled={isPaused}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent/10 hover:bg-accent border border-accent/30 hover:border-accent text-accent hover:text-white rounded-lg text-xs font-medium transition-all group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent/10 disabled:hover:text-accent"
        >
          <Hand size={12} className="group-hover:scale-110 transition-transform" />
          <span>Nudge Agent</span>
        </button>
        {/* Pause/Resume Button */}
        <button
          onClick={togglePause}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-xs font-medium transition-all group ${
            isPaused
              ? 'bg-green-500/10 hover:bg-green-500 border-green-500/30 hover:border-green-500 text-green-400 hover:text-white'
              : 'bg-sand-500/10 hover:bg-sand-500 border-sand-500/30 hover:border-sand-500 text-sand-400 hover:text-white'
          }`}
        >
          {isPaused ? (
            <>
              <Play size={12} className="group-hover:scale-110 transition-transform" />
              <span>Resume Agent</span>
            </>
          ) : (
            <>
              <Pause size={12} className="group-hover:scale-110 transition-transform" />
              <span>Pause Agent</span>
            </>
          )}
        </button>
        {/* Stop Button */}
        <button
          onClick={handleStop}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white rounded-lg text-xs font-medium transition-all group"
        >
          <Square size={12} className="group-hover:scale-110 transition-transform" />
          <span>Stop Agent</span>
          <kbd className="text-[9px] opacity-50 px-1 py-0.5 bg-black/20 rounded ml-1">Esc</kbd>
        </button>
      </div>
    </div>
  )
}
