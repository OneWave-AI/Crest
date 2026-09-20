import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  Bot,
  Plug,
  Puzzle,
  Server,
  Search,
  Trash2,
  Edit3,
  Package,
  ArrowLeft,
  Copy,
  Download,
  Upload,
  Tag,
  Grid,
  List,
  ChevronDown,
  ArrowUpDown,
  Eye,
  GripVertical,
  X,
  Check,
  Clock,
  Calendar,
  Filter
} from 'lucide-react'
import { useToast, LoadingError } from '../common'
import { logger } from '../../utils'
import { notifySkillInstalled, notifyError } from '../../store/notificationStore'
import SkillEditor from './SkillEditor'
import ImportExport from './ImportExport'
import MCPManager from './MCPManager'
import type { SkillMetadata, MCPServer } from '../../../shared/types'

interface Skill {
  id: string
  name: string
  description: string
  path: string
}

interface Agent {
  id: string
  name: string
  description: string
  path: string
  model?: string
}

interface Plugin {
  id: string
  name: string
  description: string
  enabled: boolean
}

type Tab = 'skills' | 'agents' | 'plugins' | 'mcp'
type ViewMode = 'grid' | 'list'
type SortOption = 'name' | 'created' | 'lastUsed'

interface SkillsManagerProps {
  onBack: () => void
}

// Available categories
const AVAILABLE_CATEGORIES = [
  'Development',
  'Writing',
  'Analysis',
  'Design',
  'Testing',
  'Documentation',
  'Automation',
  'Data',
  'Security',
  'Other'
]

