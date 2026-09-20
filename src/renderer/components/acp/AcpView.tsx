import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Brain,
  CircleStop,
  Image as ImageIcon,
  LogIn,
  Paperclip,
  Play,
  Plug,
  ShieldQuestion,
  Square,
  TriangleAlert,
  X
} from 'lucide-react'
import { ACP_AGENTS, type AcpAgentId, type AcpContentBlock } from '@shared/acp'
import { useAcp } from '../../hooks/useAcp'
import AcpToolCall from './AcpToolCall'
import { AgentRail } from '../rail/AgentRail'
import { useAcpRail } from '../rail/useAcpRail'

interface AcpViewProps {
  cwd: string
  sessionId?: string
}

/** ACP forwards `mcpServers` per session; Crest doesn't send any yet. */
const ACP_CONNECTOR_NOTE =
  'This agent loads MCP servers from its own config. Crest does not forward the list over ACP yet, so toggles here take effect the next time the agent starts.'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not connected',
  starting: 'Starting agent',
  authenticating: 'Authenticating',
  ready: 'Ready',
  thinking: 'Working',
  error: 'Error',
  stopped: 'Stopped'
}

export default function AcpView({ cwd, sessionId = 'acp-main' }: AcpViewProps) {
  const {
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
  } = useAcp(sessionId)

  const rail = useAcpRail(sessionId)
  const [agentId, setAgentId] = useState<AcpAgentId>('claude')
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<{ name: string; block: AcpContentBlock }[]>([])
  const [starting, setStarting] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const agents = useMemo(() => Object.values(ACP_AGENTS), [])

  // Follow the stream, but don't yank the view back down if the user has
  // scrolled up to read something while the agent is still working.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) el.scrollTop = el.scrollHeight
  }, [items, plan, permission])

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      await start(agentId, cwd)
      inputRef.current?.focus()
    } finally {
      setStarting(false)
    }
  }, [agentId, cwd, start])

  const handleSend = useCallback(() => {
    if ((!draft.trim() && attachments.length === 0) || busy) return
    const text = draft
    const blocks = attachments.map((a) => a.block)
    setDraft('')
    setAttachments([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    void send(text, blocks)
  }, [draft, attachments, busy, send])

  /** Images go over the wire as base64 content blocks, per the ACP image block. */
  const addImageFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'))
      if (images.length === 0) return

      const blocks = await Promise.all(
        images.map(
          (file) =>
            new Promise<{ name: string; block: AcpContentBlock }>((resolve, reject) => {
              const reader = new FileReader()
              reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
              reader.onload = () => {
                const result = String(reader.result ?? '')
                resolve({
                  name: file.name || 'pasted image',
                  block: {
                    type: 'image',
                    // strip the `data:<mime>;base64,` prefix — ACP wants raw base64
                    data: result.slice(result.indexOf(',') + 1),
                    mimeType: file.type
                  }
                })
              }
              reader.readAsDataURL(file)
            })
        )
      )
      setAttachments((current) => [...current, ...blocks])
    },
    []
  )

  const status = state?.status ?? 'idle'
  const errorLogs = logs.filter((l) => l.level === 'error')

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#0d0d0d' }}>
      {/* Connection bar */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-surface-border bg-surface shrink-0">
        <Plug size={14} className="text-neutral-500" />
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">ACP</span>

        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value as AcpAgentId)}
          disabled={connected}
          className="bg-surface-elevated border border-surface-border rounded px-2 py-1 text-[12px] text-neutral-300 disabled:opacity-50"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
              {agent.experimental ? ' (experimental)' : ''}
            </option>
          ))}
        </select>

        {state && state.modes.length > 0 && (
          <select
            value={state.currentModeId ?? ''}
            onChange={(e) => void setMode(e.target.value)}
            className="bg-surface-elevated border border-surface-border rounded px-2 py-1 text-[12px] text-neutral-300"
          >
            {state.modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
          </select>
        )}

        {state && state.models.length > 0 && (
          <select
            value={state.currentModelId ?? ''}
            onChange={(e) => void setModel(e.target.value)}
            className="bg-surface-elevated border border-surface-border rounded px-2 py-1 text-[12px] text-neutral-300 max-w-[200px]"
          >
            {state.models.map((model) => (
              <option key={model.modelId} value={model.modelId}>
                {model.name}
              </option>
            ))}
          </select>
        )}

        {connected && (
          <label
            className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none"
            title="Answer permission requests automatically using the agent's allow option"
          >
            <input
              type="checkbox"
              checked={state?.autoApprove ?? false}
              onChange={(e) => void setAutoApprove(e.target.checked)}
              className="accent-accent"
            />
            Auto-approve
          </label>
        )}

        <div className="flex-1" />

        <span
          className={`text-[11px] ${
            status === 'error' ? 'text-red-400' : status === 'thinking' ? 'text-accent' : 'text-neutral-500'
          }`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>

        {logs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            className={`text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-hover ${
              errorLogs.length > 0 ? 'text-red-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {logs.length} log{logs.length === 1 ? '' : 's'}
          </button>
        )}

        {connected ? (
          <button
            type="button"
            onClick={() => void stop()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] text-neutral-300 border border-surface-border hover:bg-surface-hover"
          >
            <Square size={11} />
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={starting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            <Play size={11} />
            {starting ? 'Connecting' : 'Connect'}
          </button>
        )}
      </div>

      {showLogs && logs.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-b border-surface-border bg-surface-elevated px-4 py-2 font-mono text-[11px] shrink-0">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${log.level === 'error' ? 'text-red-400' : 'text-neutral-600'}`}
            >
              {log.message.length > 400 ? `${log.message.slice(0, 400)}…` : log.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Timeline */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-[860px] mx-auto px-6 py-6 space-y-4">
            {state?.error && (
              <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2 text-[13px] text-red-300">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{state.error}</span>
              </div>
            )}

            {needsAuth && (
              <div className="rounded-md border border-surface-border bg-surface-elevated px-3 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <LogIn size={14} className="text-accent" />
                  <span className="text-[13px] text-neutral-200">This agent needs you to sign in</span>
                </div>
                {state?.authMethods.length ? (
                  <div className="flex flex-wrap gap-2">
                    {state.authMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => void authenticate(method.id)}
                        title={method.description ?? undefined}
                        className="px-2.5 py-1 rounded text-[12px] border border-accent/60 text-accent hover:bg-accent/10"
                      >
                        {method.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-neutral-500">
                    The agent reported no authentication methods. Sign in with its CLI, then reconnect.
                  </p>
                )}
              </div>
            )}

            {!state && (
              <div className="text-[13px] text-neutral-500 leading-relaxed">
                <p className="text-neutral-300 mb-2">Agent Client Protocol</p>
                <p>
                  Connect to a coding agent over ACP and get structured tool calls, diffs, plans and
                  permission prompts instead of scraped terminal output. Pick an agent and press Connect.
                </p>
              </div>
            )}

            {items.map((item) => {
              if (item.kind === 'tool') {
                return (
                  <AcpToolCall
                    key={item.id}
                    title={item.title}
                    toolKind={item.toolKind}
                    status={item.status}
                    content={item.content}
                    locations={item.locations}
                    terminals={terminals}
                  />
                )
              }

              if (item.kind === 'user') {
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-surface-elevated border border-surface-border px-3 py-2 text-[13px] text-neutral-200 whitespace-pre-wrap">
                      {item.text}
                    </div>
                  </div>
                )
              }

              if (item.kind === 'thought') {
                return (
                  <div key={item.id} className="flex items-start gap-2 text-[12px] text-neutral-500 italic">
                    <Brain size={13} className="mt-0.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{item.text}</span>
                  </div>
                )
              }

              if (item.kind === 'error') {
                return (
                  <div key={item.id} className="text-[12px] text-red-400 whitespace-pre-wrap">
                    {item.text}
                  </div>
                )
              }

              return (
                <div key={item.id} className="text-[13px] leading-[1.65] text-neutral-200 whitespace-pre-wrap">
                  {item.text}
                </div>
              )
            })}

            {permission && (
              <div className="rounded-md border border-accent/40 bg-accent-muted px-3 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldQuestion size={14} className="text-accent" />
                  <span className="text-[13px] text-neutral-200">
                    {permission.toolCall.title ?? 'Permission required'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {permission.options.map((option) => (
                    <button
                      key={option.optionId}
                      type="button"
                      onClick={() => void respondPermission(permission.requestId, option.optionId)}
                      className={`px-2.5 py-1 rounded text-[12px] border ${
                        option.kind.startsWith('allow')
                          ? 'border-accent/60 text-accent hover:bg-accent/10'
                          : 'border-surface-border text-neutral-400 hover:bg-surface-hover'
                      }`}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-72 shrink-0 h-full">
          <AgentRail data={rail} connectorNote={ACP_CONNECTOR_NOTE} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-surface-border bg-surface shrink-0">
        {attachments.length > 0 && (
          <div className="max-w-[860px] mx-auto px-4 pt-3 flex flex-wrap gap-1.5">
            {attachments.map((attachment, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-surface-border text-[11px] text-neutral-400"
              >
                <ImageIcon size={11} />
                <span className="max-w-[160px] truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((_, index) => index !== i))}
                  className="text-neutral-600 hover:text-neutral-300"
                  title="Remove"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="max-w-[860px] mx-auto px-4 py-3 flex items-end gap-2">
          {state?.capabilities.promptImage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addImageFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!connected}
                className="h-9 w-9 flex items-center justify-center rounded-md border border-surface-border text-neutral-400 hover:bg-surface-hover disabled:opacity-40"
                title="Attach image"
              >
                <Paperclip size={15} />
              </button>
            </>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              // Grow with the content up to the max-height, then scroll.
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            onPaste={(e) => {
              if (!state?.capabilities.promptImage) return
              const files = Array.from(e.clipboardData.files)
              if (files.some((file) => file.type.startsWith('image/'))) {
                e.preventDefault()
                void addImageFiles(files)
              }
            }}
            disabled={!connected}
            rows={1}
            placeholder={connected ? 'Message the agent' : 'Connect an agent to start'}
            className="flex-1 resize-none bg-surface-elevated border border-surface-border rounded-md px-3 py-2 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-accent/50 disabled:opacity-50 max-h-40"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void cancel()}
              className="h-9 w-9 flex items-center justify-center rounded-md border border-surface-border text-neutral-300 hover:bg-surface-hover"
              title="Cancel turn"
            >
              <CircleStop size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!connected || (!draft.trim() && attachments.length === 0)}
              className="h-9 w-9 flex items-center justify-center rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40"
              title="Send"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
