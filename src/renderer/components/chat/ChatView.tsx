import React, { useEffect } from 'react'
import { ConversationView } from './ConversationView'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import { handleChatStreamEvent } from './chatStore'

interface ChatViewProps {
  cwd: string
}

export default function ChatView({ cwd }: ChatViewProps) {
  // Set up IPC listener for stream events
  useEffect(() => {
    const cleanup = window.api.onChatStreamEvent((sessionId: string, event: any) => {
      handleChatStreamEvent(sessionId, event)
    })
    return cleanup
  }, [])

  return (
    <div className="flex flex-col h-full w-full chat-overlay" style={{ background: '#0d0d0d' }}>
      {/* Centered chat container — max width for readability */}
      <div className="flex-1 flex flex-col min-h-0 w-full max-w-[860px] mx-auto">
        <div className="flex-1 flex flex-col min-h-0">
          <ConversationView />
        </div>
        <InputBar cwd={cwd} />
        <StatusBar cwd={cwd} />
      </div>
    </div>
  )
}
