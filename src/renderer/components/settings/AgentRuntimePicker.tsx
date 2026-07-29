/**
 * Two-axis agent picker: which CLI harness, and where its model runs.
 *
 * The axes are deliberately separate controls. "Ollama" is not an agent -- it has
 * no tool-calling harness of its own -- so it belongs on the runtime axis, not
 * beside Claude Code and Codex. Three agents x two runtimes would be six buttons
 * as a flat list; as pills + a toggle it stays five controls and still reads
 * correctly when a fourth agent is added.
 */

import { useCallback, useEffect, useState } from 'react'
import { Cloud, HardDrive, RefreshCw } from 'lucide-react'
import { CLI_PROVIDERS, supportsLocalRuntime } from '../../../shared/providers'
import type { CLIProvider, CLIProviderConfig, ModelRuntime, OllamaRuntimeStatus } from '../../../shared/types'

const ACCENT = '#cc785c'

interface AgentRuntimePickerProps {
  provider: CLIProvider
  runtime: ModelRuntime
  localModel: string
  onProviderChange: (provider: CLIProvider) => void
  onRuntimeChange: (runtime: ModelRuntime) => void
  onLocalModelChange: (model: string) => void
  /** Install state per provider, so unavailable agents read as unavailable. */
  installed?: Partial<Record<CLIProvider, boolean | null>>
  compact?: boolean
}

export function AgentRuntimePicker({
  provider,
  runtime,
  localModel,
  onProviderChange,
  onRuntimeChange,
  onLocalModelChange,
  installed,
  compact = false
}: AgentRuntimePickerProps): React.JSX.Element {
  const [status, setStatus] = useState<OllamaRuntimeStatus | null>(null)
  const [probing, setProbing] = useState(false)

  const providers = Object.values(CLI_PROVIDERS) as CLIProviderConfig[]
  const activeConfig = CLI_PROVIDERS[provider]
  const canGoLocal = supportsLocalRuntime(provider)

  const probe = useCallback(async () => {
    setProbing(true)
    try {
      setStatus(await window.api.ollamaStatus())
    } catch {
      setStatus({ running: false, host: 'unknown', models: [], error: 'probe failed' })
    } finally {
      setProbing(false)
    }
  }, [])

  // Only probe when local is actually in play -- no background polling of a
  // daemon the user is not using.
  useEffect(() => {
    if (runtime === 'local' && canGoLocal) void probe()
  }, [runtime, canGoLocal, probe])

  // Embedding models cannot drive an agent, so they must never be selectable.
  const chatModels = (status?.models ?? []).filter((m) => !m.embeddingOnly)

  // A persisted model that ollama no longer has would silently launch the wrong
  // thing; surface it instead.
  const modelMissing =
    status?.running === true && chatModels.length > 0 && !chatModels.some((m) => m.name === localModel)

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Axis 1 -- agent */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Agent</div>
        <div className="flex gap-1.5">
          {providers.map((p) => {
            const isActive = p.id === provider
            const isMissing = installed?.[p.id] === false
            return (
              <button
                key={p.id}
                onClick={() => onProviderChange(p.id)}
                title={isMissing ? `${p.name} CLI is not installed` : `${p.binaryName} CLI`}
                className="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-[0.97] border"
                style={{
                  background: isActive ? `${ACCENT}1a` : 'rgba(0,0,0,0.35)',
                  borderColor: isActive ? `${ACCENT}66` : 'rgba(255,255,255,0.08)',
                  color: isActive ? ACCENT : isMissing ? '#6b7280' : '#9ca3af'
                }}
              >
                <span className="truncate">{p.name}</span>
                {isMissing && <span className="ml-1 text-[9px] opacity-70">not installed</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Axis 2 -- runtime */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Runtime</div>
        <div
          className="grid grid-cols-2 gap-1 rounded-lg p-1"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <RuntimeOption
            icon={<Cloud className="w-3 h-3" />}
            label="API"
            sub="Cloud"
            active={runtime === 'api'}
            onClick={() => onRuntimeChange('api')}
          />
          <RuntimeOption
            icon={<HardDrive className="w-3 h-3" />}
            label="Local"
            sub="ollama"
            active={runtime === 'local'}
            disabled={!canGoLocal}
            title={canGoLocal ? 'Run this agent against a local ollama model' : activeConfig.localUnavailableReason}
            onClick={() => onRuntimeChange('local')}
          />
        </div>
        {!canGoLocal && (
          <div className="mt-1 text-[10px] text-gray-600 leading-snug">
            {activeConfig.localUnavailableReason}
          </div>
        )}
      </div>

      {/* Local detail -- status + model, only when relevant */}
      {runtime === 'local' && canGoLocal && (
        <div
          className="rounded-lg p-2.5 space-y-2"
          style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: status === null ? '#6b7280' : status.running ? '#34d399' : '#fbbf24',
                boxShadow: status?.running ? '0 0 6px rgba(52,211,153,0.6)' : 'none'
              }}
            />
            <span className="text-[11px] text-gray-400 flex-1 truncate">
              {status === null
                ? 'Checking ollama...'
                : status.running
                  ? `ollama at ${status.host.replace(/^https?:\/\//, '')}`
                  : `ollama not reachable${status.error ? ` (${status.error})` : ''}`}
            </span>
            <button
              onClick={() => void probe()}
              disabled={probing}
              title="Re-check ollama"
              className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${probing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {status?.running === false && (
            <div className="text-[10px] text-gray-500 leading-snug">
              Start it with <code className="text-[#cc785c]">brew services start ollama</code>
            </div>
          )}

          {status?.running && (
            <>
              <select
                value={localModel}
                onChange={(e) => onLocalModelChange(e.target.value)}
                className="w-full rounded-md px-2 py-1.5 text-[11px] text-gray-200 outline-none"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {modelMissing && <option value={localModel}>{localModel} (not pulled)</option>}
                {chatModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.parameters ? ` -- ${m.parameters}` : ''}
                  </option>
                ))}
              </select>
              {chatModels.length === 0 && (
                <div className="text-[10px] text-amber-500/80 leading-snug">
                  No chat-capable models. Pull one: <code>ollama pull qwen3-coder:30b</code>
                </div>
              )}
              {modelMissing && (
                <div className="text-[10px] text-amber-500/80 leading-snug">
                  {localModel} is not in ollama -- pick another or pull it.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RuntimeOption({
  icon,
  label,
  sub,
  active,
  disabled,
  title,
  onClick
}: {
  icon: React.ReactNode
  label: string
  sub: string
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed"
      style={{
        background: active ? `${ACCENT}1f` : 'transparent',
        border: active ? `1px solid ${ACCENT}59` : '1px solid transparent',
        color: disabled ? '#4b5563' : active ? ACCENT : '#9ca3af',
        opacity: disabled ? 0.5 : 1
      }}
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[9px] opacity-60">{sub}</span>
    </button>
  )
}
