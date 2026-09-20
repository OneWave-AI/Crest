import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  toolUseId?: string
  timestamp: number
  /** API message id, used to tell a streamed message from its final duplicate. */
  apiMessageId?: string
  /** Routed to the rail instead of the transcript (TodoWrite, for instance). */
  hidden?: boolean
  /**
   * This call has already been folded into the rail's derived state. A tool call
   * is reported twice (streamed deltas, then the complete assistant message), so
   * without this the "files touched" counts came out doubled.
   */
  absorbed?: boolean
}

export interface ChatTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

/** One entry in the "decisions made" audit trail shown in the rail. */
export interface ChatDecision {
  id: string
  kind: 'blocked' | 'mode' | 'model' | 'folder' | 'cancel'
  label: string
  detail?: string
  /** Message to scroll to when the entry is clicked. */
  messageId?: string
  timestamp: number
}

export interface ChatFileTouch {
  path: string
  action: 'read' | 'edit' | 'write'
  count: number
  lastAt: number
}

type ChatStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'failed'

/**
 * Print mode never prompts for permission — it decides up front from this mode
 * and reports a refusal as a failed tool. See main/ipc/chat.ts.
 */
export type ChatPermissionMode =
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'manual'
  | 'dontAsk'
  | 'plan'

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  currentActivity: string
  sessionId: string
  claudeSessionId: string | null
  model: string
  permissionMode: ChatPermissionMode
  /** Mode the running turn was actually launched with, echoed back by the harness. */
  activePermissionMode: ChatPermissionMode | null
  todos: ChatTodo[]
  decisions: ChatDecision[]
  filesTouched: ChatFileTouch[]
  /** Incremented on every message list change so subscribers can react cheaply */
  revision: number

  sendMessage: (prompt: string, cwd: string) => void
  stopSession: () => void
  clearMessages: () => void
  addSystemMessage: (content: string) => void
  setModel: (model: string) => void
  setPermissionMode: (mode: ChatPermissionMode) => void
  noteDecision: (entry: Omit<ChatDecision, 'id' | 'timestamp'>) => void
}

let msgCounter = 0
const nextId = () => `chat-msg-${++msgCounter}`
let decisionCounter = 0
const nextDecisionId = () => `chat-decision-${++decisionCounter}`
let sessionCounter = 0
/**
 * A timestamp alone collides when a session is cleared twice in the same
 * millisecond, and a repeated id would let the old process's late events land in
 * the fresh transcript.
 */
const nextSessionId = () => `chat-${Date.now()}-${++sessionCounter}`

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

/** Queue a patch onto the batch, preserving anything already queued this frame. */
function queuePatch(patch: Partial<ChatState>) {
  pendingUpdate = { ...pendingUpdate, ...patch }
  if (rafId === null) {
    rafId = requestAnimationFrame(flushBatch)
  }
}

/**
 * Derived collections as of *now*, including patches queued but not yet flushed.
 *
 * Reading straight from the store here loses data: several tool calls arrive in
 * one message and are folded in back-to-back within a single frame, so each one
 * would otherwise rebuild from the same stale base and only the last would stick.
 */
function derivedNow(): Pick<ChatState, 'todos' | 'filesTouched'> {
  const state = useChatStore.getState()
  return {
    todos: pendingUpdate?.todos ?? state.todos,
    filesTouched: pendingUpdate?.filesTouched ?? state.filesTouched,
  }
}

/**
 * Read a field including any queued-but-unflushed change. Anything reacting to an
 * event within the same frame that set it has to read through this, or it sees the
 * previous frame's value.
 */
function fieldNow<K extends keyof ChatState>(key: K): ChatState[K] {
  const queued = pendingUpdate?.[key]
  return queued === undefined ? useChatStore.getState()[key] : (queued as ChatState[K])
}

/** Mutate messages array in-place for streaming perf, then schedule a single store flush. */
function mutateAndFlush(mutator: (msgs: ChatMessage[]) => void, extraPatch?: Partial<ChatState>) {
  const state = useChatStore.getState()
  mutator(state.messages)
  queuePatch({
    ...extraPatch,
    messages: state.messages, // same reference — zustand won't diff internals
    revision: state.revision + 1,
  })
}

