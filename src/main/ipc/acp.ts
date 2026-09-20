/**
 * IPC surface for ACP sessions.
 *
 * One channel out (`acp:event`) carries every state change, session update and
 * permission request so the renderer has a single ordered stream to reduce over.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { AcpConnection } from '../services/acpConnection'
import {
  ACP_AGENTS,
  type AcpAgentId,
  type AcpContentBlock,
  type AcpEvent,
  type AcpSessionState,
  type AcpStartOptions
} from '../../shared/acp'

interface ManagedSession {
  connection: AcpConnection
  state: AcpSessionState
}

const sessions = new Map<string, ManagedSession>()

function broadcast(event: AcpEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('acp:event', event)
  }
}

function agentLabel(agentId: AcpAgentId): string {
  if (agentId === 'custom') return 'Custom agent'
  return ACP_AGENTS[agentId]?.label ?? agentId
}

function patchState(session: ManagedSession, patch: Partial<AcpSessionState>): void {
  session.state = { ...session.state, ...patch }
  broadcast({ type: 'state', sessionId: session.state.id, state: session.state })
}

function initialState(options: AcpStartOptions): AcpSessionState {
  return {
    id: options.sessionId,
    agentId: options.agentId,
    agentLabel: agentLabel(options.agentId),
    cwd: options.cwd,
    status: 'starting',
    acpSessionId: null,
    error: null,
    modes: [],
    currentModeId: null,
    models: [],
    currentModelId: null,
    availableCommands: [],
    authMethods: [],
    autoApprove: false,
    capabilities: {
      loadSession: false,
      promptImage: false,
      promptAudio: false,
      promptEmbeddedContext: false
    }
  }
}

function stopSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return
  session.connection.stop()
  sessions.delete(sessionId)
  patchState(session, { status: 'stopped' })
}

export function registerAcpHandlers(): void {
  ipcMain.handle('acp:start', async (_event, options: AcpStartOptions): Promise<AcpSessionState> => {
    stopSession(options.sessionId)

    const connection = new AcpConnection(options)
    // Requests answered by auto-approve, so the decision log can say so.
    const autoApproved = new Set<string>()
    const session: ManagedSession = { connection, state: initialState(options) }
    sessions.set(options.sessionId, session)
    broadcast({ type: 'state', sessionId: session.state.id, state: session.state })

    connection.on('update', (update) => {
      // Mirror the two updates that are really session state, so the renderer
      // doesn't have to keep a parallel copy.
      if (update.sessionUpdate === 'current_mode_update') {
        patchState(session, { currentModeId: update.currentModeId })
      } else if (update.sessionUpdate === 'available_commands_update') {
        patchState(session, { availableCommands: update.availableCommands })
      }
      broadcast({ type: 'update', sessionId: options.sessionId, update })
    })
    connection.on('permission', (request) => {
      // Auto-approve is the native, zero-egress replacement for Super Agent's
      // outer LLM: the agent already tells us which option means "allow", so
      // nothing has to read a terminal to work it out.
      if (session.state.autoApprove) {
        const allow =
          request.options.find((option) => option.kind === 'allow_always') ??
          request.options.find((option) => option.kind === 'allow_once')
        if (allow) {
          autoApproved.add(request.requestId)
          connection.resolvePermission(request.requestId, allow.optionId)
          return
        }
      }
      broadcast({ type: 'permission', sessionId: options.sessionId, request })
    })
    connection.on('terminal', (terminal) => {
      broadcast({ type: 'terminal', sessionId: options.sessionId, terminal })
    })
    connection.on('permission-resolved', (outcome) => {
      broadcast({
        type: 'permission-resolved',
        sessionId: options.sessionId,
        requestId: outcome.requestId,
        optionId: outcome.optionId,
        optionName: outcome.optionName,
        optionKind: outcome.optionKind,
        toolTitle: outcome.toolTitle,
        auto: autoApproved.delete(outcome.requestId)
      })
    })
    connection.on('state', (patch) => patchState(session, patch))
    connection.on('log', (level, message) => {
      broadcast({ type: 'log', sessionId: options.sessionId, level, message })
    })
    connection.on('exit', () => {
      sessions.delete(options.sessionId)
    })

    try {
      const patch = await connection.start()
      patchState(session, patch)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      connection.stop()
      sessions.delete(options.sessionId)
      patchState(session, { status: 'error', error: message })
    }

    return session.state
  })

  ipcMain.handle('acp:prompt', async (_event, sessionId: string, blocks: AcpContentBlock[]) => {
    const session = sessions.get(sessionId)
    if (!session) throw new Error('No such ACP session')

    patchState(session, { status: 'thinking' })
    try {
      const stopReason = await session.connection.prompt(blocks)
      broadcast({ type: 'turn-end', sessionId, stopReason })
      patchState(session, { status: 'ready' })
      return { stopReason }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      patchState(session, { status: 'error', error: message })
      throw err
    }
  })

  ipcMain.handle('acp:cancel', (_event, sessionId: string) => {
    sessions.get(sessionId)?.connection.cancel()
  })

  ipcMain.handle(
    'acp:permission-response',
    (_event, sessionId: string, requestId: string, optionId: string | null) => {
      sessions.get(sessionId)?.connection.resolvePermission(requestId, optionId)
    }
  )

  ipcMain.handle('acp:set-mode', async (_event, sessionId: string, modeId: string) => {
    await sessions.get(sessionId)?.connection.setMode(modeId)
  })

  ipcMain.handle('acp:set-model', async (_event, sessionId: string, modelId: string) => {
    await sessions.get(sessionId)?.connection.setModel(modelId)
  })

  ipcMain.handle('acp:authenticate', async (_event, sessionId: string, methodId: string) => {
    const session = sessions.get(sessionId)
    if (!session) throw new Error('No such ACP session')
    try {
      const patch = await session.connection.authenticate(methodId)
      patchState(session, patch)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      patchState(session, { status: 'authenticating', error: message })
      throw err
    }
    return session.state
  })

  ipcMain.handle('acp:set-auto-approve', (_event, sessionId: string, autoApprove: boolean) => {
    const session = sessions.get(sessionId)
    if (!session) return
    patchState(session, { autoApprove })
  })

  ipcMain.handle('acp:stop', (_event, sessionId: string) => {
    stopSession(sessionId)
  })

  ipcMain.handle('acp:get-state', (_event, sessionId: string) => {
    return sessions.get(sessionId)?.state ?? null
  })

  ipcMain.handle('acp:list-agents', () => Object.values(ACP_AGENTS))
}

/** Called on app shutdown so no agent processes are orphaned. */
export function stopAllAcpSessions(): void {
  for (const sessionId of [...sessions.keys()]) stopSession(sessionId)
}