export default function SkillsManager({ onBack }: SkillsManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('skills')
  const [skills, setSkills] = useState<Skill[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [metadata, setMetadata] = useState<Record<string, SkillMetadata>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starterKitAvailable, setStarterKitAvailable] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryFilter, setShowCategoryFilter] = useState(false)

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<{ path: string; name: string; type: 'skill' | 'agent' } | null>(null)

  // Import/Export state
  const [importExportOpen, setImportExportOpen] = useState(false)
  const [importExportMode, setImportExportMode] = useState<'import' | 'export'>('import')
  const [exportItem, setExportItem] = useState<{ id: string; name: string; path: string } | null>(null)

  // Preview state
  const [previewItem, setPreviewItem] = useState<{ path: string; name: string; type: 'skill' | 'agent' } | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // Category editor state
  const [editingCategories, setEditingCategories] = useState<{ id: string; type: 'skill' | 'agent' } | null>(null)
  const [tempCategories, setTempCategories] = useState<string[]>([])

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [skillsData, agentsData, pluginsData, starterKit, metadataData, mcpData] = await Promise.all([
        window.api.listSkills(),
        window.api.listAgents(),
        window.api.listPlugins(),
        window.api.checkStarterKit(),
        window.api.getAllMetadata(),
        window.api.mcpList().catch(() => [] as MCPServer[])
      ])
      setSkills(skillsData)
      setAgents(agentsData)
      setPlugins(pluginsData)
      setMetadata(metadataData)
      setMcpServers(mcpData)
      setStarterKitAvailable(!starterKit.hasSkills && !starterKit.hasAgents)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load skills data'
      setError(errorMessage)
      logger.error(err instanceof Error ? err : errorMessage, {
        component: 'SkillsManager',
        action: 'loadData'
      })
      showToast('error', 'Failed to load data', 'Please try again or restart the app')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleInstallStarterKit = async () => {
    try {
      const result = await window.api.installStarterKit()
      if (result.success) {
        showToast('success', 'Starter kit installed', `${result.skillsInstalled} skills, ${result.agentsInstalled} agents`)
        notifySkillInstalled('Starter Kit', result.skillsInstalled + result.agentsInstalled)
        await loadData()
      } else {
        showToast('error', 'Installation failed', 'Could not install starter kit')
        notifyError('Installation Failed', 'Could not install starter kit', 'skills')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Installation failed'
      logger.error(err instanceof Error ? err : errorMessage, {
        component: 'SkillsManager',
        action: 'installStarterKit'
      })
      showToast('error', 'Installation failed', errorMessage)
      notifyError('Installation Failed', errorMessage, 'skills')
    }
  }

  const handleDeleteSkill = async (skillId: string) => {
    if (confirm(`Delete skill "${skillId}"?`)) {
      try {
        await window.api.deleteSkill(skillId)
        showToast('success', 'Skill deleted', `"${skillId}" has been removed`)
        await loadData()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Delete failed'
        logger.error(err instanceof Error ? err : errorMessage, {
          component: 'SkillsManager',
          action: 'deleteSkill',
          metadata: { skillId }
        })
        showToast('error', 'Delete failed', errorMessage)
      }
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (confirm(`Delete agent "${agentId}"?`)) {
      try {
        await window.api.deleteAgent(agentId)
        showToast('success', 'Agent deleted', `"${agentId}" has been removed`)
        await loadData()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Delete failed'
        logger.error(err instanceof Error ? err : errorMessage, {
          component: 'SkillsManager',
          action: 'deleteAgent',
          metadata: { agentId }
        })
        showToast('error', 'Delete failed', errorMessage)
      }
    }
  }

  const handleDuplicateSkill = async (skillId: string) => {
    try {
      const result = await window.api.duplicateSkill(skillId)
      if (result.success) {
        showToast('success', 'Skill duplicated', `Created "${result.newId}"`)
        await loadData()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Duplicate failed'
      logger.error(err instanceof Error ? err : errorMessage, {
        component: 'SkillsManager',
        action: 'duplicateSkill'
      })
      showToast('error', 'Duplicate failed', errorMessage)
    }
  }

  const handleDuplicateAgent = async (agentId: string) => {
    try {
      const result = await window.api.duplicateAgent(agentId)
      if (result.success) {
        showToast('success', 'Agent duplicated', `Created "${result.newId}"`)
        await loadData()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Duplicate failed'
      logger.error(err instanceof Error ? err : errorMessage, {
        component: 'SkillsManager',
        action: 'duplicateAgent'
      })
      showToast('error', 'Duplicate failed', errorMessage)
    }
  }

  const handleEdit = (path: string, name: string, type: 'skill' | 'agent') => {
    setEditingItem({ path, name, type })
    setEditorOpen(true)
  }

  const handleExport = (id: string, name: string, path: string) => {
    setExportItem({ id, name, path })
    setImportExportMode('export')
    setImportExportOpen(true)
  }

  const handleImport = () => {
    setExportItem(null)
    setImportExportMode('import')
    setImportExportOpen(true)
  }

  const handlePreview = async (path: string, name: string, type: 'skill' | 'agent') => {
    setPreviewItem({ path, name, type })
    setPreviewLoading(true)
    try {
      const content = await window.api.readSkillContent(path)
      setPreviewContent(content)
    } catch (err) {
      console.error('Failed to load preview:', err)
      setPreviewContent('Failed to load content')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUpdateCategories = async (id: string, type: 'skill' | 'agent', categories: string[]) => {
    const metaId = type === 'agent' ? `agent:${id}` : id
    try {
      await window.api.updateSkillMetadata(metaId, { categories })
      setMetadata(prev => ({
        ...prev,
        [metaId]: { ...prev[metaId], categories }
      }))
      setEditingCategories(null)
      showToast('success', 'Categories updated', `Updated categories for ${type}`)
    } catch (err) {
      showToast('error', 'Update failed', 'Could not update categories')
    }
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedItem !== id) {
      setDragOverItem(id)
    }
  }

  const handleDragEnd = async () => {
    if (draggedItem && dragOverItem && draggedItem !== dragOverItem) {
      const items = activeTab === 'skills' ? [...skills] : [...agents]
      const draggedIndex = items.findIndex(item => item.id === draggedItem)
      const overIndex = items.findIndex(item => item.id === dragOverItem)

      if (draggedIndex !== -1 && overIndex !== -1) {
        const [removed] = items.splice(draggedIndex, 1)
        items.splice(overIndex, 0, removed)

        // Update order in metadata
        const newMetadata = { ...metadata }
        items.forEach((item, index) => {
          const metaId = activeTab === 'agents' ? `agent:${item.id}` : item.id
          newMetadata[metaId] = { ...newMetadata[metaId], order: index }
        })

        try {
          await window.api.saveAllMetadata(newMetadata)
          setMetadata(newMetadata)

          if (activeTab === 'skills') {
            setSkills(items as Skill[])
          } else {
            setAgents(items as Agent[])
          }
        } catch (err) {
          showToast('error', 'Reorder failed', 'Could not save new order')
        }
      }
    }
    setDraggedItem(null)
    setDragOverItem(null)
  }

  // Sort and filter
  const sortItems = <T extends Skill | Agent>(items: T[], type: 'skill' | 'agent'): T[] => {
    return [...items].sort((a, b) => {
      const metaA = metadata[type === 'agent' ? `agent:${a.id}` : a.id] || {}
      const metaB = metadata[type === 'agent' ? `agent:${b.id}` : b.id] || {}

      // Check if we have custom order
      if (metaA.order !== undefined && metaB.order !== undefined) {
        return metaA.order - metaB.order
      }

      switch (sortOption) {
        case 'created':
          return (metaB.createdAt || 0) - (metaA.createdAt || 0)
        case 'lastUsed':
          return (metaB.lastUsed || 0) - (metaA.lastUsed || 0)
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }

  const filterByCategory = <T extends Skill | Agent>(items: T[], type: 'skill' | 'agent'): T[] => {
    if (!selectedCategory) return items
    return items.filter(item => {
      const metaId = type === 'agent' ? `agent:${item.id}` : item.id
      const meta = metadata[metaId] || {}
      return meta.categories?.includes(selectedCategory)
    })
  }

  const filteredSkills = filterByCategory(
    sortItems(
      skills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
      'skill'
    ),
    'skill'
  )

  const filteredAgents = filterByCategory(
    sortItems(
      agents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
      'agent'
    ),
    'agent'
  )

  const tabs = [
    { id: 'skills' as Tab, label: 'Skills', icon: Sparkles, count: skills.length },
    { id: 'agents' as Tab, label: 'Agents', icon: Bot, count: agents.length },
    { id: 'plugins' as Tab, label: 'Plugins', icon: Puzzle, count: plugins.length },
    { id: 'mcp' as Tab, label: 'MCP Servers', icon: Server, count: mcpServers.length }
  ]

  const sortOptions = [
    { id: 'name' as SortOption, label: 'Name', icon: ArrowUpDown },
    { id: 'created' as SortOption, label: 'Date Created', icon: Calendar },
    { id: 'lastUsed' as SortOption, label: 'Recently Used', icon: Clock }
  ]

  // Page entry animation
  const [pageVisible, setPageVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPageVisible(true))
    })
  }, [])

  return (
    <div className={`h-full flex flex-col bg-[#0d0d0d] transition-all duration-500 ease-out ${
      pageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold text-white">Skills & Agents</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#cc785c]/50"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <button
              onClick={() => setShowCategoryFilter(!showCategoryFilter)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCategory
                  ? 'bg-[#cc785c]/20 text-[#cc785c]'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Filter size={16} />
              {selectedCategory || 'Filter'}
              <ChevronDown size={14} />
            </button>
            {showCategoryFilter && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-xl z-20 py-2">
                <button
                  onClick={() => {
                    setSelectedCategory(null)
                    setShowCategoryFilter(false)
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    !selectedCategory ? 'text-[#cc785c]' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All Categories
                </button>
                {AVAILABLE_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat)
                      setShowCategoryFilter(false)
                    }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                      selectedCategory === cat ? 'text-[#cc785c]' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
            >
              <ArrowUpDown size={16} />
              Sort
              <ChevronDown size={14} />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-xl z-20 py-2">
                {sortOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSortOption(opt.id)
                      setShowSortMenu(false)
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      sortOption === opt.id ? 'text-[#cc785c]' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <opt.icon size={14} />
                    {opt.label}
                    {sortOption === opt.id && <Check size={14} className="ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-white/[0.04] rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-[#cc785c]/20 text-[#cc785c]' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-[#cc785c]/20 text-[#cc785c]' : 'text-gray-500 hover:text-white'
              }`}
            >
              <List size={16} />
            </button>
          </div>

          {/* Import Button */}
          {activeTab !== 'plugins' && activeTab !== 'mcp' && (
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
            >
              <Upload size={16} />
              Import
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 btn-scale-hover ${
              activeTab === tab.id
                ? 'bg-[#cc785c]/20 text-[#cc785c]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon size={16} className={`transition-transform duration-200 ${activeTab === tab.id ? 'scale-110' : ''}`} />
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              activeTab === tab.id ? 'bg-[#cc785c]/30' : 'bg-white/10'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content area */}
        <div className={`flex-1 overflow-y-auto p-6 ${previewItem ? 'w-1/2' : 'w-full'}`}>
          {error ? (
            <LoadingError
              resource="skills and agents"
              onRetry={loadData}
            />
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <div className="w-8 h-8 border-2 border-[#cc785c]/30 border-t-[#cc785c] rounded-full animate-spin" />
                <span>Loading skills and agents...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Skills Tab */}
              {activeTab === 'skills' && (
                <div>
                  {filteredSkills.length === 0 ? (
                    <EmptyState
                      icon={Sparkles}
                      title="No skills found"
                      description="Skills extend Claude's capabilities with custom commands"
                      showStarterKit={starterKitAvailable}
                      onInstallStarterKit={handleInstallStarterKit}
                    />
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          metadata={metadata[skill.id] || {}}
                          onEdit={() => handleEdit(skill.path, skill.name, 'skill')}
                          onDelete={() => handleDeleteSkill(skill.id)}
                          onDuplicate={() => handleDuplicateSkill(skill.id)}
                          onExport={() => handleExport(skill.id, skill.name, skill.path)}
                          onPreview={() => handlePreview(skill.path, skill.name, 'skill')}
                          onEditCategories={() => {
                            setEditingCategories({ id: skill.id, type: 'skill' })
                            setTempCategories(metadata[skill.id]?.categories || [])
                          }}
                          isPreviewActive={previewItem?.path === skill.path}
                          isDragging={draggedItem === skill.id}
                          isDragOver={dragOverItem === skill.id}
                          onDragStart={(e) => handleDragStart(e, skill.id)}
                          onDragOver={(e) => handleDragOver(e, skill.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSkills.map((skill) => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          metadata={metadata[skill.id] || {}}
                          onEdit={() => handleEdit(skill.path, skill.name, 'skill')}
                          onDelete={() => handleDeleteSkill(skill.id)}
                          onDuplicate={() => handleDuplicateSkill(skill.id)}
                          onExport={() => handleExport(skill.id, skill.name, skill.path)}
                          onPreview={() => handlePreview(skill.path, skill.name, 'skill')}
                          isPreviewActive={previewItem?.path === skill.path}
                          isDragging={draggedItem === skill.id}
                          isDragOver={dragOverItem === skill.id}
                          onDragStart={(e) => handleDragStart(e, skill.id)}
                          onDragOver={(e) => handleDragOver(e, skill.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Agents Tab */}
              {activeTab === 'agents' && (
                <div>
                  {filteredAgents.length === 0 ? (
                    <EmptyState
                      icon={Bot}
                      title="No agents found"
                      description="Agents are specialized AI assistants for specific tasks"
                      showStarterKit={starterKitAvailable}
                      onInstallStarterKit={handleInstallStarterKit}
                    />
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredAgents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          metadata={metadata[`agent:${agent.id}`] || {}}
                          onEdit={() => handleEdit(agent.path, agent.name, 'agent')}
                          onDelete={() => handleDeleteAgent(agent.id)}
                          onDuplicate={() => handleDuplicateAgent(agent.id)}
                          onExport={() => handleExport(agent.id, agent.name, agent.path)}
                          onPreview={() => handlePreview(agent.path, agent.name, 'agent')}
                          onEditCategories={() => {
                            setEditingCategories({ id: agent.id, type: 'agent' })
                            setTempCategories(metadata[`agent:${agent.id}`]?.categories || [])
                          }}
                          isPreviewActive={previewItem?.path === agent.path}
                          isDragging={draggedItem === agent.id}
                          isDragOver={dragOverItem === agent.id}
                          onDragStart={(e) => handleDragStart(e, agent.id)}
                          onDragOver={(e) => handleDragOver(e, agent.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredAgents.map((agent) => (
                        <AgentRow
                          key={agent.id}
                          agent={agent}
                          metadata={metadata[`agent:${agent.id}`] || {}}
                          onEdit={() => handleEdit(agent.path, agent.name, 'agent')}
                          onDelete={() => handleDeleteAgent(agent.id)}
                          onDuplicate={() => handleDuplicateAgent(agent.id)}
                          onExport={() => handleExport(agent.id, agent.name, agent.path)}
                          onPreview={() => handlePreview(agent.path, agent.name, 'agent')}
                          isPreviewActive={previewItem?.path === agent.path}
                          isDragging={draggedItem === agent.id}
                          isDragOver={dragOverItem === agent.id}
                          onDragStart={(e) => handleDragStart(e, agent.id)}
                          onDragOver={(e) => handleDragOver(e, agent.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Plugins Tab */}
              {activeTab === 'plugins' && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Puzzle className="w-12 h-12 text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Plugins</h3>
                  <p className="text-gray-500 text-sm max-w-md">
                    Plugins extend Claude Code with additional functionality.
                    {plugins.length === 0 ? ' No plugins installed yet.' : ` ${plugins.length} plugins installed.`}
                  </p>
                  {plugins.length > 0 && (
                    <div className="mt-4 space-y-2 w-full max-w-md">
                      {plugins.map((plugin) => (
                        <div key={plugin.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                          <div>
                            <p className="text-sm font-medium text-white">{plugin.name}</p>
                            <p className="text-xs text-gray-500">{plugin.description}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${plugin.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {plugin.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MCP Servers Tab */}
              {activeTab === 'mcp' && (
                <MCPManager />
              )}
            </>
          )}
        </div>

        {/* Preview Panel */}
        {previewItem && (
          <div className="w-1/2 border-l border-white/[0.06] flex flex-col bg-white/[0.01]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${previewItem.type === 'skill' ? 'bg-[#cc785c]/10' : 'bg-sand-500/10'}`}>
                  {previewItem.type === 'skill' ? (
                    <Sparkles size={16} className="text-[#cc785c]" />
                  ) : (
                    <Bot size={16} className="text-sand-400" />
                  )}
                </div>
                <h3 className="font-medium text-white">{previewItem.name}</h3>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Loading preview...
                </div>
              ) : (
                <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
                  <HighlightedMarkdown content={previewContent} />
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editingItem && (
        <SkillEditor
          isOpen={editorOpen}
          onClose={() => {
            setEditorOpen(false)
            setEditingItem(null)
          }}
          itemPath={editingItem.path}
          itemName={editingItem.name}
          itemType={editingItem.type}
          onSave={loadData}
        />
      )}

      {/* Import/Export Modal */}
      <ImportExport
        isOpen={importExportOpen}
        onClose={() => {
          setImportExportOpen(false)
          setExportItem(null)
        }}
        mode={importExportMode}
        itemType={activeTab === 'agents' ? 'agent' : 'skill'}
        exportItem={exportItem || undefined}
        onComplete={loadData}
      />

      {/* Category Editor Modal */}
      {editingCategories && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setEditingCategories(null)}
          />
          <div className="relative w-full max-w-md bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-[#cc785c]" />
                <h3 className="font-medium text-white">Edit Categories</h3>
              </div>
              <button
                onClick={() => setEditingCategories(null)}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {AVAILABLE_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setTempCategories(prev =>
                        prev.includes(cat)
                          ? prev.filter(c => c !== cat)
                          : [...prev, cat]
                      )
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      tempCategories.includes(cat)
                        ? 'bg-[#cc785c]/20 text-[#cc785c] border border-[#cc785c]/30'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingCategories(null)}
                  className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateCategories(editingCategories.id, editingCategories.type, tempCategories)}
                  className="px-4 py-2 rounded-lg bg-[#cc785c] text-white font-medium hover:bg-[#d68a6e] transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Highlighted Markdown for preview
function HighlightedMarkdown({ content }: { content: string }) {
  const highlightMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      let className = 'text-gray-300'

      if (line.startsWith('---')) {
        className = 'text-[#cc785c]/60'
      } else if (line.startsWith('#')) {
        className = 'text-[#cc785c] font-bold'
      } else if (line.match(/^[a-z]+:/i) && !line.startsWith(' ')) {
        className = 'text-[#cc785c]'
      } else if (line.startsWith('```')) {
        className = 'text-sand-400'
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        className = 'text-gray-300'
      } else if (line.startsWith('>')) {
        className = 'text-gray-500 italic'
      }

      return (
        <span key={i} className={className}>
          {line}
          {'\n'}
        </span>
      )
    })
  }

  return <>{highlightMarkdown(content)}</>
}

// Skill Card Component (Grid View)
interface SkillCardProps {
  skill: Skill
  metadata: SkillMetadata
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
  onPreview: () => void
  onEditCategories: () => void
  isPreviewActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function SkillCard({
  skill,
  metadata,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onPreview,
  onEditCategories,
  isPreviewActive,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd
}: SkillCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group p-4 rounded-xl border cursor-grab active:cursor-grabbing card-hover transition-all duration-200 ${
        isDragging
          ? 'opacity-50 border-[#cc785c]/50 scale-105'
          : isDragOver
          ? 'border-[#cc785c] bg-[#cc785c]/5'
          : isPreviewActive
          ? 'border-[#cc785c]/50 bg-[#cc785c]/5'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04] hover:shadow-lg'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-2 rounded-lg bg-[#cc785c]/10">
            <Sparkles size={18} className="text-[#cc785c]" />
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onPreview}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white"
            title="Preview"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white"
            title="Edit"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white"
            title="Duplicate"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={onExport}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white"
            title="Export"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onEditCategories}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white"
            title="Categories"
          >
            <Tag size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-white mb-1">{skill.name}</h3>
      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{skill.description}</p>
      {metadata.categories && metadata.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {metadata.categories.map(cat => (
            <span key={cat} className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
              {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Skill Row Component (List View)
interface SkillRowProps {
  skill: Skill
  metadata: SkillMetadata
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
  onPreview: () => void
  isPreviewActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function SkillRow({
  skill,
  metadata,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onPreview,
  isPreviewActive,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd
}: SkillRowProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-50 border-[#cc785c]/50'
          : isDragOver
          ? 'border-[#cc785c] bg-[#cc785c]/5'
          : isPreviewActive
          ? 'border-[#cc785c]/50 bg-[#cc785c]/5'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'
      }`}
    >
      <div className="flex items-center gap-3">
        <GripVertical size={14} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="p-2 rounded-lg bg-[#cc785c]/10">
          <Sparkles size={16} className="text-[#cc785c]" />
        </div>
        <div>
          <h3 className="font-medium text-white">{skill.name}</h3>
          <p className="text-xs text-gray-500">{skill.description}</p>
        </div>
        {metadata.categories && metadata.categories.length > 0 && (
          <div className="flex gap-1 ml-4">
            {metadata.categories.map(cat => (
              <span key={cat} className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onPreview} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Eye size={16} />
        </button>
        <button onClick={onEdit} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Edit3 size={16} />
        </button>
        <button onClick={onDuplicate} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Copy size={16} />
        </button>
        <button onClick={onExport} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Download size={16} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// Agent Card Component (Grid View)
interface AgentCardProps {
  agent: Agent
  metadata: SkillMetadata
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
  onPreview: () => void
  onEditCategories: () => void
  isPreviewActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function AgentCard({
  agent,
  metadata,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onPreview,
  onEditCategories,
  isPreviewActive,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd
}: AgentCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-50 border-sand-500/50'
          : isDragOver
          ? 'border-sand-500 bg-sand-500/5'
          : isPreviewActive
          ? 'border-sand-500/50 bg-sand-500/5'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-2 rounded-lg bg-sand-500/10">
            <Bot size={18} className="text-sand-400" />
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onPreview} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Preview">
            <Eye size={14} />
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Edit">
            <Edit3 size={14} />
          </button>
          <button onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Duplicate">
            <Copy size={14} />
          </button>
          <button onClick={onExport} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Export">
            <Download size={14} />
          </button>
          <button onClick={onEditCategories} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Categories">
            <Tag size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-white mb-1">{agent.name}</h3>
      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{agent.description}</p>
      <div className="flex flex-wrap gap-1">
        {agent.model && (
          <span className="px-2 py-0.5 rounded text-[10px] bg-sand-500/10 text-sand-400">
            {agent.model}
          </span>
        )}
        {metadata.categories?.map(cat => (
          <span key={cat} className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
            {cat}
          </span>
        ))}
      </div>
    </div>
  )
}

// Agent Row Component (List View)
interface AgentRowProps {
  agent: Agent
  metadata: SkillMetadata
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onExport: () => void
  onPreview: () => void
  isPreviewActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function AgentRow({
  agent,
  metadata,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onPreview,
  isPreviewActive,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd
}: AgentRowProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-50 border-sand-500/50'
          : isDragOver
          ? 'border-sand-500 bg-sand-500/5'
          : isPreviewActive
          ? 'border-sand-500/50 bg-sand-500/5'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'
      }`}
    >
      <div className="flex items-center gap-3">
        <GripVertical size={14} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="p-2 rounded-lg bg-sand-500/10">
          <Bot size={16} className="text-sand-400" />
        </div>
        <div>
          <h3 className="font-medium text-white">{agent.name}</h3>
          <p className="text-xs text-gray-500">{agent.description}</p>
        </div>
        <div className="flex gap-1 ml-4">
          {agent.model && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-sand-500/10 text-sand-400">
              {agent.model}
            </span>
          )}
          {metadata.categories?.map(cat => (
            <span key={cat} className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
              {cat}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onPreview} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Eye size={16} />
        </button>
        <button onClick={onEdit} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Edit3 size={16} />
        </button>
        <button onClick={onDuplicate} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Copy size={16} />
        </button>
        <button onClick={onExport} className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white">
          <Download size={16} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// Empty State Component
function EmptyState({
  icon: Icon,
  title,
  description,
  showStarterKit,
  onInstallStarterKit
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  title: string
  description: string
  showStarterKit?: boolean
  onInstallStarterKit?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-white/5 mb-4">
        <Icon size={32} className="text-gray-500" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">{description}</p>

      {showStarterKit && onInstallStarterKit && (
        <button
          onClick={onInstallStarterKit}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#cc785c] text-white font-medium hover:bg-[#d68a6e] transition-colors"
        >
          <Package size={18} />
          Install Starter Kit
        </button>
      )}
    </div>
  )
}
