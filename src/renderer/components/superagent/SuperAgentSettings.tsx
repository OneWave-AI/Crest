import React, { useState, useEffect } from 'react'
import { Zap, Eye, EyeOff, Save, CheckCircle } from 'lucide-react'
import type { SuperAgentConfig, LLMProvider, SafetyLevel } from '../../../shared/types'
import { SUPERVISOR_PROVIDERS, supervisorProviderLabel } from '../../../shared/llmProviders'

const DEFAULT_CONFIG: SuperAgentConfig = {
  ollamaModel: 'qwen3-coder:30b',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  defaultProvider: 'groq',
  idleTimeout: 5,
  maxDuration: 30,
  defaultSafetyLevel: 'safe'
}

export function SuperAgentSettings() {
  // Start with default config immediately to prevent loading state
  const [config, setConfig] = useState<SuperAgentConfig>(DEFAULT_CONFIG)
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load saved config on mount (overwrites default if found)
  useEffect(() => {
    window.api.loadSuperAgentConfig()
      .then((savedConfig) => {
        if (savedConfig) setConfig(savedConfig)
      })
      .catch(console.error)
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    await window.api.saveSuperAgentConfig(config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateConfig = (updates: Partial<SuperAgentConfig>) => {
    setConfig({ ...config, ...updates })
    setSaved(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Super Agent</h3>
          <p className="text-xs text-gray-400">Configure autonomous AI settings</p>
        </div>
      </div>

      {/* Local Supervisor Model */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Ollama Supervisor Model
        </label>
        <input
          value={config.ollamaModel}
          onChange={(e) => updateConfig({ ollamaModel: e.target.value })}
          placeholder="qwen3-coder:30b"
          className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Runs the terminal-watching Super Agent locally with no API key.
        </p>
      </div>

      <div className="border-t border-gray-700" />

      {/* Groq API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Groq API Key
        </label>
        <div className="relative">
          <input
            type={showGroqKey ? 'text' : 'password'}
            value={config.groqApiKey}
            onChange={(e) => updateConfig({ groqApiKey: e.target.value })}
            placeholder="gsk_..."
            className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => setShowGroqKey(!showGroqKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
          >
            {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Get your key at{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.api.openUrlExternal('https://console.groq.com/keys')
            }}
            className="text-purple-400 hover:underline"
          >
            console.groq.com
          </a>
        </p>
      </div>

      {/* Groq Model */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Groq Model
        </label>
        <select
          value={config.groqModel}
          onChange={(e) => updateConfig({ groqModel: e.target.value })}
          className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
        >
          <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Recommended)</option>
          <option value="llama-3.1-70b-versatile">Llama 3.1 70B</option>
          <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
          <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
        </select>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700" />

      {/* OpenAI API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          OpenAI API Key (Optional)
        </label>
        <div className="relative">
          <input
            type={showOpenAIKey ? 'text' : 'password'}
            value={config.openaiApiKey}
            onChange={(e) => updateConfig({ openaiApiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => setShowOpenAIKey(!showOpenAIKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
          >
            {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Alternative to Groq for GPT-4o models
        </p>
      </div>

      {/* OpenAI Model */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          OpenAI Model
        </label>
        <select
          value={config.openaiModel}
          onChange={(e) => updateConfig({ openaiModel: e.target.value })}
          className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
        >
          <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
        </select>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700" />

      {/* Default Provider */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Default Provider
        </label>
        <div className="flex gap-2">
          {SUPERVISOR_PROVIDERS.map((p: LLMProvider) => (
            <button
              key={p}
              onClick={() => updateConfig({ defaultProvider: p })}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                config.defaultProvider === p
                  ? 'bg-purple-500 text-white'
                  : 'bg-black/30 text-gray-400 hover:bg-black/50'
              }`}
            >
              {p === 'ollama' ? 'Local' : supervisorProviderLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {/* Idle Timeout */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Idle Detection Timeout
        </label>
        <select
          value={config.idleTimeout}
          onChange={(e) => updateConfig({ idleTimeout: parseInt(e.target.value) })}
          className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
        >
          <option value={3}>3 seconds</option>
          <option value={5}>5 seconds (Recommended)</option>
          <option value={8}>8 seconds</option>
          <option value={10}>10 seconds</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          How long to wait before considering Claude idle
        </p>
      </div>

      {/* Default Safety Level */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Default Safety Level
        </label>
        <select
          value={config.defaultSafetyLevel}
          onChange={(e) => updateConfig({ defaultSafetyLevel: e.target.value as SafetyLevel })}
          className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
        >
          <option value="safe">Safe - Block dangerous commands</option>
          <option value="moderate">Moderate - Allow with caution</option>
          <option value="yolo">YOLO - No restrictions</option>
        </select>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saved ? (
          <>
            <CheckCircle className="w-4 h-4" />
            Saved!
          </>
        ) : saving ? (
          'Saving...'
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Settings
          </>
        )}
      </button>
    </div>
  )
}
