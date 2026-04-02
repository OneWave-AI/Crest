import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Paperclip } from '@phosphor-icons/react'
import { useChatStore } from './chatStore'
import { useChatColors } from './chatTheme'
import { AttachmentChips, type Attachment } from './AttachmentChips'
import { SlashCommandMenu, getFilteredCommands, type SlashCommand } from './SlashCommandMenu'

const INPUT_MIN_HEIGHT = 20
const INPUT_MAX_HEIGHT = 140

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

interface InputBarProps {
  cwd: string
}

export function InputBar({ cwd }: InputBarProps) {
  const [input, setInput] = useState('')
  const [slashFilter, setSlashFilter] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const sendMessage = useChatStore((s) => s.sendMessage)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const addSystemMessage = useChatStore((s) => s.addSystemMessage)
  const setModel = useChatStore((s) => s.setModel)
  const model = useChatStore((s) => s.model)
  const status = useChatStore((s) => s.status)
  const colors = useChatColors()

  const isBusy = status === 'running' || status === 'connecting'
  const hasContent = input.trim().length > 0 || attachments.length > 0
  const canSend = hasContent
  const showSlashMenu = slashFilter !== null

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${INPUT_MIN_HEIGHT}px`
    const naturalHeight = el.scrollHeight
    const clampedHeight = Math.min(naturalHeight, INPUT_MAX_HEIGHT)
    el.style.height = `${clampedHeight}px`
    el.style.overflowY = naturalHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => { autoResize() }, [input, autoResize])

  // ─── Slash command detection ───
  const updateSlashFilter = useCallback((value: string) => {
    const match = value.match(/^(\/[a-zA-Z-]*)$/)
    if (match) {
      setSlashFilter(match[1])
      setSlashIndex(0)
    } else {
      setSlashFilter(null)
    }
  }, [])

  // ─── Execute slash commands ───
  const executeCommand = useCallback((cmd: SlashCommand) => {
    switch (cmd.command) {
      case '/clear':
        clearMessages()
        addSystemMessage('Conversation cleared.')
        break
      case '/cost':
        addSystemMessage('Cost data is available in terminal mode.')
        break
      case '/model': {
        const current = model
        const lines = MODELS.map((m) => {
          const active = m.id === current
          return `  ${active ? '\u25CF' : '\u25CB'} ${m.label} (${m.id})`
        })
        addSystemMessage(`Current model:\n\n${lines.join('\n')}\n\nSwitch: type /model <name>\n  e.g. /model sonnet`)
        break
      }
      case '/help': {
        const lines = [
          '/clear \u2014 Clear conversation history',
          '/cost \u2014 Show token usage and cost',
          '/model \u2014 Show model info & switch models',
          '/help \u2014 Show this list',
        ]
        addSystemMessage(lines.join('\n'))
        break
      }
    }
  }, [clearMessages, addSystemMessage, model])

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setInput('')
    setSlashFilter(null)
    executeCommand(cmd)
  }, [executeCommand])

  // ─── Send ───
  const handleSend = useCallback(() => {
    if (showSlashMenu) {
      const filtered = getFilteredCommands(slashFilter!)
      if (filtered.length > 0) {
        handleSlashSelect(filtered[slashIndex])
        return
      }
    }

    const prompt = input.trim()

    // Handle /model <name> inline switch
    const modelMatch = prompt.match(/^\/model\s+(\S+)/i)
    if (modelMatch) {
      const query = modelMatch[1].toLowerCase()
      const match = MODELS.find((m) =>
        m.id.toLowerCase().includes(query) || m.label.toLowerCase().includes(query)
      )
      if (match) {
        setModel(match.id)
        setInput('')
        setSlashFilter(null)
        addSystemMessage(`Model switched to ${match.label} (${match.id})`)
      } else {
        setInput('')
        setSlashFilter(null)
        addSystemMessage(`Unknown model "${modelMatch[1]}". Available: opus, sonnet, haiku`)
      }
      return
    }

    if (!prompt && attachments.length === 0) return

    // Build prompt with file references for Claude CLI
    let fullPrompt = prompt || ''
    const filePaths = attachments.filter(a => a.path).map(a => a.path!)
    if (filePaths.length > 0) {
      const fileList = filePaths.map(p => `- ${p}`).join('\n')
      if (fullPrompt) {
        fullPrompt = `${fullPrompt}\n\nRelevant files:\n${fileList}`
      } else {
        fullPrompt = `Look at these files:\n${fileList}`
      }
    }

    setInput('')
    setSlashFilter(null)
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
    }
    sendMessage(fullPrompt, cwd)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [input, sendMessage, cwd, showSlashMenu, slashFilter, slashIndex, handleSlashSelect, attachments, setModel, addSystemMessage])

  // ─── Keyboard ───
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommands(slashFilter!)
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab') { e.preventDefault(); if (filtered.length > 0) handleSlashSelect(filtered[slashIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashFilter(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    updateSlashFilter(value)
  }

  // ─── Paste image ───
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const id = `paste-${Date.now()}`
        setAttachments((prev) => [...prev, {
          id,
          name: `pasted-image.${item.type.split('/')[1] || 'png'}`,
          mimeType: item.type,
        }])
        return
      }
    }
  }, [])

  // ─── Attach file ───
  const handleAttachFile = useCallback(async () => {
    try {
      const files = await window.api.selectFile()
      if (files && files.length > 0) {
        const newAttachments = files.map((f, i) => ({
          id: `file-${Date.now()}-${i}`,
          name: f.name,
          path: f.path,
        }))
        setAttachments((prev) => [...prev, ...newAttachments])
      }
    } catch {
      // selectFile may not be available
    }
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return (
    <div className="flex flex-col w-full px-4 pb-3">
      <div
        ref={wrapperRef}
        className="flex flex-col rounded-2xl px-4 py-2 relative"
        style={{
          background: colors.containerBg,
          border: `1px solid ${colors.containerBorder}`,
        }}
      >
        {/* Slash command menu */}
        <AnimatePresence>
          {showSlashMenu && (
            <SlashCommandMenu
              filter={slashFilter!}
              selectedIndex={slashIndex}
              onSelect={handleSlashSelect}
            />
          )}
        </AnimatePresence>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div style={{ marginBottom: 4, marginLeft: -4 }}>
            <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <button
            onClick={handleAttachFile}
            disabled={isBusy}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 mb-[2px]"
            style={{
              color: colors.textTertiary,
              background: 'transparent',
            }}
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isBusy
                ? 'Claude is working... type to queue'
                : 'Ask Claude Code anything...'
            }
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none"
            style={{
              fontSize: 14,
              lineHeight: '20px',
              color: colors.textPrimary,
              minHeight: INPUT_MIN_HEIGHT,
              maxHeight: INPUT_MAX_HEIGHT,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          />

          <AnimatePresence>
            {canSend && (
              <motion.div
                key="send"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.1 }}
              >
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSend}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                  style={{ background: colors.sendBg, color: colors.textOnAccent }}
                  title={isBusy ? 'Queue message' : 'Send (Enter)'}
                >
                  <ArrowUp size={16} weight="bold" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
