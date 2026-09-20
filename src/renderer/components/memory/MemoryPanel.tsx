import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  Plus,
  X,
  FileText,
  User,
  Lock,
  FolderTree,
  ExternalLink,
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Edit3,
  Eye,
  Trash2,
  HelpCircle
} from 'lucide-react'
import type { MemoryListResult, MemoryStats, MemoryCategory, MemoryCheckResult } from '../../../shared/types'

interface MemoryPanelProps {
  projectPath: string
  isOpen: boolean
  onClose: () => void
}

type Tab = 'project' | 'local' | 'user'

const categoryInfo: Record<MemoryCategory, { label: string; description: string; color: string }> = {
  context: { label: 'Context', description: 'Project overview and key information', color: 'text-blue-400' },
  architecture: { label: 'Architecture', description: 'Project structure and patterns', color: 'text-sand-400' },
  conventions: { label: 'Conventions', description: 'Code style and naming rules', color: 'text-green-400' },
  commands: { label: 'Commands', description: 'Common build/test commands', color: 'text-orange-400' },
  preferences: { label: 'Preferences', description: 'Your preferences for Claude', color: 'text-yellow-400' },
  decisions: { label: 'Decisions', description: 'Key architectural decisions', color: 'text-red-400' }
}

export default function MemoryPanel({ projectPath, isOpen, onClose }: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('project')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memoryData, setMemoryData] = useState<MemoryListResult | null>(null)
  const [fileStatus, setFileStatus] = useState<MemoryCheckResult | null>(null)
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [rawContent, setRawContent] = useState<Record<Tab, string>>({ project: '', local: '', user: '' })
  const [editMode, setEditMode] = useState<Tab | null>(null)
  const [editContent, setEditContent] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<MemoryCategory>>(new Set(['context', 'architecture']))
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategory, setNewCategory] = useState<MemoryCategory>('context')
  const [newContent, setNewContent] = useState('')
  const [newTarget, setNewTarget] = useState<'main' | 'local' | 'rules'>('main')

  // Load all memory data
  const loadData = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    try {
      const [data, status, projectStats, mainContent, localContent, userContent] = await Promise.all([
        window.api.memoryList(projectPath),
        window.api.memoryCheck(projectPath),
        window.api.memoryStats(projectPath),
        window.api.memoryGetRaw(projectPath, 'main'),
        window.api.memoryGetRaw(projectPath, 'local'),
        window.api.memoryGetRaw(projectPath, 'user')
      ])
      setMemoryData(data)
      setFileStatus(status)
      setStats(projectStats)
      setRawContent({
        project: mainContent,
        local: localContent,
        user: userContent
      })
    } catch (err) {
      console.error('Failed to load memory:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, loadData])

  // Initialize CLAUDE.md
  const handleInit = async () => {
    try {
      const result = await window.api.memoryInit(projectPath)
      if (result.success) {
        loadData()
      }
    } catch (err) {
      console.error('Failed to initialize memory:', err)
    }
  }

  // Open in external editor
  const handleOpenEditor = async (type: Tab) => {
    const typeMap = { project: 'main', local: 'local', user: 'user' } as const
    try {
      await window.api.memoryOpenEditor(projectPath, typeMap[type])
    } catch (err) {
      console.error('Failed to open editor:', err)
    }
  }

  // Start editing
  const handleStartEdit = (tab: Tab) => {
    setEditMode(tab)
    setEditContent(rawContent[tab])
  }

  // Save edits
  const handleSaveEdit = async () => {
    if (!editMode) return
    setSaving(true)
    try {
      const typeMap = { project: 'main', local: 'local', user: 'user' } as const
      await window.api.memorySaveRaw(projectPath, typeMap[editMode], editContent)
      setRawContent(prev => ({ ...prev, [editMode]: editContent }))
      setEditMode(null)
      loadData() // Refresh parsed data
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  // Add new memory item
  const handleAdd = async () => {
    if (!newContent.trim()) return
    try {
      await window.api.memoryAdd(projectPath, {
        category: newCategory,
        content: newContent.trim(),
        target: newTarget
      })
      setNewContent('')
      setShowAddForm(false)
      loadData()
    } catch (err) {
      console.error('Failed to add memory:', err)
    }
  }

  // Delete memory file
  const handleDelete = async (type: 'main' | 'local' | 'rules') => {
    if (!confirm(`Are you sure you want to delete this memory file?`)) return
    try {
      await window.api.memoryDelete(projectPath, type)
      loadData()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  // Toggle category expansion
  const toggleCategory = (cat: MemoryCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  // Get sections for current tab
  const getCurrentSections = () => {
    if (!memoryData) return []
    switch (activeTab) {
      case 'project': return memoryData.main
      case 'local': return memoryData.local
      case 'user': return memoryData.user
      default: return []
    }
  }

  // Check if current tab has content
  const hasContent = (tab: Tab) => {
    switch (tab) {
      case 'project': return fileStatus?.hasMain
      case 'local': return fileStatus?.hasLocal
      case 'user': return fileStatus?.hasUser
      default: return false
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#141416] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border border-white/[0.08] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sand-500/20 rounded-lg">
              <Brain size={20} className="text-sand-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Project Memory</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Sparkles size={10} />
                Uses CLAUDE.md files - native Claude Code format
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 hover:bg-white/[0.06] rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/[0.06] rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          <button
            onClick={() => setActiveTab('project')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'project'
                ? 'text-sand-400 border-sand-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <FileText size={14} />
            Project Memory
            {fileStatus?.hasMain && <CheckCircle size={12} className="text-green-400" />}
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'local'
                ? 'text-sand-400 border-sand-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Lock size={14} />
            Local (Private)
            {fileStatus?.hasLocal && <CheckCircle size={12} className="text-green-400" />}
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'user'
                ? 'text-sand-400 border-sand-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <User size={14} />
            User (Global)
            {fileStatus?.hasUser && <CheckCircle size={12} className="text-green-400" />}
          </button>
          {fileStatus?.hasRules && (
            <div className="flex items-center gap-1 px-4 py-3 text-xs text-gray-500">
              <FolderTree size={12} />
              {stats?.rulesCount || 0} rules
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showAddForm
                  ? 'bg-sand-500 text-white'
                  : 'bg-sand-500/20 text-sand-400 hover:bg-sand-500/30'
              }`}
            >
              <Plus size={14} />
              Add
            </button>

            {editMode === activeTab ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditMode(null)}
                  className="px-3 py-1.5 text-gray-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => handleStartEdit(activeTab)}
                disabled={!hasContent(activeTab)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.1] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Edit3 size={14} />
                Edit Raw
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenEditor(activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors"
              title="Open in default editor"
            >
              <ExternalLink size={14} />
              Open in Editor
            </button>
            {hasContent(activeTab) && activeTab !== 'user' && (
              <button
                onClick={() => handleDelete(activeTab === 'project' ? 'main' : 'local')}
                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete file"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 border-b border-white/[0.06] bg-sand-500/5">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Category:</span>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as MemoryCategory)}
                    className="bg-black/30 border border-white/10 rounded px-2 py-1 text-sm text-white"
                  >
                    {Object.entries(categoryInfo).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Save to:</span>
                  <select
                    value={newTarget}
                    onChange={e => setNewTarget(e.target.value as 'main' | 'local' | 'rules')}
                    className="bg-black/30 border border-white/10 rounded px-2 py-1 text-sm text-white"
                  >
                    <option value="main">Project (CLAUDE.md)</option>
                    <option value="local">Local (CLAUDE.local.md)</option>
                    <option value="rules">Rules (.claude/rules/)</option>
                  </select>
                </div>
              </div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="What should Claude remember?"
                className="w-full h-20 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-sand-500/50"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newContent.trim()}
                  className="px-3 py-1.5 bg-sand-500 text-white text-sm rounded-lg hover:bg-sand-600 transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-sand-400 animate-spin" />
            </div>
          ) : editMode === activeTab ? (
            // Raw edit mode
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="w-full h-full min-h-[300px] bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono resize-none focus:outline-none focus:border-sand-500/50"
              placeholder="# Project Memory\n\n## Context\n\n- Your project context here..."
            />
          ) : !hasContent(activeTab) ? (
            // No content - show create prompt
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertCircle size={40} className="mb-3 opacity-50" />
              <p className="text-sm font-medium mb-1">
                {activeTab === 'project' && 'No CLAUDE.md file found'}
                {activeTab === 'local' && 'No CLAUDE.local.md file (private, gitignored)'}
                {activeTab === 'user' && 'No user-level CLAUDE.md (applies to all projects)'}
              </p>
              <p className="text-xs mb-4 text-center max-w-md">
                {activeTab === 'project' && 'Create a CLAUDE.md file to store project context that Claude reads at session start.'}
                {activeTab === 'local' && 'Store personal notes and preferences that stay on your machine (auto-gitignored).'}
                {activeTab === 'user' && 'Set global preferences that apply across all your projects.'}
              </p>
              <button
                onClick={() => activeTab === 'project' ? handleInit() : handleOpenEditor(activeTab)}
                className="px-4 py-2 bg-sand-500/20 text-sand-400 hover:bg-sand-500/30 rounded-lg text-sm font-medium transition-colors"
              >
                {activeTab === 'project' ? 'Create CLAUDE.md' : 'Create File'}
              </button>
            </div>
          ) : (
            // Show parsed sections
            <div className="space-y-3">
              {getCurrentSections().length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <Eye size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">File exists but has no parsed sections</p>
                  <button
                    onClick={() => handleStartEdit(activeTab)}
                    className="text-sand-400 text-sm mt-2 hover:underline"
                  >
                    Edit raw content
                  </button>
                </div>
              ) : (
                getCurrentSections().map((section, idx) => {
                  const info = categoryInfo[section.category]
                  const isExpanded = expandedCategories.has(section.category)

                  return (
                    <div
                      key={`${section.category}-${idx}`}
                      className="bg-white/[0.02] rounded-xl border border-white/[0.06] overflow-hidden"
                    >
                      <button
                        onClick={() => toggleCategory(section.category)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${info.color}`}>
                            {section.title || info.label}
                          </span>
                          <span className="text-xs text-gray-500">({section.items.length})</span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-500" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-500" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-white/[0.04] px-4 py-3 space-y-2">
                          {section.items.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-sm text-gray-300"
                            >
                              <span className="text-gray-600 mt-0.5">•</span>
                              <span className="whitespace-pre-wrap">{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* Rules section for project tab */}
              {activeTab === 'project' && memoryData && Object.values(memoryData.rules).some(r => r.length > 0) && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FolderTree size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-400">Rules (.claude/rules/)</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(memoryData.rules)
                      .filter(([, items]) => items.length > 0)
                      .map(([category, items]) => {
                        const info = categoryInfo[category as MemoryCategory]
                        const isExpanded = expandedCategories.has(category as MemoryCategory)

                        return (
                          <div
                            key={category}
                            className="bg-white/[0.02] rounded-xl border border-white/[0.06] overflow-hidden"
                          >
                            <button
                              onClick={() => toggleCategory(category as MemoryCategory)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${info.color}`}>
                                  {info.label}
                                </span>
                                <span className="text-xs text-gray-500">({items.length})</span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown size={16} className="text-gray-500" />
                              ) : (
                                <ChevronRight size={16} className="text-gray-500" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="border-t border-white/[0.04] px-4 py-3 space-y-2">
                                {items.map((item, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-2 text-sm text-gray-300"
                                  >
                                    <span className="text-gray-600 mt-0.5">•</span>
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              {stats && (
                <>
                  {stats.mainSize > 0 && <span>Project: {(stats.mainSize / 1024).toFixed(1)}KB</span>}
                  {stats.localSize > 0 && <span>Local: {(stats.localSize / 1024).toFixed(1)}KB</span>}
                  {stats.userSize > 0 && <span>User: {(stats.userSize / 1024).toFixed(1)}KB</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <HelpCircle size={12} />
              <span>Files auto-loaded by Claude Code at session start</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
