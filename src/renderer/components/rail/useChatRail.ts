import { useCallback, useEffect, useMemo, useState } from 'react'
import { useChatStore, type ChatPermissionMode } from '../chat/chatStore'
import type { RailData } from './railTypes'

const FALLBACK_MODES: ChatPermissionMode[] = [
  'acceptEdits', 'auto', 'plan', 'dontAsk', 'manual', 'bypassPermissions',
]

/** Adapts chat mode (Claude CLI, headless) onto the shared rail. */
export function useChatRail(): RailData {
  const status = useChatStore((s) => s.status)
  const todos = useChatStore((s) => s.todos)
  const decisions = useChatStore((s) => s.decisions)
  const filesTouched = useChatStore((s) => s.filesTouched)
  const permissionMode = useChatStore((s) => s.permissionMode)
  const activePermissionMode = useChatStore((s) => s.activePermissionMode)
  const setPermissionMode = useChatStore((s) => s.setPermissionMode)

  const [modes, setModes] = useState<string[]>(FALLBACK_MODES)

  // The main process owns the list the installed CLI actually accepts.
  useEffect(() => {
    window.api.chatPermissionModes?.()
      .then((list) => { if (list?.length) setModes(list) })
      .catch(() => undefined)
  }, [])

  const onChange = useCallback(
    (mode: string) => setPermissionMode(mode as ChatPermissionMode),
    [setPermissionMode]
  )

  return useMemo(() => ({
    agentLabel: 'Claude Code (chat)',
    busy: status === 'running' || status === 'connecting',
    tasks: todos,
    decisions: decisions.map((d) => ({
      id: d.id,
      label: d.label,
      detail: d.detail,
      kind: d.kind,
      timestamp: d.timestamp,
      anchorId: d.messageId,
    })),
    filesTouched: filesTouched.map((f) => ({ path: f.path, action: f.action, count: f.count })),
    permission: {
      mode: permissionMode,
      options: modes,
      activeMode: activePermissionMode,
      onChange,
    },
  }), [status, todos, decisions, filesTouched, permissionMode, activePermissionMode, modes, onChange])
}
