/**
 * HybridChatView -- A chat UI rendered from live terminal output.
 *
 * Instead of spawning a separate Claude process, this component
 * parses the PTY output buffer into structured chat messages
 * and renders them as a clean conversation view.
 *
 * The terminal PTY stays the single source of truth.
 * User input is typed directly into the terminal.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Terminal as TerminalIcon, PaperPlaneTilt, ArrowDown,
  SpinnerGap, Copy, Check, CaretRight, CaretDown,
  Wrench, FileText,
} from '@phosphor-icons/react'
import {
  type ParsedMessage,
  type ParserState,
  createParserState,
  parseTerminalChunk,
  flushParser,
} from '../../../shared/terminalParser'

interface HybridChatViewProps {
  terminalId: string
  onSendMessage: (text: string) => void
  claudeStatus: 'working' | 'waiting' | 'idle'
}

export function HybridChatView({ terminalId, onSendMessage, claudeStatus }: HybridChatViewProps) {
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [input, setInput] = useState('')
  const parserRef = useRef<ParserState>(createParserState())
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const processedLengthRef = useRef(0)

  const isBusy = claudeStatus === 'working'
  const isWaiting = claudeStatus === 'waiting'

  // Reset parser when terminal changes
  useEffect(() => {
    parserRef.current = createParserState()
    processedLengthRef.current = 0
    setMessages([])
  }, [terminalId])

  // Poll the terminal buffer and parse new output
  useEffect(() => {
    let active = true

    const poll = async () => {
      if (!active) return
      try {
        const buffer = await window.api.terminalGetBuffer(terminalId)
        if (!buffer) return

        // Ring buffer can wrap (50KB max) -- if buffer shrank, reset tracking
        if (buffer.length < processedLengthRef.current) {
          processedLengthRef.current = 0
        }

        if (buffer.length > processedLengthRef.current) {
          const newData = buffer.slice(processedLengthRef.current)
          processedLengthRef.current = buffer.length

          const { state, newMessages } = parseTerminalChunk(parserRef.current, newData)
          parserRef.current = state

          if (newMessages.length > 0) {
            setMessages([...state.messages])
          }
        }
      } catch { /* terminal may not exist yet */ }

      if (active) {
        // Poll faster when Claude is working (catch tool calls in real-time)
        const interval = isBusy ? 200 : 500
        setTimeout(poll, interval)
      }
    }

    poll()
    return () => { active = false }
  }, [terminalId, isBusy])

  // Flush parser when Claude becomes idle
  useEffect(() => {
    if (isWaiting) {
      const flushed = flushParser(parserRef.current)
      if (flushed.length > 0) {
        setMessages([...parserRef.current.messages])
      }
    }
  }, [isWaiting])

  // Auto-scroll
  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80
  }, [])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  // Send message
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    onSendMessage(text)
    if (textareaRef.current) textareaRef.current.style.height = '20px'
  }, [input, onSendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = '20px'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b]">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Chat view -- messages appear as Claude works in the terminal
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {isBusy && (
          <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
            <SpinnerGap size={14} className="animate-spin" />
            <span>Claude is working...</span>
          </div>
        )}
      </div>

      {/* Scroll to bottom */}
      {!isNearBottomRef.current && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-6 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <ArrowDown size={14} className="text-gray-400" />
        </button>
      )}

      {/* Input */}
      <div className="px-4 pb-3 pt-2 border-t border-white/[0.06]">
        <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isWaiting ? 'Type a message...' : 'Claude is working...'}
            disabled={isBusy}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none outline-none disabled:opacity-50"
            style={{ minHeight: 20, maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: input.trim() ? 'rgba(59,130,246,0.8)' : 'rgba(255,255,255,0.05)' }}
          >
            <PaperPlaneTilt size={14} weight="fill" className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message Bubble ──────────────────────────────────────────────

function MessageBubble({ message }: { message: ParsedMessage }) {
  const [copied, setCopied] = useState(false)
  const [toolExpanded, setToolExpanded] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-600/20 border border-blue-500/20 rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm text-white whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div className="mx-2">
        <button
          onClick={() => setToolExpanded(!toolExpanded)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          {toolExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          <Wrench size={12} className="text-amber-400/70" />
          <span className="font-mono">{message.toolName}</span>
          {message.toolInput && (
            <span className="text-gray-600 truncate max-w-[200px]">({message.toolInput})</span>
          )}
          {message.toolStatus === 'running' && (
            <SpinnerGap size={12} className="animate-spin text-amber-400/70" />
          )}
          {message.toolStatus === 'completed' && (
            <Check size={12} className="text-emerald-400/70" />
          )}
        </button>
        {toolExpanded && message.content && (
          <div className="mt-1 ml-5 p-2 bg-white/[0.03] rounded-lg border border-white/[0.05] max-h-40 overflow-y-auto">
            <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap">{message.content}</pre>
          </div>
        )}
      </div>
    )
  }

  if (message.role === 'system') {
    return (
      <div className="text-center py-1">
        <span className="text-[11px] text-gray-600">{message.content}</span>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="group relative">
      <div className="max-w-[95%] text-sm text-gray-200 prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-pre:my-2 prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/[0.06]
        prose-code:text-emerald-300 prose-code:bg-white/[0.06] prose-code:px-1 prose-code:rounded
        prose-headings:text-white prose-a:text-blue-400"
      >
        <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
      </div>
      {message.content.length > 20 && (
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-gray-500" />}
        </button>
      )}
    </div>
  )
}
