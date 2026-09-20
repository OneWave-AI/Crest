import React, { useState, useEffect } from 'react'
import {
  X,
  Zap,
  Shield,
  ShieldAlert,
  ShieldOff,
  Loader2,
  Rocket,
  RefreshCw,
  Clock,
  Bot,
  ArrowRight,
  ChevronDown
} from 'lucide-react'
import { useSuperAgent } from '../../hooks/useSuperAgent'
import { useAppStore } from '../../store'
import { useOrchestratorStore } from '../../store/orchestratorStore'
import type { SafetyLevel, LLMProvider } from '../../../shared/types'
import {
  SUPERVISOR_PROVIDERS,
  getSupervisorApiKey,
  supervisorProviderLabel,
  supervisorProviderNeedsApiKey
} from '../../../shared/llmProviders'
import { CLI_PROVIDERS } from '../../../shared/providers'

type LaunchMode = 'new' | 'takeover'

interface SuperAgentModalProps {
  isOpen: boolean
  onClose: () => void
  terminalId: string
  onStart: () => void
}

const SAFETY_OPTIONS = [
  { level: 'safe' as SafetyLevel, icon: Shield, color: 'emerald', label: 'Safe' },
  { level: 'moderate' as SafetyLevel, icon: ShieldAlert, color: 'amber', label: 'Balanced' },
  { level: 'yolo' as SafetyLevel, icon: ShieldOff, color: 'red', label: 'YOLO' }
]

