import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'permission'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  toolUseId?: string
  timestamp: number
  // Permission-specific fields
  permissionStatus?: 'pending' | 'allowed' | 'denied'
  permissionTool?: string
  permissionDescription?: string
}

type ChatStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'failed'

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  currentActivity: string
  sessionId: string
  claudeSessionId: string | null
  model: string
  /** Incremented on every message list change so subscribers can react cheaply */
  revision: number

  sendMessage: (prompt: string, cwd: string) => void
  stopSession: () => void
  clearMessages: () => void
  addSystemMessage: (content: string) => void
  setModel: (model: string) => void
  respondToPermission: (messageId: string, toolUseId: string, allowed: boolean) => void
}

let msgCounter = 0
const nextId = () => `chat-msg-${++msgCounter}`

// --- Batched update machinery ---
// Accumulate rapid setState calls and flush them in a single rAF.
let pendingUpdate: Partial<ChatState> | null = null
let rafId: number | null = null

function flushBatch() {
  rafId = null
  if (pendingUpdate) {
    const patch = pendingUpdate
    pendingUpdate = null
    useChatStore.setState(patch)
  }
}

/** Mutate messages array in-place for streaming perf, then schedule a single store flush. */
function mutateAndFlush(mutator: (msgs: ChatMessage[]) => void, extraPatch?: Partial<ChatState>) {
  const state = useChatStore.getState()
  mutator(state.messages)
  const patch: Partial<ChatState> = {
    ...extraPatch,
    messages: state.messages, // same reference — zustand won't diff internals
    revision: state.revision + 1,
  }
  pendingUpdate = patch
  if (rafId === null) {
    rafId = requestAnimationFrame(flushBatch)
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  currentActivity: '',
  sessionId: `chat-${Date.now()}`,
  claudeSessionId: null,
  model: 'claude-sonnet-4-6',
  revision: 0,

  sendMessage: (prompt: string, cwd: string) => {
    const state = get()
    const sessionId = state.sessionId

    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: 'user', content: prompt, timestamp: Date.now() },
      ],
      status: 'running',
      currentActivity: 'Thinking...',
      revision: s.revision + 1,
    }))

    window.api.chatSendPrompt({
      sessionId,
      prompt,
      cwd,
      model: state.model,
      resumeSessionId: state.claudeSessionId || undefined,
    })
  },

  stopSession: () => {
    const { sessionId } = get()
    window.api.chatStop(sessionId)
    set({ status: 'idle', currentActivity: '' })
  },

  clearMessages: () => {
    set({
      messages: [],
      status: 'idle',
      currentActivity: '',
      sessionId: `chat-${Date.now()}`,
      claudeSessionId: null,
      revision: 0,
    })
  },

  addSystemMessage: (content: string) => {
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: 'system', content, timestamp: Date.now() },
      ],
      revision: s.revision + 1,
    }))
  },

  setModel: (model: string) => {
    set({ model })
  },

  respondToPermission: (messageId: string, toolUseId: string, allowed: boolean) => {
    const { sessionId } = get()
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, permissionStatus: allowed ? 'allowed' as const : 'denied' as const }
          : m
      ),
      currentActivity: allowed ? 'Running tool...' : '',
      revision: s.revision + 1,
    }))
    window.api.chatPermissionResponse(sessionId, toolUseId, allowed)
  },
}))

function describePermission(toolName: string, input: any): string {
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input
    switch (toolName) {
      case 'Write': return `Write to ${parsed.file_path || 'file'}`
      case 'Edit': return `Edit ${parsed.file_path || 'file'}`
      case 'Bash': return parsed.command || 'Run a command'
      case 'Read': return `Read ${parsed.file_path || 'file'}`
      case 'Glob': return `Search files: ${parsed.pattern || ''}`
      case 'Grep': return `Search content: ${parsed.pattern || ''}`
      case 'WebFetch': return `Fetch ${parsed.url || 'URL'}`
      case 'WebSearch': return `Search: ${parsed.query || ''}`
      default: return `Use ${toolName}`
    }
  } catch {
    return `Use ${toolName}`
  }
}

