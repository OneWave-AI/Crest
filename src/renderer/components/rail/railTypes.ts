/**
 * The rail is presentational. Each agent mode supplies this shape through an
 * adapter (useChatRail, useAcpRail) so chat and ACP sessions get the same
 * task list / folders / connectors / decisions surface without duplicated UI.
 */

export interface RailTask {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface RailDecision {
  id: string
  label: string
  detail?: string
  kind: 'blocked' | 'mode' | 'model' | 'folder' | 'cancel' | 'permission'
  timestamp: number
  /** Element id (without the `chat-msg-` prefix) to reveal when clicked. */
  anchorId?: string
}

export interface RailFile {
  path: string
  action: 'read' | 'edit' | 'write'
  count: number
}

/** Up-front permission posture for modes that can't prompt mid-turn. */
export interface RailPermission {
  mode: string
  options: string[]
  /** Mode the running turn actually launched with, when it differs from the pick. */
  activeMode: string | null
  onChange: (mode: string) => void
}

export interface RailData {
  /** Shown in the rail header, e.g. "Claude Code" or "chat". */
  agentLabel: string
  busy: boolean
  tasks: RailTask[]
  decisions: RailDecision[]
  filesTouched: RailFile[]
  permission: RailPermission | null
}