/**
 * Append a decision through the batch.
 *
 * Everything that touches `messages` or `decisions` has to go through the queue.
 * A plain `set()` builds a fresh array while a queued patch still points at the
 * previous one, so the next flush would quietly undo it — that is how the
 * "tool was blocked" explanation used to disappear a frame after appearing.
 */
function queueDecision(entry: Omit<ChatDecision, 'id' | 'timestamp'>) {
  const base = fieldNow('decisions')
  queuePatch({
    decisions: [...base, { ...entry, id: nextDecisionId(), timestamp: Date.now() }],
  })
}

/** Drop anything queued — used when the session is reset out from under it. */
function discardBatch() {
  pendingUpdate = null
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  currentActivity: '',
  sessionId: nextSessionId(),
  claudeSessionId: null,
  model: 'claude-sonnet-4-6',
  permissionMode: 'acceptEdits',
  activePermissionMode: null,
  todos: [],
  decisions: [],
  filesTouched: [],
  revision: 0,

  sendMessage: (prompt: string, cwd: string) => {
    const state = get()
    const sessionId = state.sessionId

    mutateAndFlush(
      (msgs) => msgs.push({ id: nextId(), role: 'user', content: prompt, timestamp: Date.now() }),
      { status: 'running', currentActivity: 'Thinking...' },
    )

    window.api.chatSendPrompt({
      sessionId,
      prompt,
      cwd,
      model: state.model,
      resumeSessionId: state.claudeSessionId || undefined,
      permissionMode: state.permissionMode,
    })
  },

  stopSession: () => {
    const { sessionId } = get()
    window.api.chatStop(sessionId)
    queueDecision({ kind: 'cancel', label: 'Stopped the turn' })
    queuePatch({ status: 'idle', currentActivity: '' })
  },

  clearMessages: () => {
    // Preferences the user just changed may still be sitting in the batch; keep
    // those, drop the transcript work, then reset.
    const permissionMode = pendingUpdate?.permissionMode ?? get().permissionMode
    const model = pendingUpdate?.model ?? get().model
    discardBatch()
    set({
      messages: [],
      status: 'idle',
      currentActivity: '',
      sessionId: nextSessionId(),
      claudeSessionId: null,
      todos: [],
      decisions: [],
      filesTouched: [],
      activePermissionMode: null,
      permissionMode,
      model,
      revision: 0,
    })
  },

  addSystemMessage: (content: string) => {
    mutateAndFlush((msgs) => msgs.push({
      id: nextId(), role: 'system', content, timestamp: Date.now(),
    }))
  },

  setModel: (model: string) => {
    queueDecision({ kind: 'model', label: 'Model set', detail: model })
    queuePatch({ model })
  },

  setPermissionMode: (mode: ChatPermissionMode) => {
    queueDecision({ kind: 'mode', label: 'Permission mode set', detail: mode })
    queuePatch({ permissionMode: mode })
  },

  noteDecision: (entry) => queueDecision(entry),
}))

// --- Derivation from tool calls -------------------------------------------------

function parseInput(input: unknown): Record<string, any> | null {
  if (!input) return null
  if (typeof input === 'object') return input as Record<string, any>
  try {
    return JSON.parse(String(input))
  } catch {
    return null
  }
}

const FILE_TOOL_ACTIONS: Record<string, ChatFileTouch['action']> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
}

