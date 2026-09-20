import React, { useEffect, useState } from 'react'
import { SidebarSimple } from '@phosphor-icons/react'
import { ConversationView } from './ConversationView'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import { handleChatStreamEvent } from './chatStore'
import { AgentRail } from '../rail/AgentRail'
import { useChatRail } from '../rail/useChatRail'
import { useChatColors } from './chatTheme'

interface ChatViewProps {
  cwd: string
}

const RAIL_WIDTH = 288
const RAIL_PREF_KEY = 'crest.chat.railOpen'

/** Chat mode's connectors come from the user's own CLI config, not from Crest. */
const CONNECTOR_NOTE =
  'Chat mode runs the Claude CLI, so it loads whichever MCP servers your CLI config enables. Toggling here edits that config; it takes effect on your next message.'

export default function ChatView({ cwd }: ChatViewProps) {
  const colors = useChatColors()
  const rail = useChatRail()
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return window.localStorage.getItem(RAIL_PREF_KEY) !== 'false'
    } catch {
      return true
    }
  })

  // Set up IPC listener for stream events
  useEffect(() => {
    const cleanup = window.api.onChatStreamEvent((sessionId: string, event: any) => {
      handleChatStreamEvent(sessionId, event)
    })
    return cleanup
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_PREF_KEY, String(railOpen))
    } catch { /* private mode — the default is fine */ }
  }, [railOpen])

  // Cmd+Shift+B mirrors the terminal sidebar's Cmd+B.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setRailOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full w-full min-w-0 chat-overlay" style={{ background: '#0d0d0d' }}>
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Centered chat container — max width for readability */}
        <div className="flex-1 flex flex-col min-h-0 w-full max-w-[860px] mx-auto">
          <div className="flex-1 flex flex-col min-h-0">
            <ConversationView />
          </div>
          <InputBar cwd={cwd} />
          <StatusBar cwd={cwd} />
        </div>

        {!railOpen && (
          <button
            onClick={() => setRailOpen(true)}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: colors.textTertiary, background: colors.surfacePrimary, border: `1px solid ${colors.toolBorder}` }}
            title="Show context rail (Cmd+Shift+B)"
          >
            <SidebarSimple size={13} />
          </button>
        )}
      </div>

      <div
        className="relative flex-shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: railOpen ? RAIL_WIDTH : 0 }}
      >
        <div className="h-full" style={{ width: RAIL_WIDTH }}>
          <AgentRail
            data={rail}
            connectorNote={CONNECTOR_NOTE}
            onCollapse={() => setRailOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
