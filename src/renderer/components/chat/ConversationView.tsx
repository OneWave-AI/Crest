import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, PencilSimple, FileArrowUp, Terminal, MagnifyingGlass, Globe,
  Robot, Question, Wrench, FolderOpen, Copy, Check, CaretRight, CaretDown,
  SpinnerGap, Square,
} from '@phosphor-icons/react'
import { useChatStore, type ChatMessage } from './chatStore'
import { useChatColors } from './chatTheme'

const INITIAL_RENDER_CAP = 100
const PAGE_SIZE = 100
const REMARK_PLUGINS = [remarkGfm]

type GroupedItem =
  | { kind: 'user'; message: ChatMessage }
  | { kind: 'assistant'; message: ChatMessage }
  | { kind: 'system'; message: ChatMessage }
  | { kind: 'tool-group'; messages: ChatMessage[] }

function groupMessages(messages: ChatMessage[]): GroupedItem[] {
  const result: GroupedItem[] = []
  let toolBuf: ChatMessage[] = []

  const flushTools = () => {
    if (toolBuf.length > 0) {
      result.push({ kind: 'tool-group', messages: [...toolBuf] })
      toolBuf = []
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolBuf.push(msg)
    } else {
      flushTools()
      if (msg.role === 'user') result.push({ kind: 'user', message: msg })
      else if (msg.role === 'assistant') result.push({ kind: 'assistant', message: msg })
      else result.push({ kind: 'system', message: msg })
    }
  }
  flushTools()
  return result
}

export function ConversationView() {
  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const currentActivity = useChatStore((s) => s.currentActivity)
  const stopSession = useChatStore((s) => s.stopSession)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const colors = useChatColors()

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  const scrollTrigger = `${messages.length}:${messages[messages.length - 1]?.content?.length ?? 0}`

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scrollTrigger])

  const [renderOffset, setRenderOffset] = useState(0)
  const totalCount = messages.length
  const startIndex = Math.max(0, totalCount - INITIAL_RENDER_CAP - renderOffset * PAGE_SIZE)
  const visibleMessages = startIndex > 0 ? messages.slice(startIndex) : messages
  const hasOlder = startIndex > 0
  const hiddenCount = totalCount - visibleMessages.length

  const grouped = useMemo(() => groupMessages(visibleMessages), [visibleMessages])

  const isRunning = status === 'running' || status === 'connecting'
  const isFailed = status === 'failed'
  const showInterrupt = isRunning && messages.some((m) => m.role === 'user')
  const historicalThreshold = Math.max(0, totalCount - 20)

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-40 text-sm" style={{ color: colors.textTertiary }}>
        Start a conversation below
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-4 conversation-selectable"
        onScroll={handleScroll}
      >
        {hasOlder && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => setRenderOffset((o) => o + 1)}
              className="text-[11px] px-3 py-1 rounded-full transition-colors"
              style={{ color: colors.textTertiary, border: `1px solid ${colors.toolBorder}` }}
            >
              Load {Math.min(PAGE_SIZE, hiddenCount)} older messages
            </button>
          </div>
        )}

        <div className="space-y-1 relative">
          {grouped.map((item, idx) => {
            const msgIndex = startIndex + idx
            const isHistorical = msgIndex < historicalThreshold

            switch (item.kind) {
              case 'user':
                return <UserMessage key={item.message.id} message={item.message} skipMotion={isHistorical} colors={colors} />
              case 'assistant':
                return <AssistantMessage key={item.message.id} message={item.message} skipMotion={isHistorical} colors={colors} />
              case 'tool-group':
                return <ToolGroup key={`tg-${item.messages[0].id}`} tools={item.messages} skipMotion={isHistorical} colors={colors} />
              case 'system':
                return <SystemMessage key={item.message.id} message={item.message} skipMotion={isHistorical} colors={colors} />
              default:
                return null
            }
          })}
        </div>
      </div>

      {/* Activity bar */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 28, minHeight: 28 }}
      >
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          {isRunning && (
            <span className="flex items-center gap-1.5">
              <span className="flex gap-[3px]">
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '0ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '150ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '300ms' }} />
              </span>
              <span style={{ color: colors.textSecondary }}>{currentActivity || 'Working...'}</span>
            </span>
          )}
          {isFailed && (
            <span style={{ color: colors.statusError, fontSize: 11 }}>Failed</span>
          )}
        </div>
        {showInterrupt && (
          <button
            onClick={stopSession}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] cursor-pointer transition-colors"
            style={{ color: colors.statusError }}
          >
            <Square size={9} weight="fill" />
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───

function CopyButton({ text, colors }: { text: string; colors: ReturnType<typeof useChatColors> }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] cursor-pointer flex-shrink-0"
      style={{
        background: copied ? colors.statusCompleteBg : 'transparent',
        color: copied ? colors.statusComplete : colors.textTertiary,
        border: 'none',
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function UserMessage({ message, skipMotion, colors }: { message: ChatMessage; skipMotion?: boolean; colors: ReturnType<typeof useChatColors> }) {
  const content = (
    <div
      className="text-[13px] leading-[1.5] px-3 py-1.5 max-w-[85%]"
      style={{
        background: colors.userBubble,
        color: colors.userBubbleText,
        border: `1px solid ${colors.userBubbleBorder}`,
        borderRadius: '14px 14px 4px 14px',
      }}
    >
      {message.content}
    </div>
  )

  if (skipMotion) return <div className="flex justify-end py-1.5">{content}</div>

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="flex justify-end py-1.5">
      {content}
    </motion.div>
  )
}

function TableScrollWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
      <table>{children}</table>
    </div>
  )
}