/** Fold a completed tool call into the rail's derived state. */
function absorbToolCall(toolName: string | undefined, rawInput: unknown): Partial<ChatState> | null {
  if (!toolName) return null
  const input = parseInput(rawInput)
  if (!input) return null

  if (toolName === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos: ChatTodo[] = input.todos
      .filter((t: any) => t && typeof t.content === 'string')
      .map((t: any) => ({
        content: t.content,
        status: t.status === 'in_progress' || t.status === 'completed' ? t.status : 'pending',
        activeForm: typeof t.activeForm === 'string' ? t.activeForm : undefined,
      }))
    return { todos }
  }

  const action = FILE_TOOL_ACTIONS[toolName]
  const path = typeof input.file_path === 'string' ? input.file_path
    : typeof input.notebook_path === 'string' ? input.notebook_path
    : null
  if (action && path) {
    const existing = derivedNow().filesTouched
    const index = existing.findIndex((f) => f.path === path)
    const next = [...existing]
    if (index === -1) {
      next.unshift({ path, action, count: 1, lastAt: Date.now() })
    } else {
      // A write outranks a read for how the file should be labelled.
      const prev = next[index]
      const action_ = prev.action === 'write' || action === 'write' ? 'write'
        : prev.action === 'edit' || action === 'edit' ? 'edit'
        : 'read'
      next.splice(index, 1)
      next.unshift({ path, action: action_, count: prev.count + 1, lastAt: Date.now() })
    }
    return { filesTouched: next.slice(0, 100) }
  }

  return null
}

/**
 * Print mode's way of saying "the current permission mode forbids this".
 * There is no prompt to answer — the only fix is a different mode.
 */
const PERMISSION_DENIED = /requested permissions? to|haven't granted it yet|permission to use|requires approval/i

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block: any) => (typeof block === 'string' ? block : block?.text ?? ''))
      .join('')
  }
  return ''
}

