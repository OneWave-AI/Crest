import { useState } from 'react'
import {
  ClipboardList,
  CheckCircle2,
  Circle,
  Loader2,
  X,
  ChevronDown,
  Trash2,
  Target
} from 'lucide-react'

export interface PlanItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: Date
  completedAt?: Date
  activeForm?: string
}

interface PlanPanelProps {
  items: PlanItem[]
  onClose: () => void
  onClear?: () => void
}

export default function PlanPanel({ items, onClose, onClear }: PlanPanelProps) {
  const [showCompleted, setShowCompleted] = useState(true)

  const completed = items.filter(i => i.status === 'completed').length
  const inProgress = items.filter(i => i.status === 'in_progress').length
  const pending = items.filter(i => i.status === 'pending').length
  const progress = items.length > 0 ? (completed / items.length) * 100 : 0

  // Filter items based on showCompleted
  const displayItems = showCompleted
    ? items
    : items.filter(i => i.status !== 'completed')

  // Sort: in_progress first, then pending, then completed
  const sortedItems = [...displayItems].sort((a, b) => {
    const order = { in_progress: 0, pending: 1, completed: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 flex flex-col bg-[#0d0d0d]/95 backdrop-blur-sm border-l border-white/[0.08] z-30 shadow-2xl shadow-black/50 animate-in slide-in-from-right-4 duration-200">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-accent/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-accent/10">
            <ClipboardList size={12} className="text-accent" />
          </div>
          <div>
            <span className="text-xs font-medium text-white">Current Plan</span>
            {items.length > 0 && (
              <span className="ml-1.5 text-[10px] text-gray-500">{items.length}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {items.length > 0 && onClear && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-md text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-colors"
              title="Clear plan"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Stats & Progress */}
      {items.length > 0 && (
        <div className="px-3 py-2.5 border-b border-white/[0.06] bg-white/[0.01]">
          {/* Stats row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {inProgress > 0 && (
                <div className="flex items-center gap-1">
                  <Loader2 size={10} className="text-amber-400 animate-spin" />
                  <span className="text-[10px] text-amber-400">{inProgress}</span>
                </div>
              )}
              {pending > 0 && (
                <div className="flex items-center gap-1">
                  <Circle size={10} className="text-gray-500" />
                  <span className="text-[10px] text-gray-500">{pending}</span>
                </div>
              )}
              {completed > 0 && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-green-400" />
                  <span className="text-[10px] text-green-400">{completed}</span>
                </div>
              )}
            </div>

            {/* Toggle completed */}
            {completed > 0 && (
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  showCompleted
                    ? 'text-gray-500 hover:text-gray-400'
                    : 'bg-accent/20 text-accent'
                }`}
              >
                {showCompleted ? 'Hide done' : 'Show done'}
                <ChevronDown size={8} className={`transition-transform ${showCompleted ? '' : 'rotate-180'}`} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] text-gray-600">
              <span>{completed}/{items.length} complete</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-green-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sortedItems.length > 0 ? (
          <div className="space-y-0.5">
            {sortedItems.map((item, index) => (
              <div
                key={item.id}
                className={`px-3 py-2 flex items-start gap-2.5 transition-all ${
                  item.status === 'in_progress'
                    ? 'bg-amber-500/5 border-l-2 border-amber-500'
                    : ''
                }`}
              >
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {item.status === 'completed' ? (
                    <CheckCircle2 size={14} className="text-green-400" />
                  ) : item.status === 'in_progress' ? (
                    <Loader2 size={14} className="text-amber-400 animate-spin" />
                  ) : (
                    <Circle size={14} className="text-gray-600" />
                  )}
                </div>

                {/* Task content */}
                <div className="flex-1 min-w-0">
                  <span className={`text-[11px] leading-relaxed block ${
                    item.status === 'completed'
                      ? 'text-gray-500 line-through'
                      : item.status === 'in_progress'
                      ? 'text-white font-medium'
                      : 'text-gray-400'
                  }`}>
                    {item.content}
                  </span>

                  {/* Active form - what Claude is currently doing */}
                  {item.status === 'in_progress' && item.activeForm && (
                    <span className="text-[9px] text-amber-400/70 mt-0.5 block">
                      {item.activeForm}
                    </span>
                  )}
                </div>

                {/* Task number */}
                <span className="text-[9px] text-gray-700 flex-shrink-0">
                  #{index + 1}
                </span>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="p-3 rounded-xl bg-white/[0.02] mb-3">
              <Target size={24} className="text-gray-700" />
            </div>
            <p className="text-xs text-gray-500 mb-1">No active plan</p>
            <p className="text-[10px] text-gray-600 max-w-[180px]">
              Claude's task list will appear here when working on multi-step tasks
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <CheckCircle2 size={24} className="text-green-400/50 mb-3" />
            <p className="text-xs text-gray-500 mb-1">All tasks completed</p>
            <button
              onClick={() => setShowCompleted(true)}
              className="text-[10px] text-accent hover:underline"
            >
              Show completed tasks
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {items.length > 0 && (
        <div className="px-3 py-2 border-t border-white/[0.06] text-[9px] text-gray-600 text-center">
          Claude is tracking {items.length} task{items.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