const AssistantMessage = React.memo(function AssistantMessage({
  message, skipMotion, colors,
}: { message: ChatMessage; skipMotion?: boolean; colors: ReturnType<typeof useChatColors> }) {
  const markdownComponents = useMemo(() => ({
    table: ({ children }: any) => <TableScrollWrapper>{children}</TableScrollWrapper>,
    a: ({ href, children }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2" style={{ color: colors.accent }}>
        {children}
      </a>
    ),
    img: ({ src, alt }: any) => (
      <span className="inline-block my-1 rounded-lg overflow-hidden" style={{ maxWidth: '100%' }}>
        <img
          src={src}
          alt={alt || ''}
          className="rounded-lg"
          style={{ maxWidth: '100%', maxHeight: 300 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </span>
    ),
  }), [colors])

  const inner = (
    <div className="group/msg relative">
      <div className="text-[13px] leading-[1.6] prose-cloud min-w-0 max-w-[92%]">
        <Markdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
          {message.content}
        </Markdown>
      </div>
      {message.content.trim() && (
        <div className="absolute bottom-0 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-100">
          <CopyButton text={message.content} colors={colors} />
        </div>
      )}
    </div>
  )

  if (skipMotion) return <div className="py-1">{inner}</div>

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="py-1">
      {inner}
    </motion.div>
  )
}, (prev, next) => prev.message.content === next.message.content && prev.skipMotion === next.skipMotion)

function getToolDescription(name: string, input?: string): string {
  if (!input) return name
  try {
    const parsed = JSON.parse(input)
    switch (name) {
      case 'Read': return `Read ${parsed.file_path || parsed.path || 'file'}`
      case 'Edit': return `Edit ${parsed.file_path || 'file'}`
      case 'Write': return `Write ${parsed.file_path || 'file'}`
      case 'Glob': return `Search files: ${parsed.pattern || ''}`
      case 'Grep': return `Search: ${parsed.pattern || ''}`
      case 'Bash': {
        const cmd = parsed.command || ''
        return cmd.length > 60 ? `${cmd.substring(0, 57)}...` : cmd || 'Bash'
      }
      case 'WebSearch': return `Search: ${parsed.query || ''}`
      case 'Agent': return `Agent: ${(parsed.prompt || parsed.description || '').substring(0, 50)}`
      default: return name
    }
  } catch {
    const trimmed = input.trim()
    if (trimmed.length > 60) return `${name}: ${trimmed.substring(0, 57)}...`
    return trimmed ? `${name}: ${trimmed}` : name
  }
}

function toolSummary(tools: ChatMessage[]): string {
  if (tools.length === 0) return ''
  const desc = getToolDescription(tools[0].toolName || 'Tool', tools[0].toolInput)
  if (tools.length === 1) return desc
  return `${desc} and ${tools.length - 1} more`
}

function ToolIcon({ name, size = 12, colors }: { name: string; size?: number; colors: ReturnType<typeof useChatColors> }) {
  const ICONS: Record<string, React.ReactNode> = {
    Read: <FileText size={size} />, Edit: <PencilSimple size={size} />,
    Write: <FileArrowUp size={size} />, Bash: <Terminal size={size} />,
    Glob: <FolderOpen size={size} />, Grep: <MagnifyingGlass size={size} />,
    WebSearch: <Globe size={size} />, WebFetch: <Globe size={size} />,
    Agent: <Robot size={size} />, AskUserQuestion: <Question size={size} />,
  }
  return <span className="flex items-center" style={{ color: colors.textTertiary }}>{ICONS[name] || <Wrench size={size} />}</span>
}

function ToolGroup({ tools, skipMotion, colors }: { tools: ChatMessage[]; skipMotion?: boolean; colors: ReturnType<typeof useChatColors> }) {
  const hasRunning = tools.some((t) => t.toolStatus === 'running')
  const [expanded, setExpanded] = useState(false)
  const isOpen = expanded || hasRunning

  if (isOpen) {
    const inner = (
      <div className="py-1">
        {!hasRunning && (
          <div className="flex items-center gap-1 cursor-pointer mb-1.5" onClick={() => setExpanded(false)}>
            <CaretDown size={10} style={{ color: colors.textMuted }} />
            <span className="text-[11px]" style={{ color: colors.textMuted }}>
              Used {tools.length} tool{tools.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        <div className="relative pl-6">
          <div className="absolute left-[10px] top-1 bottom-1 w-px" style={{ background: colors.timelineLine }} />
          <div className="space-y-3">
            {tools.map((tool) => {
              const running = tool.toolStatus === 'running'
              const toolName = tool.toolName || 'Tool'
              const desc = getToolDescription(toolName, tool.toolInput)
              return (
                <div key={tool.id} className="relative">
                  <div className="absolute -left-6 top-[1px] w-[20px] h-[20px] rounded-full flex items-center justify-center"
                    style={{ background: running ? colors.toolRunningBg : colors.toolBg, border: `1px solid ${running ? colors.toolRunningBorder : colors.toolBorder}` }}>
                    {running ? <SpinnerGap size={10} className="animate-spin" style={{ color: colors.statusRunning }} /> : <ToolIcon name={toolName} size={10} colors={colors} />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[12px] leading-[1.4] block truncate" style={{ color: running ? colors.textSecondary : colors.textTertiary }}>{desc}</span>
                    {!running && (
                      <span className="inline-block text-[10px] mt-0.5 px-1.5 py-[1px] rounded"
                        style={{ background: tool.toolStatus === 'error' ? colors.statusErrorBg : colors.surfaceHover, color: tool.toolStatus === 'error' ? colors.statusError : colors.textMuted }}>
                        Result
                      </span>
                    )}
                    {running && <span className="text-[10px] mt-0.5 block" style={{ color: colors.textMuted }}>running...</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
    if (skipMotion) return inner
    return <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.15 }}>{inner}</motion.div>
  }

  const summary = toolSummary(tools)
  const inner = (
    <div className="flex items-start gap-1 cursor-pointer py-[2px]" onClick={() => setExpanded(true)}>
      <CaretRight size={10} className="flex-shrink-0 mt-[2px]" style={{ color: colors.textTertiary }} />
      <span className="text-[11px] leading-[1.4]" style={{ color: colors.textTertiary }}>{summary}</span>
    </div>
  )
  if (skipMotion) return <div className="py-0.5">{inner}</div>
  return <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="py-0.5">{inner}</motion.div>
}

function SystemMessage({ message, skipMotion, colors }: { message: ChatMessage; skipMotion?: boolean; colors: ReturnType<typeof useChatColors> }) {
  const isError = message.content.startsWith('Error:')
  const inner = (
    <div className="text-[11px] leading-[1.5] px-2.5 py-1 rounded-lg inline-block whitespace-pre-wrap"
      style={{ background: isError ? colors.statusErrorBg : colors.surfaceHover, color: isError ? colors.statusError : colors.textTertiary }}>
      {message.content}
    </div>
  )
  if (skipMotion) return <div className="py-0.5">{inner}</div>
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="py-0.5">{inner}</motion.div>
}
