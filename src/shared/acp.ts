/**
 * Agent Client Protocol (ACP) — shared types.
 *
 * ACP is the open JSON-RPC protocol (created by Zed, now supported by Claude Code,
 * Codex, Gemini CLI, OpenCode, Goose and 25+ agents) that lets a GUI talk to a coding
 * agent over stdio with *structured* messages instead of screen-scraping a PTY.
 *
 * Only the subset Crest renders lives here, so the renderer never imports the
 * protocol package.
 */

export const ACP_PROTOCOL_VERSION = 1

export type AcpAgentId = 'claude' | 'codex' | 'gemini' | 'custom'

export interface AcpAgentSpec {
  id: AcpAgentId
  label: string
  /** Package that provides the ACP bridge, run through npx when not installed. */
  package?: string
  /**
   * Binary names to look for on PATH / in the usual npm-global spots, most
   * preferred first. Both bridges were renamed in 2026, so the older binary is
   * kept as a fallback rather than forcing an npx download on anyone who already
   * has it installed.
   */
  binaries?: string[]
  command?: string
  args?: string[]
  experimental?: boolean
}

export const ACP_AGENTS: Record<Exclude<AcpAgentId, 'custom'>, AcpAgentSpec> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    package: '@agentclientprotocol/claude-agent-acp',
    binaries: ['claude-agent-acp', 'claude-code-acp']
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    package: '@agentclientprotocol/codex-acp',
    binaries: ['codex-acp'],
    experimental: true
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    binaries: ['gemini'],
    args: ['--experimental-acp'],
    experimental: true
  }
}

// --- Content -----------------------------------------------------------------

export interface AcpContentBlock {
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link'
  text?: string
  data?: string
  mimeType?: string
  uri?: string
  name?: string
  resource?: { text?: string; uri?: string; mimeType?: string }
}

export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'

export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface AcpToolCallLocation {
  path: string
  line?: number | null
}

export interface AcpToolCallContent {
  type: 'content' | 'diff' | 'terminal'
  content?: AcpContentBlock
  /** diff */
  path?: string
  oldText?: string | null
  newText?: string
  /** terminal */
  terminalId?: string
}

export interface AcpPlanEntry {
  content: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}

export interface AcpAvailableCommand {
  name: string
  description: string
}

export interface AcpSessionMode {
  id: string
  name: string
  description?: string | null
}

export interface AcpModelInfo {
  modelId: string
  name: string
  description?: string | null
}

export interface AcpAuthMethod {
  id: string
  name: string
  description?: string | null
}

/** JSON-RPC error code the agent returns when `session/new` needs a login first. */
export const ACP_AUTH_REQUIRED_CODE = -32000

export interface AcpTerminalState {
  terminalId: string
  command: string
  output: string
  truncated: boolean
  exitCode: number | null
  signal: string | null
  running: boolean
}

// --- Session updates ----------------------------------------------------------

export type AcpSessionUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | {
      sessionUpdate: 'tool_call'
      toolCallId: string
      title: string
      kind?: AcpToolKind
      status?: AcpToolStatus
      content?: AcpToolCallContent[]
      locations?: AcpToolCallLocation[]
      rawInput?: Record<string, unknown>
      rawOutput?: Record<string, unknown>
    }
  | {
      sessionUpdate: 'tool_call_update'
      toolCallId: string
      title?: string | null
      kind?: AcpToolKind | null
      status?: AcpToolStatus | null
      content?: AcpToolCallContent[] | null
      locations?: AcpToolCallLocation[] | null
      rawInput?: Record<string, unknown>
      rawOutput?: Record<string, unknown>
    }
  | { sessionUpdate: 'plan'; entries: AcpPlanEntry[] }
  | { sessionUpdate: 'available_commands_update'; availableCommands: AcpAvailableCommand[] }
  | { sessionUpdate: 'current_mode_update'; currentModeId: string }

// --- Permissions --------------------------------------------------------------

export type AcpPermissionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always'

export interface AcpPermissionOption {
  optionId: string
  name: string
  kind: AcpPermissionKind
}

export interface AcpPermissionRequest {
  requestId: string
  sessionId: string
  options: AcpPermissionOption[]
  toolCall: {
    toolCallId: string
    title?: string | null
    kind?: AcpToolKind | null
    status?: AcpToolStatus | null
    content?: AcpToolCallContent[] | null
    locations?: AcpToolCallLocation[] | null
    rawInput?: Record<string, unknown>
  }
}

// --- Renderer-facing state ------------------------------------------------------

export type AcpConnectionStatus =
  | 'idle'
  | 'starting'
  | 'authenticating'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'stopped'

export type AcpStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled'

export interface AcpSessionState {
  /** Crest-side id, stable across agent restarts. */
  id: string
  agentId: AcpAgentId
  agentLabel: string
  cwd: string
  status: AcpConnectionStatus
  /** ACP session id handed back by the agent. */
  acpSessionId: string | null
  error: string | null
  modes: AcpSessionMode[]
  currentModeId: string | null
  models: AcpModelInfo[]
  currentModelId: string | null
  availableCommands: AcpAvailableCommand[]
  /** Login methods the agent offers; only meaningful while status is 'authenticating'. */
  authMethods: AcpAuthMethod[]
  /** Answer permission requests automatically with the agent's allow-always option. */
  autoApprove: boolean
  /** Agent capabilities advertised at initialize. */
  capabilities: {
    loadSession: boolean
    promptImage: boolean
    promptAudio: boolean
    promptEmbeddedContext: boolean
  }
}

export interface AcpStartOptions {
  sessionId: string
  agentId: AcpAgentId
  cwd: string
  /** Resume this ACP session id via `session/load` instead of starting fresh. */
  resumeAcpSessionId?: string
  /** Only for agentId === 'custom'. */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Forwarded to the agent as ACP MCP servers. */
  mcpServers?: { name: string; command: string; args: string[]; env?: { name: string; value: string }[] }[]
}

export interface AcpPromptResult {
  stopReason: AcpStopReason
}

/** Everything the main process pushes at the renderer on one channel. */
export type AcpEvent =
  | { type: 'state'; sessionId: string; state: AcpSessionState }
  | { type: 'update'; sessionId: string; update: AcpSessionUpdate }
  | { type: 'permission'; sessionId: string; request: AcpPermissionRequest }
  | {
      type: 'permission-resolved'
      sessionId: string
      requestId: string
      /** null when the request was cancelled rather than answered. */
      optionId: string | null
      optionName: string | null
      /** Whichever option kind was chosen, so the UI can say allowed vs rejected. */
      optionKind: AcpPermissionKind | null
      toolTitle: string
      /** True when auto-approve answered instead of the user. */
      auto: boolean
    }
  | { type: 'turn-end'; sessionId: string; stopReason: AcpStopReason }
  | { type: 'log'; sessionId: string; level: 'info' | 'error'; message: string }
  | { type: 'terminal'; sessionId: string; terminal: AcpTerminalState }