// Stream event handler — call this from the component that sets up the IPC listener
export function handleChatStreamEvent(sessionId: string, event: any): void {
  const state = useChatStore.getState()
  if (state.sessionId !== sessionId) return

  switch (event.type) {
    case 'system': {
      if (event.session_id) {
        useChatStore.setState({ claudeSessionId: event.session_id })
      }
      useChatStore.setState({ status: 'running', currentActivity: 'Thinking...' })
      break
    }

    case 'message_start': {
      if (event.message?.role === 'assistant') {
        mutateAndFlush(
          (msgs) => msgs.push({ id: nextId(), role: 'assistant', content: '', timestamp: Date.now() }),
          { status: 'running', currentActivity: 'Writing...' },
        )
      }
      break
    }

    case 'assistant': {
      const content = typeof event.message?.content === 'string'
        ? event.message.content
        : Array.isArray(event.message?.content)
          ? event.message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
          : ''
      if (!content) break

      mutateAndFlush((msgs) => {
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && !last.toolName) {
          last.content += content
        } else {
          msgs.push({ id: nextId(), role: 'assistant', content, timestamp: Date.now() })
        }
      }, { currentActivity: 'Writing...' })
      break
    }

    case 'content_block_start': {
      if (event.content_block?.type === 'tool_use') {
        const toolName = event.content_block.name || 'Tool'
        const toolUseId = event.content_block.id || ''
        mutateAndFlush(
          (msgs) => msgs.push({
            id: nextId(), role: 'tool', content: '', toolName, toolInput: '', toolUseId,
            toolStatus: 'running', timestamp: Date.now(),
          }),
          { currentActivity: `Running ${toolName}...` },
        )
      } else if (event.content_block?.type === 'text') {
        mutateAndFlush(
          (msgs) => msgs.push({ id: nextId(), role: 'assistant', content: '', timestamp: Date.now() }),
          { currentActivity: 'Writing...' },
        )
      }
      break
    }

    case 'content_block_delta': {
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        mutateAndFlush((msgs) => {
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && !last.toolName) {
            last.content += event.delta.text
          } else {
            msgs.push({ id: nextId(), role: 'assistant', content: event.delta.text, timestamp: Date.now() })
          }
        }, { currentActivity: 'Writing...' })
      } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
        mutateAndFlush((msgs) => {
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'tool' && msgs[i].toolStatus === 'running') {
              msgs[i].toolInput = (msgs[i].toolInput || '') + event.delta.partial_json
              break
            }
          }
        })
      }
      break
    }

    case 'content_block_stop': {
      mutateAndFlush((msgs) => {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'tool' && msgs[i].toolStatus === 'running') {
            msgs[i].toolStatus = 'completed'
            break
          }
        }
      })
      break
    }

    case 'permission_request': {
      const toolName = event.tool?.name || event.tool_name || 'Tool'
      const toolInput = event.tool?.input || event.input || ''
      const toolUseId = event.tool?.id || event.tool_use_id || ''
      const description = describePermission(toolName, toolInput)

      mutateAndFlush(
        (msgs) => msgs.push({
          id: nextId(), role: 'permission',
          content: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2),
          permissionStatus: 'pending', permissionTool: toolName,
          permissionDescription: description, toolUseId, timestamp: Date.now(),
        }),
        { currentActivity: 'Waiting for permission...' },
      )
      break
    }

    case 'result': {
      const text = typeof event.result === 'string' ? event.result : ''
      if (text) {
        mutateAndFlush((msgs) => {
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && !last.toolName && !last.content) {
            last.content = text
          } else if (!last || last.role !== 'assistant' || last.toolName) {
            msgs.push({ id: nextId(), role: 'assistant', content: text, timestamp: Date.now() })
          }
        }, { status: 'completed', currentActivity: '' })
      } else {
        useChatStore.setState({ status: 'completed', currentActivity: '' })
      }
      if (event.session_id) {
        useChatStore.setState({ claudeSessionId: event.session_id })
      }
      break
    }

    case 'error': {
      const errorMsg = event.error || event.message || 'Unknown error'
      mutateAndFlush(
        (msgs) => msgs.push({ id: nextId(), role: 'system', content: `Error: ${errorMsg}`, timestamp: Date.now() }),
        { status: 'failed', currentActivity: '' },
      )
      break
    }

    case 'done': {
      useChatStore.setState((s) => ({
        status: s.status === 'running' ? 'completed' : s.status,
        currentActivity: '',
      }))
      break
    }

    case 'text': {
      if (event.content) {
        mutateAndFlush((msgs) => {
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && !last.toolName) {
            last.content += event.content
          } else {
            msgs.push({ id: nextId(), role: 'assistant', content: event.content, timestamp: Date.now() })
          }
        }, { currentActivity: 'Writing...' })
      }
      break
    }
  }
}
