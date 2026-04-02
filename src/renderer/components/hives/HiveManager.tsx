import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Zap,
  Paintbrush,
  Route,
  Server,
  Link2,
  Layers,
  Wrench,
  Eye,
  Play,
  Save,
  X,
  AlertCircle,
  Check
} from 'lucide-react'
import { useToast } from '../common/Toast'
import type { Hive } from '../../../shared/types'

// Icon map for hives
const ICON_MAP: Record<string, React.ComponentType<{ size?: string | number; className?: string }>> = {
  Search: Eye,
  Zap: Zap,
  Paintbrush: Paintbrush,
  Wrench: Wrench,
  Route: Route,
  Server: Server,
  Link2: Link2,
  Layers: Layers,
  Play: Play,
  Plus: Plus
}

const ICON_OPTIONS = ['Search', 'Zap', 'Paintbrush', 'Wrench', 'Route', 'Server', 'Link2', 'Layers', 'Play', 'Plus']

const CATEGORY_OPTIONS: Array<{ value: Hive['category']; label: string }> = [
  { value: 'audit', label: 'Audit' },
  { value: 'action', label: 'Action' },
  { value: 'design', label: 'Design' },
  { value: 'custom', label: 'Custom' }
]

const COLOR_OPTIONS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#ef4444', // red
  '#84cc16'  // lime
]

interface HiveManagerProps {
  onBack: () => void
}

