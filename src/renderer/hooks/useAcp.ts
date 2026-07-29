import { useCallback, useEffect, useMemo } from 'react'
import type { AcpAgentId, AcpContentBlock } from '@shared/acp'
import { useAcpStore, type AcpTimelineItem } from '../store/acpStore'

export type { AcpTimelineItem }

const EMPTY_SLICE = {
  state: null,
  items: [] as AcpTimelineItem[],
  plan: [],
  permission: null,
  logs: [],
  terminals: {}
} as const

/**
 * View-model for one ACP session.
 *
 * All accumulation lives in the store (subscribed at module scope), so this hook
 * is only selection plus actions — unmounting the view loses nothing.
 */
export function useAcp(sessionId: string) {
  const slice = useAcpStore((store) => store.sessions[sessionId]) ?? EMPTY_SLICE
  const patch = useAcpStore((store) => store.patch)
  const reset = useAcpStore((store) => store.reset)
  const appendItem = useAcpStore((store) => store.appendItem)

  const { state, items, plan, permission, logs, terminals } = slice

  // Fire-and-forget controls: surface failures in the timeline instead of
  // letting the invoke rejection escape as an unhandled promise.
  const reportFailure = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      appendItem(sessionId, { kind: 'error', id: `err-${Date.now()}`, text: message })
    },
    [sessionId, appendItem]
  )

  const start = useCallback(
    async (agentId: AcpAgentId, cwd: string, resumeAcpSessionId?: string) => {
      reset(sessionId)
      const result = await window.api.acpStart({ sessionId, agentId, cwd, resumeAcpSessionId })
      patch(sessionId, (current) => ({ ...current, state: result }))
      return result
    },
    [sessionId, reset, patch]
  )

  const send = useCallback(
    async (text: string, attachments: AcpContentBlock[] = []) => {
      const trimmed = text.trim()
      if (!trimmed && attachments.length === 0) return

      const blocks: AcpContentBlock[] = [
        ...(trimmed ? [{ type: 'text' as const, text: trimmed }] : []),
        ...attachments
      ]

      const label = attachments.length
        ? `${trimmed}${trimmed ? '\n' : ''}[${attachments.length} attachment${attachments.length === 1 ? '' : 's'}]`
        : trimmed
      appendItem(sessionId, { kind: 'user', id: `local-${Date.now()}`, text: label })

      try {
        await window.api.acpPrompt(sessionId, blocks)
      } catch (err) {
        reportFailure(err)
      }
    },
    [sessionId, appendItem, reportFailure]
  )

  const authenticate = useCallback(
    async (methodId: string) => {
      try {
        const result = await window.api.acpAuthenticate(sessionId, methodId)
        patch(sessionId, (current) => ({ ...current, state: result }))
      } catch (err) {
        reportFailure(err)
      }
    },
    [sessionId, patch, reportFailure]
  )

  const setAutoApprove = useCallback(
    (autoApprove: boolean) =>
      window.api.acpSetAutoApprove(sessionId, autoApprove).catch(reportFailure),
    [sessionId, reportFailure]
  )

  const cancel = useCallback(
    () => window.api.acpCancel(sessionId).catch(reportFailure),
    [sessionId, reportFailure]
  )
  const stop = useCallback(
    () => window.api.acpStop(sessionId).catch(reportFailure),
    [sessionId, reportFailure]
  )
  const setMode = useCallback(
    (modeId: string) => window.api.acpSetMode(sessionId, modeId).catch(reportFailure),
    [sessionId, reportFailure]
  )
  const setModel = useCallback(
    (modelId: string) => window.api.acpSetModel(sessionId, modelId).catch(reportFailure),
    [sessionId, reportFailure]
  )
  const respondPermission = useCallback(
    (requestId: string, optionId: string | null) => {
      patch(sessionId, (current) => ({ ...current, permission: null }))
      return window.api.acpPermissionResponse(sessionId, requestId, optionId).catch(reportFailure)
    },
    [sessionId, patch, reportFailure]
  )

  // The agent outlives this component, so pick the live session back up rather
  // than showing a false "Not connected" after a remount.
  useEffect(() => {
    let cancelled = false
    window.api
      .acpGetState(sessionId)
      .then((existing) => {
        if (!cancelled && existing) patch(sessionId, (current) => ({ ...current, state: existing }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sessionId, patch])

  const busy = state?.status === 'thinking'
  const connected = state?.status === 'ready' || state?.status === 'thinking'
  const needsAuth = state?.status === 'authenticating'

  return useMemo(
    () => ({
      state,
      items,
      plan,
      permission,
      logs,
      terminals,
      busy,
      connected,
      needsAuth,
      start,
      send,
      authenticate,
      setAutoApprove,
      cancel,
      stop,
      setMode,
      setModel,
      respondPermission
    }),
    [
      state,
      items,
      plan,
      permission,
      logs,
      terminals,
      busy,
      connected,
      needsAuth,
      start,
      send,
      authenticate,
      setAutoApprove,
      cancel,
      stop,
      setMode,
      setModel,
      respondPermission
    ]
  )
}
