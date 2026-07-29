import React, { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Pencil,
  Search,
  Terminal as TerminalIcon,
  Trash2,
  TriangleAlert,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import type { AcpTerminalState, AcpToolCallContent, AcpToolKind, AcpToolStatus } from '@shared/acp'

const KIND_ICONS: Record<AcpToolKind, LucideIcon> = {
  read: FileText,
  edit: Pencil,
  delete: Trash2,
  move: ArrowRight,
  search: Search,
  execute: TerminalIcon,
  think: Lightbulb,
  fetch: Globe,
  switch_mode: Wrench,
  other: Wrench
}

function StatusDot({ status }: { status: AcpToolStatus }) {
  if (status === 'in_progress') return <Loader2 size={13} className="animate-spin text-accent" />
  if (status === 'completed') return <Check size={13} className="text-neutral-500" />
  if (status === 'failed') return <TriangleAlert size={13} className="text-red-400" />
  return <CircleDashed size={13} className="text-neutral-600" />
}

/** Minimal line-level diff so an edit reads as an edit, not as a JSON blob. */
function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
  const before = oldText.split('\n')
  const after = newText.split('\n')

  // A whole-file rewrite arrives as one diff; without a cap it pushes the rest
  // of the conversation off screen.
  return (
    <div className="font-mono text-[11px] leading-[1.5] overflow-auto max-h-80">
      {before.map((line, i) => (
        <div key={`d-${i}`} className="px-3 whitespace-pre bg-red-950/25 text-red-300/80">
          <span className="select-none text-red-500/60">- </span>
          {line}
        </div>
      ))}
      {after.map((line, i) => (
        <div key={`a-${i}`} className="px-3 whitespace-pre bg-sky-950/25 text-sky-200/80">
          <span className="select-none text-sky-400/60">+ </span>
          {line}
        </div>
      ))}
    </div>
  )
}

function ContentBlock({
  content,
  terminals
}: {
  content: AcpToolCallContent
  terminals: Record<string, AcpTerminalState>
}) {
  if (content.type === 'diff') {
    return (
      <div className="border-t border-surface-border">
        <div className="px-3 py-1.5 text-[11px] text-neutral-500 font-mono truncate">{content.path}</div>
        <DiffBlock oldText={content.oldText ?? ''} newText={content.newText ?? ''} />
      </div>
    )
  }

  if (content.type === 'terminal') {
    const terminal = content.terminalId ? terminals[content.terminalId] : undefined
    if (!terminal) {
      return (
        <div className="border-t border-surface-border px-3 py-2 font-mono text-[11px] text-neutral-600">
          waiting for terminal…
        </div>
      )
    }
    return (
      <div className="border-t border-surface-border">
        <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono text-neutral-500">
          <span className="truncate flex-1">{terminal.command}</span>
          {terminal.running ? (
            <Loader2 size={11} className="animate-spin text-accent" />
          ) : (
            <span className={terminal.exitCode === 0 ? 'text-neutral-600' : 'text-red-400'}>
              exit {terminal.exitCode ?? terminal.signal ?? '?'}
            </span>
          )}
        </div>
        <pre className="px-3 pb-2 font-mono text-[11px] leading-[1.5] text-neutral-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
          {terminal.truncated ? `…output truncated…\n${terminal.output}` : terminal.output}
        </pre>
      </div>
    )
  }

  const block = content.content
  const text = block?.type === 'text' ? block.text ?? '' : block?.resource?.text ?? ''
  if (!text) return null

  return (
    <div className="border-t border-surface-border px-3 py-2 font-mono text-[11px] leading-[1.55] text-neutral-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
      {text}
    </div>
  )
}

interface AcpToolCallProps {
  title: string
  toolKind: AcpToolKind
  status: AcpToolStatus
  content: AcpToolCallContent[]
  locations: { path: string; line?: number | null }[]
  terminals: Record<string, AcpTerminalState>
}

export default function AcpToolCall({
  title,
  toolKind,
  status,
  content,
  locations,
  terminals
}: AcpToolCallProps) {
  const hasBody = content.length > 0
  const [open, setOpen] = useState(toolKind === 'edit')
  const Icon = KIND_ICONS[toolKind] ?? Wrench

  return (
    <div className="rounded-md border border-surface-border bg-surface-elevated/60 overflow-hidden">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${hasBody ? 'hover:bg-surface-hover' : 'cursor-default'}`}
      >
        {hasBody ? (
          open ? <ChevronDown size={13} className="text-neutral-600 shrink-0" />
               : <ChevronRight size={13} className="text-neutral-600 shrink-0" />
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <Icon size={13} className="text-neutral-500 shrink-0" />
        <span className="text-[13px] text-neutral-300 truncate flex-1">{title}</span>
        {locations[0] && (
          <span className="text-[11px] font-mono text-neutral-600 truncate max-w-[220px]">
            {locations[0].path.split('/').slice(-2).join('/')}
            {locations[0].line ? `:${locations[0].line}` : ''}
          </span>
        )}
        <StatusDot status={status} />
      </button>

      {open && hasBody && (
        <div>
          {content.map((block, i) => (
            <ContentBlock key={i} content={block} terminals={terminals} />
          ))}
        </div>
      )}
    </div>
  )
}
