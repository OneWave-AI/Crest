import { useMemo } from 'react'
import { useAcpStore } from '../../store/acpStore'
import type { RailData, RailFile } from './railTypes'

const EDIT_KINDS = new Set(['edit', 'delete', 'move'])

/**
 * Adapts an ACP session onto the shared rail.
 *
 * ACP gives us the same four things natively: `plan` entries are the task list,
 * tool-call `locations` are the files touched, and permission requests resolve
 * into real allow/reject decisions (unlike headless chat mode, which can only
 * set a posture up front — hence no `permission` block here).
 */
export function useAcpRail(sessionId: string): RailData {
  const slice = useAcpStore((store) => store.sessions[sessionId])

  return useMemo(() => {
    const items = slice?.items ?? []

    const filesTouched: RailFile[] = []
    for (const item of items) {
      if (item.kind !== 'tool') continue
      const action: RailFile['action'] = item.toolKind === 'read' ? 'read'
        : EDIT_KINDS.has(item.toolKind) ? 'edit'
        : item.content.some((c) => c.type === 'diff') ? 'edit'
        : 'read'
      for (const location of item.locations) {
        if (!location.path) continue
        const existing = filesTouched.find((f) => f.path === location.path)
        if (existing) {
          existing.count += 1
          if (action === 'edit') existing.action = 'edit'
        } else {
          filesTouched.unshift({ path: location.path, action, count: 1 })
        }
      }
    }

    return {
      agentLabel: slice?.state?.agentLabel ?? 'Agent',
      busy: slice?.state?.status === 'thinking',
      tasks: (slice?.plan ?? []).map((entry) => ({
        content: entry.content,
        status: entry.status,
      })),
      decisions: (slice?.decisions ?? []).map((decision) => ({
        id: decision.id,
        label: decision.label,
        detail: decision.detail,
        kind: decision.kind === 'permission' ? 'permission' : decision.kind,
        timestamp: decision.timestamp,
      })),
      filesTouched,
      // ACP asks in the moment, so there is no up-front posture to choose.
      permission: null,
    }
  }, [slice])
}