export function SuperAgentModal({ isOpen, onClose, terminalId, onStart }: SuperAgentModalProps) {
  const { startSuperAgent, config, provider, setProvider, timeLimit, setTimeLimit, safetyLevel, setSafetyLevel, loadConfig } =
    useSuperAgent()
  const { cwd, cliProvider, modelRuntime, localModel } = useAppStore()
  const orchestratorRunning = useOrchestratorStore((s) => s.isRunning)

  const [task, setTask] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [launchMode, setLaunchMode] = useState<LaunchMode>('new')

  useEffect(() => {
    if (isOpen) {
      setTask('')
      setError(null)
      setIsStarting(false)
      setShowSettings(false)
      setLaunchMode('new')
      setIsLoadingConfig(true)
      loadConfig().finally(() => setIsLoadingConfig(false))
    }
  }, [isOpen, loadConfig])

  const handleStart = async (mode: LaunchMode = launchMode) => {
    if (orchestratorRunning) {
      setError('Stop the Orchestrator first')
      return
    }

    if (mode === 'new' && !task.trim()) {
      setError('Tell the terminal agent what to build')
      return
    }

    if (!config) {
      setError('Loading... try again')
      return
    }

    const apiKey = getSupervisorApiKey(config, provider)
    if (supervisorProviderNeedsApiKey(provider) && !apiKey) {
      setError(`Add a ${supervisorProviderLabel(provider)} API key in Settings`)
      return
    }

    if (provider === 'ollama') {
      const status = await window.api.ollamaStatus()
      if (!status.running) {
        setError(`Start Ollama first (${status.host})`)
        return
      }
      if (!status.models.some((model) => !model.embeddingOnly && model.name === config.ollamaModel)) {
        setError(`Pull or select the local model ${config.ollamaModel}`)
        return
      }
    }

    if (!terminalId) {
      setError('Start a terminal session first')
      return
    }

    setIsStarting(true)
    setError(null)

    const taskToSend = mode === 'takeover' && !task.trim()
      ? 'Continue working on the current task. Analyze what the terminal agent is doing and help it make progress.'
      : task

    const success = await startSuperAgent(taskToSend, terminalId, {
      timeLimit,
      safetyLevel,
      projectFolder: cwd,
      takeover: mode === 'takeover'
    })

    if (success) {
      onStart()
      onClose()
    } else {
      setError('Failed to start. Check the selected supervisor in Settings.')
      setIsStarting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[#141416] rounded-2xl w-full max-w-md overflow-hidden border border-white/[0.08] shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#cc785c] to-[#a55d45] rounded-xl">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Super Agent</h2>
              <p className="text-xs text-gray-500">Autonomous execution</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Orchestrator guard */}
          {orchestratorRunning && (
            <div className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-xs">
              Orchestrator is running. Stop it before starting Super Agent.
            </div>
          )}

          {/* The two axes stay independent, so all local/API combinations work. */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
              <div className="text-gray-600 uppercase tracking-wider text-[9px]">Supervisor</div>
              <div className="text-gray-300 mt-1">
                {provider === 'ollama' ? `Local · ${config.ollamaModel}` : `API · ${supervisorProviderLabel(provider)}`}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
              <div className="text-gray-600 uppercase tracking-wider text-[9px]">Terminal agent</div>
              <div className="text-gray-300 mt-1">
                {modelRuntime === 'local'
                  ? `Local · ${CLI_PROVIDERS[cliProvider].name} · ${localModel}`
                  : `API · ${CLI_PROVIDERS[cliProvider].name}`}
              </div>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-[#0a0a0b] rounded-lg">
            <button
              onClick={() => setLaunchMode('new')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                launchMode === 'new'
                  ? 'bg-[#cc785c] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Rocket className="w-4 h-4" />
              New Task
            </button>
            <button
              onClick={() => setLaunchMode('takeover')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                launchMode === 'takeover'
                  ? 'bg-sand-500 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Take Over
            </button>
          </div>

          {/* Task Input */}
          <div>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value.slice(0, 500))}
              placeholder={launchMode === 'takeover'
                ? "Optional: Provide guidance..."
                : "What should the terminal agent build?"}
              className="w-full h-24 bg-[#0a0a0b] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#cc785c]/50 resize-none text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleStart()
              }}
            />
          </div>

          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] rounded-lg text-xs text-gray-500 transition-colors"
          >
            <span>Settings</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>

          {/* Settings Panel */}
          {showSettings && (
            <div className="space-y-4 p-3 bg-white/[0.02] rounded-lg animate-in slide-in-from-top-1 duration-150">
              {/* Provider */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16">Provider</span>
                <div className="flex-1 flex gap-2">
                  {SUPERVISOR_PROVIDERS.map((p: LLMProvider) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        provider === p
                          ? 'bg-white/[0.1] text-white'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {p === 'ollama' ? 'Local' : supervisorProviderLabel(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Limit */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </span>
                <div className="flex-1 flex gap-1">
                  {[5, 15, 30, 0].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setTimeLimit(mins)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        timeLimit === mins
                          ? 'bg-[#cc785c]/20 text-[#cc785c]'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {mins === 0 ? '∞' : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Safety */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Safety
                </span>
                <div className="flex-1 flex gap-1">
                  {SAFETY_OPTIONS.map(({ level, icon: Icon, color, label }) => (
                    <button
                      key={level}
                      onClick={() => setSafetyLevel(level)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        safetyLevel === level
                          ? color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400'
                          : color === 'amber' ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-red-500/20 text-red-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Launch Button */}
          <button
            onClick={() => handleStart()}
            disabled={isStarting || isLoadingConfig || orchestratorRunning || (launchMode === 'new' && !task.trim())}
            className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              isStarting || isLoadingConfig || orchestratorRunning || (launchMode === 'new' && !task.trim())
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : launchMode === 'takeover'
                  ? 'bg-sand-500 hover:bg-sand-400 text-white'
                  : 'bg-[#cc785c] hover:bg-[#d88a6a] text-white'
            }`}
          >
            {isLoadingConfig ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
            ) : isStarting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {launchMode === 'takeover' ? 'Taking Over...' : 'Launching...'}</>
            ) : (
              <>
                {launchMode === 'takeover' ? <RefreshCw className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                {launchMode === 'takeover' ? 'Take Over' : 'Launch'}
                <ArrowRight className="w-4 h-4 opacity-50" />
              </>
            )}
          </button>

          {/* Hint */}
          <p className="text-center text-[10px] text-gray-600">
            <kbd className="px-1 py-0.5 bg-white/[0.04] rounded">⌘</kbd> + <kbd className="px-1 py-0.5 bg-white/[0.04] rounded">Enter</kbd> to launch
          </p>
        </div>
      </div>
    </div>
  )
}
