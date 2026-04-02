import React, { useState, useRef, useEffect, useCallback } from 'react'
import { FolderOpen, CaretDown, Check } from '@phosphor-icons/react'
import { useChatStore } from './chatStore'
import { useChatColors } from './chatTheme'

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

function compactPath(fullPath: string): string {
  if (fullPath === '~') return '~'
  const parts = fullPath.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || fullPath
}

interface StatusBarProps {
  cwd: string
}

export function StatusBar({ cwd }: StatusBarProps) {
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const status = useChatStore((s) => s.status)
  const colors = useChatColors()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const isRunning = status === 'running' || status === 'connecting'
  const activeLabel = MODELS.find((m) => m.id === model)?.label || model

  // Close picker on click outside
  useEffect(() => {
    if (!modelPickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelPickerOpen])

  const selectModel = useCallback((id: string) => {
    setModel(id)
    setModelPickerOpen(false)
  }, [setModel])

  return (
    <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 relative" style={{ minHeight: 28 }}>
      <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textTertiary }}>
        {/* Directory */}
        <span className="flex items-center gap-1">
          <FolderOpen size={11} />
          <span className="truncate" style={{ maxWidth: 140 }}>{compactPath(cwd)}</span>
        </span>

        <span style={{ color: colors.textMuted, fontSize: 10 }}>|</span>

        {/* Model picker */}
        <div className="relative">
          <button
            ref={triggerRef}
            onClick={() => !isRunning && setModelPickerOpen((o) => !o)}
            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/5"
            style={{
              color: modelPickerOpen ? colors.accent : colors.textTertiary,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
            title={isRunning ? 'Stop task to change model' : 'Click to switch model'}
            disabled={isRunning}
          >
            {activeLabel}
            <CaretDown size={9} weight="bold" style={{ opacity: 0.6 }} />
          </button>

          {modelPickerOpen && (
            <div
              ref={pickerRef}
              className="absolute bottom-full left-0 mb-1 rounded-lg py-1 z-50"
              style={{
                minWidth: 180,
                background: colors.popoverBg,
                border: `1px solid ${colors.popoverBorder}`,
                boxShadow: colors.popoverShadow,
                backdropFilter: 'blur(20px)',
              }}
            >
              {MODELS.map((m) => {
                const isActive = m.id === model
                return (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                    style={{
                      color: isActive ? colors.accent : colors.textPrimary,
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = colors.surfaceHover
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <span className="w-4 flex items-center justify-center flex-shrink-0">
                      {isActive && <Check size={11} weight="bold" style={{ color: colors.accent }} />}
                    </span>
                    <span className="text-[12px] font-medium">{m.label}</span>
                    <span className="text-[10px] ml-auto" style={{ color: colors.textMuted }}>
                      {m.id}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: colors.textMuted }}>
        {status === 'running' && (
          <span className="flex items-center gap-1">
            <span className="w-[5px] h-[5px] rounded-full animate-pulse" style={{ background: colors.statusRunning }} />
            <span style={{ color: colors.textTertiary }}>Running</span>
          </span>
        )}
        {status === 'completed' && (
          <span className="flex items-center gap-1">
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: colors.statusComplete }} />
            <span style={{ color: colors.textTertiary }}>Done</span>
          </span>
        )}
        {status === 'failed' && (
          <span className="flex items-center gap-1">
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: colors.statusError }} />
            <span style={{ color: colors.statusError }}>Failed</span>
          </span>
        )}
      </div>
    </div>
  )
}
