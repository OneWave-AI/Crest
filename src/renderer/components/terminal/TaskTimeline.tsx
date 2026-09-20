import { useState, useEffect, useRef } from 'react'
import {
  Clock,
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Trash2,
  Search,
  FolderOpen,
  Code,
  Wrench,
  MessageSquare,
  Sparkles,
  ChevronDown,
  X,
  Activity
} from 'lucide-react'

export type ActionType =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'search'
  | 'git'
  | 'browser'
  | 'tool'
  | 'thinking'
  | 'message'

export type ActionStatus = 'pending' | 'running' | 'success' | 'error'

export interface TimelineAction {
  id: string
  type: ActionType
  title: string
  description?: string
  timestamp: Date
  status: ActionStatus
  duration?: number
  details?: string
  file?: string
}

interface TaskTimelineProps {
  actions: TimelineAction[]
  onClear?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

// Icons for each action type
const ACTION_ICONS: Record<ActionType, typeof Clock> = {
  read: FileSearch,
  write: FileEdit,
  edit: Code,
  bash: Terminal,
  search: Search,
  git: GitCommit,
  browser: Globe,
  tool: Wrench,
  thinking: Sparkles,
  message: MessageSquare
}

// Labels for each action type
const ACTION_LABELS: Record<ActionType, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Command',
  search: 'Search',
  git: 'Git',
  browser: 'Web',
  tool: 'Tool',
  thinking: 'Thinking',
  message: 'Message'
}

// Colors matching app's palette
const ACTION_COLORS: Record<ActionType, string> = {
  read: '#60a5fa',     // blue-400
  write: '#4ade80',    // green-400
  edit: '#cc785c',     // app accent
  bash: '#a78bfa',     // sand-400
  search: '#22d3ee',   // cyan-400
  git: '#fb923c',      // orange-400
  browser: '#f472b6',  // pink-400
  tool: '#818cf8',     // indigo-400
  thinking: '#c084fc', // sand-400
  message: '#94a3b8'   // slate-400
}