// Stream event handler — call this from the component that sets up the IPC listener
export function handleChatStreamEvent(sessionId: string, event: any): void {
  const state = useChatStore.getState()
  if (state.sessionId !== sessionId) return

  switch (event.type) {
    // Emitted by our own harness, not the CLI: which mode this turn really runs under.
    case 'harness_info': {
      queuePatch({ activePermissionMode: event.permissionMode ?? null })
      break
    }

    case 'system': {
      if (event.session_id) {
        queuePatch({ claudeSessionId: event.session_id })
      }
      queuePatch({ status: 'running', currentActivity: 'Thinking...' })
      break
    }

    case 'message_start': {
      if (event.message?.role === 'assistant') {
        const apiMessageId = event.message?.id
        mutateAndFlush(
          (msgs) => msgs.push({
            id: nextId(), role: 'assistant', content: '', timestamp: Date.now(), apiMessageId,
          }),
          { status: 'running', currentActivity: 'Writing...' },
        )
      }
      break
    }

    // The complete assistant message. With --include-partial-messages this arrives
    // *after* the deltas that already built the text, so appending again would
    // double every reply. It is still the authoritative source for tool inputs.
    case 'assistant': {
      const apiMessageId = event.message?.id
      const blocks = Array.isArray(event.message?.content) ? event.message.content : []

      for (const block of blocks) {
        if (block?.type !== 'tool_use') continue
        // Upsert the tool row with the authoritative input, absorbing it into the
        // rail only if the streamed pass didn't already.
        mutateAndFlush((msgs) => {
          const existing = msgs.find((m) => m.role === 'tool' && m.toolUseId === block.id)
          const serialized = typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input ?? {})
          const target: ChatMessage = existing ?? {
            id: nextId(), role: 'tool', content: '', toolName: block.name || 'Tool',
            toolInput: serialized, toolUseId: block.id, toolStatus: 'running',
            timestamp: Date.now(), hidden: block.name === 'TodoWrite',
          }
          if (existing) {
            existing.toolInput = serialized
            existing.toolName = block.name || existing.toolName
            // Status stays 'running' until the tool_result says how it went —
            // the model asking for a tool is not the tool succeeding.
            if (block.name === 'TodoWrite') existing.hidden = true
          } else {
            msgs.push(target)
          }
          if (!target.absorbed) {
            // Queue immediately rather than accumulating locally: the next block in
            // this same message reads the queued value as its base, which is how a
            // message touching three files records all three instead of just one.
            const absorbed = absorbToolCall(block.name, block.input)
            if (absorbed) queuePatch(absorbed)
            target.absorbed = true
          }
        })
      }

      const text = typeof event.message?.content === 'string'
        ? event.message.content
        : blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

      // Two ways to recognise text we already streamed: the id matches a row that
      // has content, or the newest assistant row already ends with this text (for
      // streams that arrive without a message_start).
      const tail = [...state.messages].reverse().find((m) => m.role === 'assistant' && !m.toolName)
      const alreadyStreamed = Boolean(
        (apiMessageId && state.messages.some((m) => m.apiMessageId === apiMessageId && m.content.length > 0)) ||
        (text && tail?.content.trim() === text.trim())
      )

      if (text && !alreadyStreamed) {
        mutateAndFlush((msgs) => {
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && !last.toolName && !last.content) {
            last.content = text
            last.apiMessageId = apiMessageId
          } else {
            msgs.push({ id: nextId(), role: 'assistant', content: text, timestamp: Date.now(), apiMessageId })
          }
        }, { currentActivity: 'Writing...' })
      }
      break
    }

    // Tool results come back as a synthetic user turn. Without this, a tool that
    // failed — including one the permission mode refused — rendered as a green
    // "completed" row and the user was never told anything went wrong.
    case 'user': {
      const blocks = Array.isArray(event.message?.content) ? event.message.content : []
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue
        const text = toolResultText(block.content)
        const isError = Boolean(block.is_error)

        mutateAndFlush((msgs) => {
          const target = msgs.find((m) => m.role === 'tool' && m.toolUseId === block.tool_use_id)
          if (!target) return
          target.toolStatus = isError ? 'error' : 'completed'
          if (text) target.content = text
        })

        if (isError && PERMISSION_DENIED.test(text)) {
          const target = state.messages.find(
            (m) => m.role === 'tool' && m.toolUseId === block.tool_use_id
          )
          const tool = target?.toolName ?? 'A tool'
          const mode = fieldNow('activePermissionMode') ?? fieldNow('permissionMode')
          useChatStore.getState().noteDecision({
            kind: 'blocked',
            label: `${tool} blocked`,
            detail: `permission mode: ${mode}`,
            messageId: target?.id,
          })
          useChatStore.getState().addSystemMessage(
            `${tool} was blocked by permission mode "${mode}". Headless sessions can't ask for approval — switch the mode in the rail to allow it.`
          )
        }
      }
      break
    }

    case 'content_block_start': {
      if (event.content_block?.type === 'tool_use') {
        const toolName = event.content_block.name || 'Tool'
        const toolUseId = event.content_block.id || ''
        mutateAndFlush(
          (msgs) => msgs.push({
            id: nextId(), role: 'tool', content: '', toolName, toolInput: '', toolUseId,
            toolStatus: 'running', timestamp: Date.now(), hidden: toolName === 'TodoWrite',
          }),
          { currentActivity: `Running ${toolName}...` },
        )
      } else if (event.content_block?.type === 'text') {
        mutateAndFlush(
          (msgs) => {
            // message_start already opened an empty assistant row; opening a second
            // one here orphans the first and, worse, detaches the streamed text from
            // its apiMessageId — which is how the final `assistant` message used to
            // get appended a second time.
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant' && !last.toolName && !last.content) return
            msgs.push({ id: nextId(), role: 'assistant', content: '', timestamp: Date.now() })
          },
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
      let absorbed: Partial<ChatState> | null = null
      mutateAndFlush((msgs) => {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'tool' && msgs[i].toolStatus === 'running') {
            // Leave the status alone — the tool_result decides whether it worked.
            if (!msgs[i].absorbed) {
              absorbed = absorbToolCall(msgs[i].toolName, msgs[i].toolInput)
              msgs[i].absorbed = true
            }
            break
          }
        }
      })
      if (absorbed) queuePatch(absorbed)
      break
    }

    case 'result': {
      // Nothing else is coming, so no tool row should still be spinning.
      mutateAndFlush((msgs) => {
        for (const msg of msgs) {
          if (msg.role === 'tool' && msg.toolStatus === 'running') msg.toolStatus = 'completed'
        }
      })

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
        queuePatch({ status: 'completed', currentActivity: '' })
      }
      if (event.session_id) {
        queuePatch({ claudeSessionId: event.session_id })
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
      const current = fieldNow('status')
      queuePatch({
        status: current === 'running' ? 'completed' : current,
        currentActivity: '',
      })
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
