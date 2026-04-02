import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
}

type ChatStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'failed'

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  currentActivity: string
  sessionId: string
  claudeSessionId: string | null
  model: string

  sendMessage: (prompt: string, cwd: string) => void
  stopSession: () => void
  clearMessages: () => void
  addSystemMessage: (content: string) => void
  setModel: (model: string) => void
}

let msgCounter = 0
const nextId = () => `chat-msg-${++msgCounter}`

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  currentActivity: '',
  sessionId: `chat-${Date.now()}`,
  claudeSessionId: null,
  model: 'claude-sonnet-4-6',

  sendMessage: (prompt: string, cwd: string) => {
    const state = get()
    const sessionId = state.sessionId

    // Add user message
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: 'user', content: prompt, timestamp: Date.now() },
      ],
      status: 'running',
      currentActivity: 'Thinking...',
    }))

    // Send to main process
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
    })
  },

  addSystemMessage: (content: string) => {
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: 'system', content, timestamp: Date.now() },
      ],
    }))
  },

  setModel: (model: string) => {
    set({ model })
  },
}))

// Stream event handler — call this from the component that sets up the IPC listener
export function handleChatStreamEvent(sessionId: string, event: any): void {
  const state = useChatStore.getState()
  if (state.sessionId !== sessionId) return

  console.log('[chatStore:event]', event.type, JSON.stringify(event).substring(0, 150))

  switch (event.type) {
    case 'system': {
      // Session init
      if (event.session_id) {
        useChatStore.setState({ claudeSessionId: event.session_id })
      }
      useChatStore.setState({ status: 'running', currentActivity: 'Thinking...' })
      break
    }

    case 'message_start': {
      // Claude API message_start — create assistant message placeholder
      if (event.message?.role === 'assistant') {
        useChatStore.setState((s) => ({
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: '', timestamp: Date.now() },
          ],
          status: 'running',
          currentActivity: 'Writing...',
        }))
      }
      break
    }

    case 'assistant': {
      // Text from assistant — could be partial or complete
      const content = typeof event.message?.content === 'string'
        ? event.message.content
        : Array.isArray(event.message?.content)
          ? event.message.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('')
          : ''

      if (!content) break

      useChatStore.setState((s) => {
        const msgs = [...s.messages]
        const lastMsg = msgs[msgs.length - 1]

        if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
          // Append to existing assistant message
          msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + content }
        } else {
          msgs.push({ id: nextId(), role: 'assistant', content, timestamp: Date.now() })
        }

        return { messages: msgs, currentActivity: 'Writing...' }
      })
      break
    }

    case 'content_block_start': {
      if (event.content_block?.type === 'tool_use') {
        const toolName = event.content_block.name || 'Tool'
        useChatStore.setState((s) => ({
          messages: [
            ...s.messages,
            {
              id: nextId(),
              role: 'tool',
              content: '',
              toolName,
              toolInput: '',
              toolStatus: 'running',
              timestamp: Date.now(),
            },
          ],
          currentActivity: `Running ${toolName}...`,
        }))
      } else if (event.content_block?.type === 'text') {
        // New text block — start fresh assistant message
        useChatStore.setState((s) => ({
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: '', timestamp: Date.now() },
          ],
          currentActivity: 'Writing...',
        }))
      }
      break
    }

    case 'content_block_delta': {
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        useChatStore.setState((s) => {
          const msgs = [...s.messages]
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
            msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + event.delta.text }
          } else {
            // No assistant message yet — create one defensively
            msgs.push({ id: nextId(), role: 'assistant', content: event.delta.text, timestamp: Date.now() })
          }
          return { messages: msgs, currentActivity: 'Writing...' }
        })
      } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
        useChatStore.setState((s) => {
          const msgs = [...s.messages]
          let idx = -1
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'tool' && msgs[i].toolStatus === 'running') { idx = i; break }
          }
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], toolInput: (msgs[idx].toolInput || '') + event.delta.partial_json }
          }
          return { messages: msgs }
        })
      }
      break
    }

    case 'content_block_stop': {
      // Mark last running tool as completed (immutable update)
      useChatStore.setState((s) => {
        const msgs = [...s.messages]
        let idx = -1
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'tool' && msgs[i].toolStatus === 'running') { idx = i; break }
        }
        if (idx >= 0) {
          msgs[idx] = { ...msgs[idx], toolStatus: 'completed' }
        }
        return { messages: msgs }
      })
      break
    }

    case 'result': {
      // Final result with cost data
      const text = typeof event.result === 'string' ? event.result : ''
      if (text) {
        useChatStore.setState((s) => {
          const msgs = [...s.messages]
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.role === 'assistant' && !lastMsg.toolName && !lastMsg.content) {
            msgs[msgs.length - 1] = { ...lastMsg, content: text }
          } else if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.toolName) {
            msgs.push({ id: nextId(), role: 'assistant', content: text, timestamp: Date.now() })
          }
          return { messages: msgs, status: 'completed', currentActivity: '' }
        })
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
      useChatStore.setState((s) => ({
        messages: [
          ...s.messages,
          { id: nextId(), role: 'system', content: `Error: ${errorMsg}`, timestamp: Date.now() },
        ],
        status: 'failed',
        currentActivity: '',
      }))
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
      // Plain text fallback
      if (event.content) {
        useChatStore.setState((s) => {
          const msgs = [...s.messages]
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
            msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + event.content }
          } else {
            msgs.push({ id: nextId(), role: 'assistant', content: event.content, timestamp: Date.now() })
          }
          return { messages: msgs, currentActivity: 'Writing...' }
        })
      }
      break
    }
  }
}