export default function HiveManager({ onBack }: HiveManagerProps) {
  const [hives, setHives] = useState<Hive[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingHive, setEditingHive] = useState<Hive | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { showToast } = useToast()

  // Form state for editing/creating
  const [formData, setFormData] = useState<Partial<Hive>>({
    name: '',
    icon: 'Zap',
    description: '',
    prompt: '',
    category: 'custom',
    color: '#3b82f6',
    enabled: true
  })

  // Load hives
  const loadHives = useCallback(async () => {
    try {
      setLoading(true)
      const loaded = await window.api.listHives()
      setHives(loaded)
    } catch (err) {
      showToast('error', 'Error', 'Failed to load hives')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadHives()
  }, [loadHives])

  // Filter hives
  const filteredHives = hives.filter(h =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Start editing
  const startEdit = (hive: Hive) => {
    setEditingHive(hive)
    setFormData({
      name: hive.name,
      icon: hive.icon,
      description: hive.description,
      prompt: hive.prompt,
      category: hive.category,
      color: hive.color,
      enabled: hive.enabled
    })
    setIsCreating(false)
  }

  // Start creating
  const startCreate = () => {
    setEditingHive(null)
    setFormData({
      name: '',
      icon: 'Zap',
      description: '',
      prompt: `🐝 **SWARM [YOUR MODE] ACTIVATED**

[Describe what this swarm should do]

**YOUR TASK:**
1. First, analyze the current codebase context
2. Then CHOOSE 3-5 specialized agents for this task
3. For each agent you spawn, clearly announce: "🐝 Spawning Agent: [Name] - [Role]"
4. Have each agent complete their task

**FOCUS AREAS:**
- [Area 1]
- [Area 2]
- [Area 3]

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Key findings/actions (with file:line references)
- Results

Begin by analyzing the context and selecting your agents now.`,
      category: 'custom',
      color: '#3b82f6',
      enabled: true
    })
    setIsCreating(true)
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingHive(null)
    setIsCreating(false)
    setFormData({
      name: '',
      icon: 'Zap',
      description: '',
      prompt: '',
      category: 'custom',
      color: '#3b82f6',
      enabled: true
    })
  }

  // Save hive
  const saveHive = async () => {
    if (!formData.name?.trim()) {
      showToast('warning', 'Missing Name', 'Please enter a hive name')
      return
    }
    if (!formData.prompt?.trim()) {
      showToast('warning', 'Missing Prompt', 'Please enter a prompt')
      return
    }

    try {
      if (isCreating) {
        const result = await window.api.createHive({
          name: formData.name!,
          icon: formData.icon || 'Zap',
          description: formData.description || '',
          prompt: formData.prompt!,
          category: formData.category || 'custom',
          color: formData.color || '#3b82f6',
          enabled: formData.enabled ?? true
        })
        if (result.success) {
          showToast('success', 'Created', `Hive "${formData.name}" created`)
          await loadHives()
          cancelEdit()
        } else {
          showToast('error', 'Error', result.error || 'Failed to create hive')
        }
      } else if (editingHive) {
        const result = await window.api.updateHive(editingHive.id, formData)
        if (result.success) {
          showToast('success', 'Saved', `Hive "${formData.name}" updated`)
          await loadHives()
          cancelEdit()
        } else {
          showToast('error', 'Error', result.error || 'Failed to update hive')
        }
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to save hive')
    }
  }

  // Delete hive
  const deleteHive = async (id: string) => {
    try {
      const result = await window.api.deleteHive(id)
      if (result.success) {
        showToast('success', 'Deleted', 'Hive deleted')
        await loadHives()
        setDeleteConfirm(null)
      } else {
        showToast('error', 'Error', result.error || 'Failed to delete hive')
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to delete hive')
    }
  }

  // Reset to defaults
  const resetToDefaults = async () => {
    try {
      const result = await window.api.resetHives()
      if (result.success) {
        showToast('success', 'Reset', 'Hives reset to defaults')
        await loadHives()
      } else {
        showToast('error', 'Error', result.error || 'Failed to reset hives')
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to reset hives')
    }
  }

  // Toggle enable/disable
  const toggleEnabled = async (hive: Hive) => {
    try {
      const result = await window.api.updateHive(hive.id, { enabled: !hive.enabled })
      if (result.success) {
        await loadHives()
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to toggle hive')
    }
  }

  // Get icon component
  const getIcon = (iconName: string) => {
    return ICON_MAP[iconName] || Zap
  }

  // Editor view
  if (editingHive || isCreating) {
    return (
      <div className="flex h-full flex-col bg-[#0d0d0d]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-semibold text-white">
              {isCreating ? 'Create New Hive' : `Edit: ${editingHive?.name}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 text-white/60 hover:text-white transition-colors"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={saveHive}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
            >
              <Save size={16} />
              Save
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Basic Info */}
            <div className="bg-white/5 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-medium text-white mb-4">Basic Info</h2>

              {/* Name */}
              <div>
                <label className="block text-sm text-white/60 mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Custom Hive"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-white/60 mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Short description of what this hive does"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm text-white/60 mb-2">Category</label>
                <select
                  value={formData.category || 'custom'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as Hive['category'] })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Icon and Color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {ICON_OPTIONS.map(icon => {
                      const IconComponent = getIcon(icon)
                      return (
                        <button
                          key={icon}
                          onClick={() => setFormData({ ...formData, icon })}
                          className={`p-3 rounded-lg transition-colors ${
                            formData.icon === icon
                              ? 'bg-blue-600 text-white'
                              : 'bg-black/40 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          <IconComponent size={20} />
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-10 h-10 rounded-lg transition-all ${
                          formData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d0d0d]' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Enabled Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    formData.enabled ? 'bg-green-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      formData.enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
                <span className="text-white/60">Enabled</span>
              </div>
            </div>

            {/* Prompt */}
            <div className="bg-white/5 rounded-xl p-6">
              <h2 className="text-lg font-medium text-white mb-4">Swarm Prompt</h2>
              <p className="text-sm text-white/40 mb-4">
                This is the prompt that will be sent to Claude when this hive is activated.
                Include instructions for agent selection, tasks, and output format.
              </p>
              <textarea
                value={formData.prompt || ''}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                placeholder="Enter the swarm prompt..."
                rows={20}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="flex h-full flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold text-white">Hive Manager</h1>
          <span className="text-white/40 text-sm">({hives.length} hives)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
          >
            <Plus size={16} />
            New Hive
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-4 border-b border-white/5">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hives..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full" />
          </div>
        ) : filteredHives.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/40">
            <AlertCircle size={32} className="mb-2" />
            <p>No hives found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHives.map(hive => {
              const IconComponent = getIcon(hive.icon)
              return (
                <div
                  key={hive.id}
                  className={`bg-white/5 rounded-xl p-5 border transition-all ${
                    hive.enabled
                      ? 'border-white/10 hover:border-white/20'
                      : 'border-white/5 opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: hive.color + '20', color: hive.color }}
                    >
                      <IconComponent size={20} />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleEnabled(hive)}
                        className={`p-1.5 rounded transition-colors ${
                          hive.enabled ? 'text-green-400' : 'text-white/30'
                        }`}
                        title={hive.enabled ? 'Disable' : 'Enable'}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => startEdit(hive)}
                        className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      {deleteConfirm === hive.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteHive(hive.id)}
                            className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Confirm delete"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded text-white/40 hover:text-white transition-colors"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(hive.id)}
                          className="p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-white font-medium mb-1">{hive.name}</h3>
                  <p className="text-white/40 text-sm line-clamp-2 mb-3">{hive.description}</p>

                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: hive.color + '20',
                        color: hive.color
                      }}
                    >
                      {hive.category}
                    </span>
                    {!hive.enabled && (
                      <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/40">
                        disabled
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
