import { useState, useEffect, useCallback } from 'react'
import {
  Plug,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  Github,
  Globe,
  FileText,
  MessageSquare,
  FolderOpen,
  Terminal
} from 'lucide-react'
import { useToast } from '../common'
import type { MCPServer } from '../../../shared/types'

// Popular MCP server presets
const MCP_PRESETS = {
  github: {
    name: 'GitHub',
    description: 'GitHub repository access and management',
    icon: Github,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    requiresEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN']
  },
  filesystem: {
    name: 'Filesystem',
    description: 'Local filesystem access',
    icon: FolderOpen,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
    env: {},
    requiresEnv: []
  },
  puppeteer: {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    icon: Globe,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    env: {},
    requiresEnv: []
  },
  fetch: {
    name: 'Fetch',
    description: 'HTTP requests and API calls',
    icon: Globe,
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-fetch'],
    env: {},
    requiresEnv: []
  },
  slack: {
    name: 'Slack',
    description: 'Slack workspace integration',
    icon: MessageSquare,
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-slack'],
    env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    requiresEnv: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID']
  },
  memory: {
    name: 'Memory',
    description: 'Persistent memory and knowledge storage',
    icon: FileText,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    requiresEnv: []
  }
}

type PresetKey = keyof typeof MCP_PRESETS

interface MCPManagerProps {
  onBack?: () => void
}

