import { create } from 'zustand'
import type {
  AcpEvent,
  AcpPermissionRequest,
  AcpPlanEntry,
  AcpSessionState,
  AcpSessionUpdate,
  AcpTerminalState,
  AcpToolCallContent,
  AcpToolCallLocation,
  AcpToolKind,
  AcpToolStatus
} from '@shared/acp'

export type AcpTimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool'
      id: string
      toolCallId: string
      title: string
      toolKind: AcpToolKind
      status: AcpToolStatus
      content: AcpToolCallContent[]
      locations: AcpToolCallLocation[]
      rawInput?: Record<string, unknown>
    }
  | { kind: 'error'; id: string; text: string }

export interface AcpSessionSlice {
  state: AcpSessionState | null
  items: AcpTimelineItem[]
  plan: AcpPlanEntry[]
  permission: AcpPermissionRequest | null
  logs: { level: 'info' | 'error'; message: string }[]
  terminals: Record<string, AcpTerminalState>
}

const EMPTY_SLICE: AcpSessionSlice = {
  state: null,
  items: [],
  plan: [],
  permission: null,
  logs: [],
  terminals: {}
}

interface AcpStore {
  sessions: Record<string, AcpSessionSlice>
  patch: (sessionId: string, updater: (slice: AcpSessionSlice) => AcpSessionSlice) => void
  reset: (sessionId: string) => void
  appendItem: (sessionId: string, item: AcpTimelineItem) => void
}

export const useAcpStore = create<AcpStore>((set) => ({
  sessions: {},
  patch: (sessionId, updater) =>
    set((store) => ({
      sessions: {
        ...store.sessions,
        [sessionId]: updater(store.sessions[sessionId] ?? EMPTY_SLICE)
      }
    })),
  reset: (sessionId) =>
    set((store) => ({ sessions: { ...store.sessions, [sessionId]: EMPTY_SLICE } })),
  appendItem: (sessionId, item) =>
    set((store) => {
      const slice = store.sessions[sessionId] ?? EMPTY_SLICE
      return {
        sessions: { ...store.sessions, [sessionId]: { ...slice, items: [...slice.items, item] } }
      }
    })
}))

export function getAcpSlice(sessionId: string): AcpSessionSlice {
  return useAcpStore.getState().sessions[sessionId] ?? EMPTY_SLICE
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function blockText(block: { type: string; text?: string; uri?: string; name?: string; resource?: { text?: string } } | undefined): string {
  if (!block) return ''
  if (block.type === 'text') return block.text ?? ''
  if (block.type === 'resource') return block.resource?.text ?? ''
  if (block.type === 'resource_link') return block.uri ?? block.name ?? ''
  return ''
}

/**
 * Folds one session update into the timeline.
 *
 * Pure function of typed protocol messages — the thing PTY scraping could never be.
 */
export function reduceUpdate(items: AcpTimelineItem[], update: AcpSessionUpdate): AcpTimelineItem[] {
  switch (update.sessionUpdate) {
    // The agent echoing back the prompt we already rendered locally. Ignored for
    // live turns; session/load replay is the one case where it is the only source,
    // and that path clears the timeline first so there is nothing to duplicate.
    case 'user_message_chunk': {
      const text = blockText(update.content)
      if (!text) return items
      const last = items[items.length - 1]
      if (last && last.kind === 'user') return items
      return [...items, { kind: 'user', id: nextId('user'), text }]
    }

    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      const kind = update.sessionUpdate === 'agent_thought_chunk' ? 'thought' : 'agent'
      const text = blockText(update.content)
      if (!text) return items
      const last = items[items.length - 1]
      if (last && last.kind === kind) {
        return [...items.slice(0, -1), { ...last, text: last.text + text }]
      }
      return [...items, { kind, id: nextId(kind), text }]
    }

    case 'tool_call': {
      // Agents may send `tool_call` more than once for the same id — Claude Code
      // emits a generic one ("Terminal") then refines it. Treat a repeat as an
      // update so the timeline doesn't double up.
      const index = items.findIndex((item) => item.kind === 'tool' && item.toolCallId === update.toolCallId)
      if (index !== -1) {
        const existing = items[index] as Extract<AcpTimelineItem, { kind: 'tool' }>
        const next = [...items]
        next[index] = {
          ...existing,
          title: update.title || existing.title,
          toolKind: update.kind ?? existing.toolKind,
          status: update.status ?? existing.status,
          content: update.content?.length ? update.content : existing.content,
          locations: update.locations?.length ? update.locations : existing.locations,
          rawInput: update.rawInput ?? existing.rawInput
        }
        return next
      }
      return [
        ...items,
        {
          kind: 'tool',
          id: nextId('tool'),
          toolCallId: update.toolCallId,
          title: update.title,
          toolKind: update.kind ?? 'other',
          status: update.status ?? 'pending',
          content: update.content ?? [],
          locations: update.locations ?? [],
          rawInput: update.rawInput
        }
      ]
    }

    case 'tool_call_update': {
      const index = items.findIndex((item) => item.kind === 'tool' && item.toolCallId === update.toolCallId)
      if (index === -1) return items
      const existing = items[index] as Extract<AcpTimelineItem, { kind: 'tool' }>
      const next = [...items]
      next[index] = {
        ...existing,
        title: update.title ?? existing.title,
        toolKind: update.kind ?? existing.toolKind,
        status: update.status ?? existing.status,
        // ACP semantics: a present collection replaces, null/absent keeps.
        content: update.content ?? existing.content,
        locations: update.locations ?? existing.locations,
        rawInput: update.rawInput ?? existing.rawInput
      }
      return next
    }

    default:
      return items
  }
}

function applyEvent(event: AcpEvent): void {
  const { patch } = useAcpStore.getState()

  patch(event.sessionId, (slice) => {
    switch (event.type) {
      case 'state':
        return { ...slice, state: event.state }

      case 'permission':
        return { ...slice, permission: event.request }

      case 'permission-resolved':
        return slice.permission?.requestId === event.requestId ? { ...slice, permission: null } : slice

      case 'log':
        return { ...slice, logs: [...slice.logs.slice(-199), { level: event.level, message: event.message }] }

      case 'terminal':
        return { ...slice, terminals: { ...slice.terminals, [event.terminal.terminalId]: event.terminal } }

      case 'turn-end':
        if (event.stopReason === 'end_turn' || event.stopReason === 'cancelled') return slice
        return {
          ...slice,
          items: [...slice.items, { kind: 'error', id: nextId('stop'), text: `Turn stopped: ${event.stopReason}` }]
        }

      case 'update':
        if (event.update.sessionUpdate === 'plan') {
          return { ...slice, plan: event.update.entries }
        }
        return { ...slice, items: reduceUpdate(slice.items, event.update) }

      default:
        return slice
    }
  })
}

/**
 * Subscribed at module scope, not from a component.
 *
 * The agent keeps working while the ACP view is unmounted (switching to the
 * terminal tab, for instance). A component-scoped listener would silently drop
 * every update in that window.
 */
if (typeof window !== 'undefined' && window.api?.onAcpEvent) {
  window.api.onAcpEvent(applyEvent)
}