// Format duration
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// Relative time
const getRelativeTime = (date: Date): string => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Live elapsed for running actions
const getElapsed = (date: Date): string => {
  const diff = Date.now() - date.getTime()
  if (diff < 1000) return '<1s'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`
}

export default function TaskTimeline({
  actions,
  onClear,
  isCollapsed = false,
  onToggleCollapse
}: TaskTimelineProps) {
  const [filter, setFilter] = useState<ActionType | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)

  // Auto-scroll to latest action
  useEffect(() => {
    if (timelineRef.current && actions.length > 0) {
      const container = timelineRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [actions.length])

  // Update relative times + running elapsed every second
  useEffect(() => {
    const hasRunning = actions.some(a => a.status === 'running')
    const interval = setInterval(() => forceUpdate(n => n + 1), hasRunning ? 1000 : 10000)
    return () => clearInterval(interval)
  }, [actions])

  // Filter actions
  const filteredActions = filter === 'all'
    ? actions
    : actions.filter(a => a.type === filter)

  // Stats
  const runningCount = actions.filter(a => a.status === 'running').length
  const successCount = actions.filter(a => a.status === 'success').length
  const errorCount = actions.filter(a => a.status === 'error').length
  const totalDuration = actions.reduce((sum, a) => sum + (a.duration || 0), 0)

  // Get unique action types for filter
  const actionTypes = [...new Set(actions.map(a => a.type))]

  return (
    <div className="w-72 h-full min-h-0 flex flex-col bg-[#0d0d0d] border-l border-white/[0.06] relative">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-[#cc785c]/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-[#cc785c]/10">
            <Activity size={12} className="text-[#cc785c]" />
          </div>
          <div>
            <span className="text-xs font-medium text-white">Activity</span>
            {actions.length > 0 && (
              <span className="ml-1.5 text-[10px] text-gray-500">{actions.length}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {actions.length > 0 && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-md text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-colors"
              title="Clear"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Stats summary */}
      {actions.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-white/[0.01]">
          <div className="flex items-center gap-3">
            {runningCount > 0 && (
              <div className="flex items-center gap-1">
                <Loader2 size={10} className="text-amber-400 animate-spin" />
                <span className="text-[10px] text-amber-400">{runningCount}</span>
              </div>
            )}
            {successCount > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2 size={10} className="text-green-400" />
                <span className="text-[10px] text-green-400">{successCount}</span>
              </div>
            )}
            {errorCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle size={10} className="text-red-400" />
                <span className="text-[10px] text-red-400">{errorCount}</span>
              </div>
            )}
            {totalDuration > 0 && (
              <div className="flex items-center gap-1">
                <Clock size={10} className="text-gray-500" />
                <span className="text-[10px] text-gray-500">{formatDuration(totalDuration)}</span>
              </div>
            )}
          </div>

          {/* Filter toggle */}
          {actionTypes.length > 1 && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                showFilters || filter !== 'all'
                  ? 'bg-[#cc785c]/20 text-[#cc785c]'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <span>Filter</span>
              <ChevronDown size={10} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* Filter chips - collapsible */}
      {showFilters && actionTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/[0.06] animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              filter === 'all'
                ? 'bg-[#cc785c]/20 text-[#cc785c]'
                : 'bg-white/[0.03] text-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {actionTypes.map(type => {
            const Icon = ACTION_ICONS[type]
            const color = ACTION_COLORS[type]
            const count = actions.filter(a => a.type === type).length
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                  filter === type
                    ? 'bg-white/10 text-white'
                    : 'bg-white/[0.03] text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={9} style={{ color }} />
                <span>{ACTION_LABELS[type]}</span>
                <span className="text-gray-600">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Timeline list */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="p-3 rounded-xl bg-white/[0.02] mb-3">
              <Clock size={24} className="text-gray-700" />
            </div>
            <p className="text-xs text-gray-500 mb-1">No activity yet</p>
            <p className="text-[10px] text-gray-600">Claude's actions will appear here as it works</p>
          </div>
        ) : (
          <div className="py-2">
            {filteredActions.map((action, index) => {
              const Icon = ACTION_ICONS[action.type]
              const color = ACTION_COLORS[action.type]
              const isExpanded = expandedId === action.id
              const isLast = index === filteredActions.length - 1
              const hasDetails = action.details || action.file
              const isRunning = action.status === 'running'

              return (
                <div key={action.id} className="relative px-3">
                  {/* Timeline connector */}
                  {!isLast && (
                    <div
                      className="absolute left-[22px] top-8 bottom-0 w-px"
                      style={{ backgroundColor: `${color}15` }}
                    />
                  )}

                  {/* Action item */}
                  <div
                    className={`relative flex gap-2.5 py-2 px-1 rounded-lg transition-colors ${
                      hasDetails ? 'cursor-pointer' : ''
                    } ${isExpanded ? 'bg-white/[0.03]' : hasDetails ? 'hover:bg-white/[0.02]' : ''} ${
                      isRunning ? 'bg-white/[0.01]' : ''
                    }`}
                    onClick={() => hasDetails && setExpandedId(isExpanded ? null : action.id)}
                  >
                    {/* Icon with status ring */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center ${isRunning ? 'ring-1 ring-amber-400/30' : ''}`}
                        style={{ backgroundColor: `${color}15` }}
                      >
                        {isRunning ? (
                          <Loader2 size={10} style={{ color }} className="animate-spin" />
                        ) : (
                          <Icon size={10} style={{ color }} />
                        )}
                      </div>
                      {/* Status indicator dot */}
                      {!isRunning && (
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0d0d0d] ${
                          action.status === 'success' ? 'bg-green-400' :
                          action.status === 'error' ? 'bg-red-400' :
                          'bg-gray-500'
                        }`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[11px] text-gray-200 leading-tight block">
                            {action.title}
                          </span>
                          {/* Show file path inline when present */}
                          {action.file && !isExpanded && (
                            <span className="text-[9px] text-gray-600 font-mono truncate block mt-0.5">
                              {action.file.length > 40 ? '...' + action.file.slice(-37) : action.file}
                            </span>
                          )}
                        </div>
                        {hasDetails && (
                          <ChevronRight
                            size={10}
                            className={`flex-shrink-0 text-gray-600 mt-0.5 transition-transform ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        )}
                      </div>

                      {action.description && (
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                          {action.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-gray-600">
                          {getRelativeTime(action.timestamp)}
                        </span>
                        {isRunning && (
                          <>
                            <span className="text-gray-700">-</span>
                            <span className="text-[9px] text-amber-400/70">
                              {getElapsed(action.timestamp)} elapsed
                            </span>
                          </>
                        )}
                        {!isRunning && action.duration !== undefined && action.duration > 0 && (
                          <>
                            <span className="text-gray-700">-</span>
                            <span className={`text-[9px] ${action.status === 'error' ? 'text-red-400/70' : 'text-gray-600'}`}>
                              {formatDuration(action.duration)}
                            </span>
                          </>
                        )}
                        {action.status === 'error' && (
                          <span className="text-[9px] text-red-400 font-medium">failed</span>
                        )}
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="mt-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                          {action.file && (
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              <FolderOpen size={10} className="flex-shrink-0" />
                              <span className="truncate font-mono">{action.file}</span>
                            </div>
                          )}
                          {action.details && (
                            <div className="p-2 bg-black/40 rounded-md text-[10px] text-gray-400 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                              {action.details}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {actions.length > 0 && (
        <div className="px-3 py-2 border-t border-white/[0.06] text-[9px] text-gray-600 text-center">
          {filteredActions.length !== actions.length
            ? `Showing ${filteredActions.length} of ${actions.length} actions`
            : 'Click actions to expand details'
          }
        </div>
      )}
    </div>
  )
}