export default function MCPManager({ onBack }: MCPManagerProps) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [configExists, setConfigExists] = useState(false)
  const [configPath, setConfigPath] = useState('')
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  // Add/Edit server modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<PresetKey | null>(null)

  // Form state for add/edit
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formArgs, setFormArgs] = useState('')
  const [formEnv, setFormEnv] = useState<{ key: string; value: string }[]>([])

  const { showToast } = useToast()

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      // Check if config exists
      const configStatus = await window.api.mcpCheckConfig()
      setConfigExists(configStatus.exists)
      setConfigPath(configStatus.path)

      // Load servers
      const serverList = await window.api.mcpList()
      setServers(serverList)
    } catch (err) {
      console.error('Failed to load MCP servers:', err)
      showToast('error', 'Failed to load servers', 'Could not read MCP configuration')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleInitConfig = async () => {
    try {
      const result = await window.api.mcpInitConfig()
      if (result.success) {
        showToast('success', 'Config created', 'MCP configuration file has been created')
        setConfigExists(true)
      }
    } catch (err) {
      showToast('error', 'Failed to create config', 'Could not create MCP configuration file')
    }
  }

  const handleToggleServer = async (name: string, enabled: boolean) => {
    try {
      const result = await window.api.mcpToggle(name, enabled)
      if (result.success) {
        setServers(prev =>
          prev.map(s => (s.name === name ? { ...s, enabled } : s))
        )
        showToast('success', enabled ? 'Server enabled' : 'Server disabled', `"${name}" has been ${enabled ? 'enabled' : 'disabled'}`)
      } else {
        showToast('error', 'Failed to toggle server', result.error || 'Unknown error')
      }
    } catch (err) {
      showToast('error', 'Failed to toggle server', 'Could not update server status')
    }
  }

  const handleRemoveServer = async (name: string) => {
    if (!confirm(`Remove MCP server "${name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const result = await window.api.mcpRemove(name)
      if (result.success) {
        setServers(prev => prev.filter(s => s.name !== name))
        showToast('success', 'Server removed', `"${name}" has been removed`)
        if (expandedServer === name) {
          setExpandedServer(null)
        }
      } else {
        showToast('error', 'Failed to remove server', result.error || 'Unknown error')
      }
    } catch (err) {
      showToast('error', 'Failed to remove server', 'Could not remove the server')
    }
  }

  const openAddModal = (preset?: PresetKey) => {
    setEditingServer(null)
    setSelectedPreset(preset || null)

    if (preset) {
      const presetConfig = MCP_PRESETS[preset]
      setFormName(preset)
      setFormCommand(presetConfig.command)
      setFormArgs(presetConfig.args.join(' '))
      setFormEnv(
        Object.entries(presetConfig.env).map(([key, value]) => ({ key, value: value as string }))
      )
    } else {
      setFormName('')
      setFormCommand('')
      setFormArgs('')
      setFormEnv([])
    }

    setShowAddModal(true)
  }

  const openEditModal = (server: MCPServer) => {
    setEditingServer(server)
    setSelectedPreset(null)
    setFormName(server.name)
    setFormCommand(server.command)
    setFormArgs(server.args.join(' '))
    setFormEnv(
      Object.entries(server.env).map(([key, value]) => ({ key, value }))
    )
    setShowAddModal(true)
  }

  const handleAddEnvVar = () => {
    setFormEnv(prev => [...prev, { key: '', value: '' }])
  }

  const handleRemoveEnvVar = (index: number) => {
    setFormEnv(prev => prev.filter((_, i) => i !== index))
  }

  const handleEnvChange = (index: number, field: 'key' | 'value', value: string) => {
    setFormEnv(prev =>
      prev.map((env, i) => (i === index ? { ...env, [field]: value } : env))
    )
  }

  const handleSaveServer = async () => {
    if (!formName.trim()) {
      showToast('error', 'Name required', 'Please enter a server name')
      return
    }
    if (!formCommand.trim()) {
      showToast('error', 'Command required', 'Please enter a command')
      return
    }

    // Check for required env vars
    if (selectedPreset) {
      const preset = MCP_PRESETS[selectedPreset]
      const missingEnv = preset.requiresEnv.filter(
        key => !formEnv.find(e => e.key === key && e.value.trim())
      )
      if (missingEnv.length > 0) {
        showToast('error', 'Missing required values', `Please provide: ${missingEnv.join(', ')}`)
        return
      }
    }

    const args = formArgs.trim() ? formArgs.trim().split(/\s+/) : []
    const env: Record<string, string> = {}
    formEnv.forEach(e => {
      if (e.key.trim() && e.value.trim()) {
        env[e.key.trim()] = e.value.trim()
      }
    })

    try {
      if (editingServer) {
        const result = await window.api.mcpUpdate(formName, formCommand, args, env)
        if (result.success) {
          showToast('success', 'Server updated', `"${formName}" has been updated`)
          await loadServers()
        } else {
          showToast('error', 'Failed to update server', result.error || 'Unknown error')
        }
      } else {
        const result = await window.api.mcpAdd(formName, formCommand, args, env)
        if (result.success) {
          showToast('success', 'Server added', `"${formName}" has been added`)
          await loadServers()
        } else {
          showToast('error', 'Failed to add server', result.error || 'Unknown error')
        }
      }
      setShowAddModal(false)
    } catch (err) {
      showToast('error', 'Operation failed', 'Could not save server configuration')
    }
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingServer(null)
    setSelectedPreset(null)
    setFormName('')
    setFormCommand('')
    setFormArgs('')
    setFormEnv([])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span>Loading MCP configuration...</span>
        </div>
      </div>
    )
  }

  if (!configExists) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-2xl bg-white/5 mb-4">
          <Plug size={32} className="text-gray-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No MCP Configuration</h3>
        <p className="text-sm text-gray-500 mb-2 max-w-md">
          MCP (Model Context Protocol) servers extend Claude's capabilities with external tools and data sources.
        </p>
        <p className="text-xs text-gray-600 mb-6 font-mono">{configPath}</p>
        <button
          onClick={handleInitConfig}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-400 transition-colors"
        >
          <Plus size={18} />
          Create Configuration
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Add Presets */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Add</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.entries(MCP_PRESETS) as [PresetKey, typeof MCP_PRESETS[PresetKey]][]).map(([key, preset]) => {
            const isInstalled = servers.some(s => s.name === key)
            const Icon = preset.icon

            return (
              <button
                key={key}
                onClick={() => !isInstalled && openAddModal(key)}
                disabled={isInstalled}
                className={`group relative p-4 rounded-xl border transition-all ${
                  isInstalled
                    ? 'border-accent/30 bg-accent/5 cursor-default'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-accent/50 hover:bg-white/[0.04]'
                }`}
              >
                <div className={`p-2 rounded-lg mb-2 inline-block ${
                  isInstalled ? 'bg-accent/20' : 'bg-white/5 group-hover:bg-accent/10'
                }`}>
                  <Icon size={18} className={isInstalled ? 'text-accent' : 'text-gray-400 group-hover:text-accent'} />
                </div>
                <h4 className="font-medium text-white text-sm">{preset.name}</h4>
                <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{preset.description}</p>
                {isInstalled && (
                  <div className="absolute top-2 right-2">
                    <Check size={14} className="text-accent" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Installed Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-400">Installed Servers ({servers.length})</h3>
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <Plus size={14} />
            Add Custom
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No MCP servers configured yet.</p>
            <p className="text-sm mt-1">Add a server from the presets above or create a custom one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map(server => {
              const preset = MCP_PRESETS[server.name as PresetKey]
              const Icon = preset?.icon || Terminal
              const isExpanded = expandedServer === server.name

              return (
                <div
                  key={server.name}
                  className={`rounded-xl border transition-all ${
                    server.enabled
                      ? 'border-accent/20 bg-accent/[0.02]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${server.enabled ? 'bg-accent/10' : 'bg-white/5'}`}>
                        <Icon size={18} className={server.enabled ? 'text-accent' : 'text-gray-500'} />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{server.name}</h4>
                        <p className="text-xs text-gray-500 font-mono">{server.command} {server.args.join(' ')}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleServer(server.name, !server.enabled)}
                        className={`w-10 h-6 rounded-full transition-colors ${
                          server.enabled ? 'bg-accent' : 'bg-gray-700'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            server.enabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>

                      {/* Expand */}
                      <button
                        onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                        className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/[0.06]">
                      <div className="pt-4 space-y-3">
                        {/* Command */}
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide">Command</label>
                          <p className="text-sm text-white font-mono mt-1">{server.command}</p>
                        </div>

                        {/* Args */}
                        {server.args.length > 0 && (
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide">Arguments</label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {server.args.map((arg, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-white/5 text-xs text-gray-400 font-mono">
                                  {arg}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Env */}
                        {Object.keys(server.env).length > 0 && (
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide">Environment Variables</label>
                            <div className="mt-1 space-y-1">
                              {Object.entries(server.env).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 font-mono">{key}:</span>
                                  <span className="text-xs text-gray-500 font-mono">
                                    {value ? '********' : <span className="text-yellow-500">(not set)</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => openEditModal(server)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
                          >
                            <Edit3 size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveServer(server.name)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-colors"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-lg bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Plug size={18} className="text-accent" />
                <h3 className="font-medium text-white">
                  {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Preset Info */}
              {selectedPreset && (
                <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                  <div className="flex items-center gap-2 text-accent text-sm">
                    <AlertCircle size={14} />
                    <span>Using {MCP_PRESETS[selectedPreset].name} preset</span>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Server Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={!!editingServer}
                  placeholder="my-server"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 disabled:opacity-50"
                />
              </div>

              {/* Command */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Command</label>
                <input
                  type="text"
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 font-mono"
                />
              </div>

              {/* Arguments */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Arguments (space-separated)</label>
                <input
                  type="text"
                  value={formArgs}
                  onChange={(e) => setFormArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-name"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 font-mono"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-400">Environment Variables</label>
                  <button
                    onClick={handleAddEnvVar}
                    className="text-xs text-accent hover:text-accent-400 transition-colors"
                  >
                    + Add Variable
                  </button>
                </div>
                <div className="space-y-2">
                  {formEnv.map((env, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={env.key}
                        onChange={(e) => handleEnvChange(index, 'key', e.target.value)}
                        placeholder="KEY"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 font-mono text-sm"
                      />
                      <input
                        type="password"
                        value={env.value}
                        onChange={(e) => handleEnvChange(index, 'value', e.target.value)}
                        placeholder="value"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 font-mono text-sm"
                      />
                      <button
                        onClick={() => handleRemoveEnvVar(index)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {formEnv.length === 0 && (
                    <p className="text-xs text-gray-600 italic">No environment variables configured</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveServer}
                className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent-400 transition-colors"
              >
                {editingServer ? 'Save Changes' : 'Add Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
