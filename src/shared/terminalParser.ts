/**
 * Shared terminal output parser for Claude Code.
 *
 * Parses raw PTY output into structured chat messages.
 * Used by both the hybrid chat view and the terminal wrapper.
 *
 * Claude Code terminal output has two forms:
 * 1. Pretty-printed (default) -- uses box-drawing chars, ANSI colors
 * 2. Stream JSON (--output-format stream-json) -- NDJSON events
 *
 * The hybrid view works with the pretty-printed form since the terminal
 * is running Claude normally (not with --output-format).
 */

import { CLAUDE_PATTERNS } from './providers'

// ─── Types ─────────────────────────────────────────────────────────

export interface ParsedMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
}

export interface ParserState {
  messages: ParsedMessage[]
  isStreaming: boolean
  currentAssistantText: string
  currentToolName: string | null
  currentToolInput: string
  msgCounter: number
}

// ─── ANSI Stripping ────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][A-Za-z0-9]|\x1b[78DEHM=>Nco]|[\x07]|\x1b\\/g

export function stripAnsiLight(input: string): string {
  return input.replace(ANSI_RE, '').replace(/\x1b/g, '')
}

// ─── Parser ────────────────────────────────────────────────────────

export function createParserState(): ParserState {
  return {
    messages: [],
    isStreaming: false,
    currentAssistantText: '',
    currentToolName: null,
    currentToolInput: '',
    msgCounter: 0,
  }
}

const nextId = (state: ParserState) => `tp-${++state.msgCounter}`

/**
 * Parse a chunk of terminal output and update the parser state.
 * This is called incrementally as PTY data arrives.
 *
 * Claude Code pretty-print output structure:
 *   ❯ user prompt here           <- user input (after prompt char)
 *   ⎿  assistant text            <- assistant response (⎿ prefix)
 *     ├ Read(src/file.ts)        <- tool call start (├ prefix)
 *     │ ... tool output ...      <- tool output (│ prefix)
 *     ╰ done                     <- tool result
 *   ⎿  more assistant text       <- continues after tool
 *   ❯                            <- ready for next input
 */
export function parseTerminalChunk(
  state: ParserState,
  rawChunk: string
): { state: ParserState; newMessages: ParsedMessage[] } {
  const clean = stripAnsiLight(rawChunk)
  const lines = clean.split('\n')
  const newMessages: ParsedMessage[] = []

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '').trim()
    if (!line) continue

    // ── User input (prompt char followed by text) ──
    const userMatch = line.match(/^❯\s+(.+)/)
    if (userMatch && userMatch[1].trim()) {
      // Flush any in-progress assistant text
      if (state.currentAssistantText.trim()) {
        const msg: ParsedMessage = {
          id: nextId(state),
          role: 'assistant',
          content: state.currentAssistantText.trim(),
          timestamp: Date.now(),
        }
        state.messages.push(msg)
        newMessages.push(msg)
        state.currentAssistantText = ''
      }
      // Flush any in-progress tool
      if (state.currentToolName) {
        const toolMsg = state.messages[state.messages.length - 1]
        if (toolMsg?.role === 'tool' && toolMsg.toolStatus === 'running') {
          toolMsg.toolStatus = 'completed'
        }
        state.currentToolName = null
        state.currentToolInput = ''
      }

      const msg: ParsedMessage = {
        id: nextId(state),
        role: 'user',
        content: userMatch[1].trim(),
        timestamp: Date.now(),
      }
      state.messages.push(msg)
      newMessages.push(msg)
      state.isStreaming = false
      continue
    }

    // ── Empty prompt (just ❯) means Claude is waiting ──
    if (/^❯\s*$/.test(line)) {
      // Flush assistant text
      if (state.currentAssistantText.trim()) {
        const msg: ParsedMessage = {
          id: nextId(state),
          role: 'assistant',
          content: state.currentAssistantText.trim(),
          timestamp: Date.now(),
        }
        state.messages.push(msg)
        newMessages.push(msg)
        state.currentAssistantText = ''
      }
      state.isStreaming = false
      continue
    }

    // ── Tool call start (├ Tool(args)) ──
    const toolMatch = line.match(/^[├┌]\s*(Read|Write|Edit|Bash|Glob|Grep|Agent|Skill|WebFetch|WebSearch|TodoWrite|TaskCreate|TaskUpdate)\(([^)]*)\)/)
    if (toolMatch) {
      // Flush assistant text first
      if (state.currentAssistantText.trim()) {
        const msg: ParsedMessage = {
          id: nextId(state),
          role: 'assistant',
          content: state.currentAssistantText.trim(),
          timestamp: Date.now(),
        }
        state.messages.push(msg)
        newMessages.push(msg)
        state.currentAssistantText = ''
      }
      // Close previous tool if still running
      if (state.currentToolName) {
        const prevTool = state.messages[state.messages.length - 1]
        if (prevTool?.role === 'tool' && prevTool.toolStatus === 'running') {
          prevTool.toolStatus = 'completed'
        }
      }

      state.currentToolName = toolMatch[1]
      state.currentToolInput = toolMatch[2] || ''
      const msg: ParsedMessage = {
        id: nextId(state),
        role: 'tool',
        content: '',
        toolName: toolMatch[1],
        toolInput: toolMatch[2] || '',
        toolStatus: 'running',
        timestamp: Date.now(),
      }
      state.messages.push(msg)
      newMessages.push(msg)
      continue
    }

    // ── Tool output (│ lines) ──
    if (/^│\s/.test(line) && state.currentToolName) {
      const toolMsg = state.messages[state.messages.length - 1]
      if (toolMsg?.role === 'tool' && toolMsg.toolStatus === 'running') {
        const content = line.replace(/^│\s*/, '')
        toolMsg.content += (toolMsg.content ? '\n' : '') + content
      }
      continue
    }

    // ── Tool result/end (╰ lines) ──
    if (/^╰\s/.test(line) && state.currentToolName) {
      const toolMsg = state.messages[state.messages.length - 1]
      if (toolMsg?.role === 'tool') {
        toolMsg.toolStatus = 'completed'
        const result = line.replace(/^╰\s*/, '')
        if (result) toolMsg.content += (toolMsg.content ? '\n' : '') + result
      }
      state.currentToolName = null
      state.currentToolInput = ''
      continue
    }

    // ── Also detect tool calls without box-drawing (Tool: Name(args) format) ──
    const toolAltMatch = line.match(/^(Read|Write|Edit|Bash|Glob|Grep|Agent|Skill|WebFetch|WebSearch)\(([^)]*)\)/)
    if (toolAltMatch && !state.currentToolName) {
      if (state.currentAssistantText.trim()) {
        const msg: ParsedMessage = {
          id: nextId(state),
          role: 'assistant',
          content: state.currentAssistantText.trim(),
          timestamp: Date.now(),
        }
        state.messages.push(msg)
        newMessages.push(msg)
        state.currentAssistantText = ''
      }
      state.currentToolName = toolAltMatch[1]
      const msg: ParsedMessage = {
        id: nextId(state),
        role: 'tool',
        content: '',
        toolName: toolAltMatch[1],
        toolInput: toolAltMatch[2] || '',
        toolStatus: 'running',
        timestamp: Date.now(),
      }
      state.messages.push(msg)
      newMessages.push(msg)
      continue
    }

    // ── Assistant text (⎿ prefix or continuation) ──
    if (/^⎿\s/.test(line)) {
      state.isStreaming = true
      const text = line.replace(/^⎿\s*/, '')
      state.currentAssistantText += (state.currentAssistantText ? '\n' : '') + text
      continue
    }

    // ── Continuation lines while streaming (no prefix, not a tool) ──
    if (state.isStreaming && !state.currentToolName) {
      // Skip spinner chars and status lines
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) continue
      if (/^Thinking\.\.\.|^Searching\.\.\.|^Reading\.\.\./i.test(line)) continue

      state.currentAssistantText += '\n' + line
      continue
    }

    // ── System messages (session start, errors, etc) ──
    if (CLAUDE_PATTERNS.sessionStart.test(line)) {
      const msg: ParsedMessage = {
        id: nextId(state),
        role: 'system',
        content: line,
        timestamp: Date.now(),
      }
      state.messages.push(msg)
      newMessages.push(msg)
      continue
    }

    if (CLAUDE_PATTERNS.claudeError.test(line)) {
      const msg: ParsedMessage = {
        id: nextId(state),
        role: 'system',
        content: line,
        timestamp: Date.now(),
      }
      state.messages.push(msg)
      newMessages.push(msg)
      continue
    }
  }

  return { state, newMessages }
}

/**
 * Flush any pending assistant text from the parser state.
 * Call this when Claude becomes idle (prompt visible).
 */
export function flushParser(state: ParserState): ParsedMessage[] {
  const flushed: ParsedMessage[] = []

  if (state.currentAssistantText.trim()) {
    const msg: ParsedMessage = {
      id: nextId(state),
      role: 'assistant',
      content: state.currentAssistantText.trim(),
      timestamp: Date.now(),
    }
    state.messages.push(msg)
    flushed.push(msg)
    state.currentAssistantText = ''
  }

  if (state.currentToolName) {
    const toolMsg = state.messages[state.messages.length - 1]
    if (toolMsg?.role === 'tool' && toolMsg.toolStatus === 'running') {
      toolMsg.toolStatus = 'completed'
    }
    state.currentToolName = null
    state.currentToolInput = ''
  }

  state.isStreaming = false
  return flushed
}
