import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search,
  X,
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Image,
  Folder,
  Clock,
  MessageSquare,
  Zap,
  Bot,
  Settings,
  Terminal,
  History,
  Home,
  FolderOpen,
  GitCommit,
  GitBranch,
  ArrowDownToLine,
  Command,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  Play,
  Trash2,
  CornerDownLeft
} from 'lucide-react'
import { useFocusTrap } from '../../hooks'
import type { FileNode, Skill, Agent, Conversation } from '../../../shared/types'

// Search result types
type SearchCategory = 'files' | 'conversations' | 'skills' | 'commands' | 'settings'

interface SearchResult {
  id: string
  type: SearchCategory
  title: string
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  path?: string
  data?: unknown
  action: () => void
  quickActions?: QuickAction[]
}

interface QuickAction {
  id: string
  label: string
  icon: React.ElementType
  action: () => void
}

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  cwd: string
  onNavigate: (screen: string) => void
  onSelectFile?: (path: string) => void
  onResumeConversation?: (conversation: Conversation) => void
  onOpenSettings?: () => void
  onCommand?: (commandId: string) => void
}

// File extension to icon mapping
const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, typeof File> = {
    ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
    py: FileCode, rb: FileCode, go: FileCode, rs: FileCode,
    cpp: FileCode, c: FileCode, java: FileCode, swift: FileCode,
    json: FileJson, yaml: FileJson, yml: FileJson, toml: FileJson,
    md: FileText, txt: FileText, doc: FileText,
    css: FileType, scss: FileType, sass: FileType,
    png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image
  }
  return iconMap[ext] || File
}

// Fuzzy matching with scoring
function fuzzyMatch(query: string, target: string): { match: boolean; score: number; highlights: number[] } {
  if (!query) return { match: true, score: 0, highlights: [] }

  const queryLower = query.toLowerCase()
  const targetLower = target.toLowerCase()
  const highlights: number[] = []

  // Exact match
  if (targetLower === queryLower) return { match: true, score: 100, highlights: Array.from({ length: target.length }, (_, i) => i) }

  // Starts with
  if (targetLower.startsWith(queryLower)) {
    return { match: true, score: 80, highlights: Array.from({ length: query.length }, (_, i) => i) }
  }

  // Contains
  const containsIdx = targetLower.indexOf(queryLower)
  if (containsIdx !== -1) {
    return {
      match: true,
      score: 60,
      highlights: Array.from({ length: query.length }, (_, i) => containsIdx + i)
    }
  }

  // Fuzzy character matching
  let queryIndex = 0
  let score = 0
  let consecutiveBonus = 0

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      score += 10 + consecutiveBonus
      consecutiveBonus += 5
      highlights.push(i)
      queryIndex++
    } else {
      consecutiveBonus = 0
    }
  }

  if (queryIndex === queryLower.length) {
    return { match: true, score: Math.min(50, score / queryLower.length), highlights }
  }

  return { match: false, score: 0, highlights: [] }
}

// Highlight matched characters
function HighlightedText({ text, highlights }: { text: string; highlights: number[] }) {
  if (highlights.length === 0) return <>{text}</>

  return (
    <>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className={highlights.includes(i) ? 'text-accent font-semibold' : ''}
        >
          {char}
        </span>
      ))}
    </>
  )
}

// Storage keys
const RECENT_SEARCHES_KEY = 'global_search_recent'
const MAX_RECENT_SEARCHES = 8

// Category labels and icons
const CATEGORY_CONFIG: Record<SearchCategory, { label: string; icon: React.ElementType }> = {
  files: { label: 'Files', icon: Folder },
  conversations: { label: 'Conversations', icon: MessageSquare },
  skills: { label: 'Skills & Agents', icon: Zap },
  commands: { label: 'Commands', icon: Command },
  settings: { label: 'Settings', icon: Settings }
}

// Default commands
const DEFAULT_COMMANDS = [
  { id: 'go-home', label: 'Go Home', category: 'commands' as const, icon: Home, shortcut: ['Cmd', 'H'] },
  { id: 'open-settings', label: 'Open Settings', category: 'commands' as const, icon: Settings, shortcut: ['Cmd', ','] },
  { id: 'open-skills', label: 'Open Skills Manager', category: 'commands' as const, icon: Zap, shortcut: ['Cmd', 'Shift', 'S'] },
  { id: 'open-history', label: 'Open History', category: 'commands' as const, icon: History, shortcut: ['Cmd', 'Shift', 'H'] },
  { id: 'new-terminal', label: 'New Terminal Tab', category: 'commands' as const, icon: Terminal, shortcut: ['Cmd', 'Shift', 'T'] },
  { id: 'select-folder', label: 'Select Folder', category: 'commands' as const, icon: FolderOpen, shortcut: ['Cmd', 'O'] },
  { id: 'git-commit', label: 'Git Commit', category: 'commands' as const, icon: GitCommit, shortcut: ['Cmd', 'Shift', 'C'] },
  { id: 'git-push', label: 'Git Push', category: 'commands' as const, icon: GitBranch, shortcut: ['Cmd', 'Shift', 'P'] },
  { id: 'git-pull', label: 'Git Pull', category: 'commands' as const, icon: ArrowDownToLine, shortcut: ['Cmd', 'Shift', 'L'] }
]

// Settings items for search
const SETTINGS_ITEMS = [
  { id: 'settings-appearance', label: 'Appearance Settings', section: 'appearance', keywords: ['theme', 'dark', 'light', 'colors', 'opacity'] },
  { id: 'settings-terminal', label: 'Terminal Settings', section: 'terminal', keywords: ['font', 'size', 'cursor', 'scrollback', 'bell'] },
  { id: 'settings-behavior', label: 'Behavior Settings', section: 'behavior', keywords: ['auto', 'update', 'confirm', 'close'] },
  { id: 'settings-api', label: 'API Settings', section: 'api', keywords: ['key', 'claude', 'anthropic', 'token'] },
  { id: 'settings-data', label: 'Data & Backup', section: 'data', keywords: ['export', 'import', 'reset', 'clear', 'backup'] },
  { id: 'settings-shortcuts', label: 'Keyboard Shortcuts', section: 'shortcuts', keywords: ['keys', 'hotkeys', 'bindings'] }
]

export default function GlobalSearch({
  isOpen,
  onClose,
  cwd,
  onNavigate,
  onSelectFile,
  onResumeConversation,
  onOpenSettings,
  onCommand
}: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [previewItem, setPreviewItem] = useState<SearchResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Data sources
  const [files, setFiles] = useState<FileNode[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [agents, setAgents] = useState<Agent[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus trap
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, {
    restoreFocus: true,
    autoFocus: false,
    initialFocus: 'input[type="text"]'
  })

  // Animation state
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
      if (stored) setRecentSearches(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  // Load data when opened
  useEffect(() => {
    if (isOpen) {
      loadAllData()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    if (!isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setSelectedCategory('all')
      setPreviewItem(null)
      setShowPreview(false)
    }
  }, [isOpen])

  // Animation
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true))
      })
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => setIsAnimating(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [fileList, convList, skillList, agentList] = await Promise.all([
        window.api?.listFiles() || [],
        window.api?.listConversations() || [],
        window.api?.listSkills() || [],
        window.api?.listAgents() || []
      ])
      setFiles(fileList.filter(f => !f.isDirectory))
      setConversations(convList)
      setSkills(skillList)
      setAgents(agentList)
    } catch (err) {
      console.error('Failed to load search data:', err)
    }
    setLoading(false)
  }

  // Build search results
  const searchResults = useMemo((): SearchResult[] => {
    const results: SearchResult[] = []
    const q = query.trim()

    // Files
    if (selectedCategory === 'all' || selectedCategory === 'files') {
      for (const file of files) {
        const { match, score, highlights } = fuzzyMatch(q, file.name)
        if (!q || match) {
          const FileIcon = getFileIcon(file.name)
          results.push({
            id: `file-${file.path}`,
            type: 'files',
            title: file.name,
            subtitle: getRelativePath(file.path, cwd),
            icon: FileIcon,
            iconColor: 'text-blue-400',
            path: file.path,
            data: { highlights, score },
            action: () => {
              onSelectFile?.(file.path)
              saveRecentSearch(file.name)
              onClose()
            },
            quickActions: [
              {
                id: 'copy-path',
                label: 'Copy Path',
                icon: Copy,
                action: () => navigator.clipboard.writeText(file.path)
              },
              {
                id: 'open-external',
                label: 'Open External',
                icon: ExternalLink,
                action: () => window.api?.openFileExternal(file.path)
              },
              {
                id: 'show-finder',
                label: 'Show in Finder',
                icon: FolderOpen,
                action: () => window.api?.showInFinder(file.path)
              }
            ]
          })
        }
      }
    }

    // Conversations
    if (selectedCategory === 'all' || selectedCategory === 'conversations') {
      for (const conv of conversations) {
        const searchText = `${conv.projectFolder} ${conv.preview || ''}`
        const { match, score, highlights } = fuzzyMatch(q, searchText)
        if (!q || match) {
          results.push({
            id: `conv-${conv.id}`,
            type: 'conversations',
            title: conv.preview?.slice(0, 60) || 'Conversation',
            subtitle: `${conv.projectFolder} - ${formatDate(conv.timestamp)}`,
            icon: MessageSquare,
            iconColor: 'text-sand-400',
            path: conv.projectFolder,
            data: { conversation: conv, score },
            action: () => {
              onResumeConversation?.(conv)
              saveRecentSearch(conv.preview?.slice(0, 30) || 'Conversation')
              onClose()
            },
            quickActions: [
              {
                id: 'preview',
                label: 'Preview',
                icon: Eye,
                action: () => {
                  setPreviewItem(results.find(r => r.id === `conv-${conv.id}`) || null)
                  setShowPreview(true)
                }
              }
            ]
          })
        }
      }
    }

    // Skills & Agents
    if (selectedCategory === 'all' || selectedCategory === 'skills') {
      for (const skill of skills) {
        const searchText = `${skill.name} ${skill.description}`
        const { match, score, highlights } = fuzzyMatch(q, searchText)
        if (!q || match) {
          results.push({
            id: `skill-${skill.id}`,
            type: 'skills',
            title: skill.name,
            subtitle: skill.description,
            icon: Zap,
            iconColor: 'text-yellow-400',
            path: skill.path,
            data: { skill, score },
            action: () => {
              onNavigate('skills')
              saveRecentSearch(skill.name)
              onClose()
            },
            quickActions: [
              {
                id: 'run',
                label: 'Use Skill',
                icon: Play,
                action: () => {
                  window.api?.updateLastUsed(skill.id)
                  onNavigate('terminal')
                  onClose()
                }
              }
            ]
          })
        }
      }

      for (const agent of agents) {
        const searchText = `${agent.name} ${agent.description}`
        const { match, score } = fuzzyMatch(q, searchText)
        if (!q || match) {
          results.push({
            id: `agent-${agent.id}`,
            type: 'skills',
            title: agent.name,
            subtitle: agent.description,
            icon: Bot,
            iconColor: 'text-green-400',
            path: agent.path,
            data: { agent, score },
            action: () => {
              onNavigate('skills')
              saveRecentSearch(agent.name)
              onClose()
            }
          })
        }
      }
    }

    // Commands
    if (selectedCategory === 'all' || selectedCategory === 'commands') {
      for (const cmd of DEFAULT_COMMANDS) {
        const { match, score } = fuzzyMatch(q, cmd.label)
        if (!q || match) {
          results.push({
            id: `cmd-${cmd.id}`,
            type: 'commands',
            title: cmd.label,
            subtitle: cmd.shortcut?.join(' + '),
            icon: cmd.icon,
            iconColor: 'text-accent',
            data: { command: cmd, score },
            action: () => {
              onCommand?.(cmd.id)
              saveRecentSearch(cmd.label)
              onClose()
            }
          })
        }
      }
    }

    // Settings
    if (selectedCategory === 'all' || selectedCategory === 'settings') {
      for (const setting of SETTINGS_ITEMS) {
        const searchText = `${setting.label} ${setting.keywords.join(' ')}`
        const { match, score } = fuzzyMatch(q, searchText)
        if (!q || match) {
          results.push({
            id: `setting-${setting.id}`,
            type: 'settings',
            title: setting.label,
            subtitle: `Go to ${setting.section} settings`,
            icon: Settings,
            iconColor: 'text-ink-muted',
            data: { setting, score },
            action: () => {
              onOpenSettings?.()
              saveRecentSearch(setting.label)
              onClose()
            }
          })
        }
      }
    }

    // Sort by score (if query exists) and limit results
    if (q) {
      results.sort((a, b) => {
        const scoreA = (a.data as { score?: number })?.score || 0
        const scoreB = (b.data as { score?: number })?.score || 0
        return scoreB - scoreA
      })
    }

    return results.slice(0, 50)
  }, [query, selectedCategory, files, conversations, skills, agents, cwd, onSelectFile, onResumeConversation, onNavigate, onCommand, onOpenSettings, onClose])

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<SearchCategory, SearchResult[]> = {
      files: [],
      conversations: [],
      skills: [],
      commands: [],
      settings: []
    }

    for (const result of searchResults) {
      groups[result.type].push(result)
    }

    return Object.entries(groups)
      .filter(([_, items]) => items.length > 0)
      .map(([category, items]) => ({
        category: category as SearchCategory,
        items
      }))
  }, [searchResults])

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    return groupedResults.flatMap(g => g.items)
  }, [groupedResults])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, selectedCategory])

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current && flatResults.length > 0) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, flatResults.length])

  // Update preview when selection changes
  useEffect(() => {
    if (showPreview && flatResults[selectedIndex]) {
      setPreviewItem(flatResults[selectedIndex])
    }
  }, [selectedIndex, showPreview, flatResults])

  const saveRecentSearch = useCallback((term: string) => {
    const newRecent = [term, ...recentSearches.filter(s => s !== term)].slice(0, MAX_RECENT_SEARCHES)
    setRecentSearches(newRecent)
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecent))
    } catch { /* ignore */ }
  }, [recentSearches])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % Math.max(1, flatResults.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + Math.max(1, flatResults.length)) % Math.max(1, flatResults.length))
        break
      case 'Enter':
        e.preventDefault()
        if (flatResults[selectedIndex]) {
          flatResults[selectedIndex].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        if (showPreview) {
          setShowPreview(false)
        } else {
          onClose()
        }
        break
      case 'Tab':
        e.preventDefault()
        // Cycle through categories
        const categories: (SearchCategory | 'all')[] = ['all', 'files', 'conversations', 'skills', 'commands', 'settings']
        const currentIdx = categories.indexOf(selectedCategory)
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + categories.length) % categories.length
          : (currentIdx + 1) % categories.length
        setSelectedCategory(categories[nextIdx])
        break
      case 'ArrowRight':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          setShowPreview(true)
          if (flatResults[selectedIndex]) {
            setPreviewItem(flatResults[selectedIndex])
          }
        }
        break
      case 'ArrowLeft':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          setShowPreview(false)
        }
        break
    }
  }, [flatResults, selectedIndex, selectedCategory, showPreview, onClose])

  if (!isAnimating && !isOpen) return null

  let itemIndex = -1

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Search Modal */}
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global Search"
        className={`fixed left-1/2 top-[10%] z-50 w-full max-w-[720px] -translate-x-1/2 transition-all duration-200 ease-out ${
          isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'
        }`}
      >
        <div
          className="overflow-hidden rounded-2xl border border-overlay/[0.08] bg-surface-0/95 backdrop-blur-xl shadow-2xl"
          style={{
            boxShadow: '0 0 0 1px rgba(204, 120, 92, 0.1), 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 100px rgba(204, 120, 92, 0.1)'
          }}
        >
          {/* Search Header */}
          <div className="relative border-b border-overlay/[0.06]">
            <Search
              size={20}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search files, conversations, skills, commands..."
              className="w-full pl-14 pr-32 py-5 bg-transparent text-ink-bright text-base placeholder-ink-subtle focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              role="combobox"
              aria-expanded="true"
              aria-controls="search-results"
              aria-activedescendant={flatResults[selectedIndex] ? `result-${flatResults[selectedIndex].id}` : undefined}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/10 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="hidden sm:flex items-center px-2 py-1 rounded-md bg-overlay/[0.05] text-[10px] text-ink-subtle font-medium">
                ESC
              </kbd>
            </div>

            {/* Accent line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(204, 120, 92, 0.4), transparent)' }}
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-overlay/[0.04] bg-overlay/[0.02]">
            {(['all', 'files', 'conversations', 'skills', 'commands', 'settings'] as const).map((cat) => {
              const config = cat === 'all' ? { label: 'All', icon: Search } : CATEGORY_CONFIG[cat]
              const Icon = config.icon
              const count = cat === 'all' ? searchResults.length : searchResults.filter(r => r.type === cat).length

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-subtle hover:text-ink-bright hover:bg-overlay/5'
                  }`}
                >
                  <Icon size={14} />
                  <span>{config.label}</span>
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      selectedCategory === cat ? 'bg-accent/20' : 'bg-overlay/5'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Content Area */}
          <div className="flex max-h-[500px]">
            {/* Results List */}
            <div
              ref={listRef}
              id="search-results"
              role="listbox"
              className={`overflow-y-auto py-2 ${showPreview ? 'w-1/2 border-r border-overlay/[0.04]' : 'w-full'}`}
            >
              {loading ? (
                <div className="flex items-center justify-center py-12 text-ink-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    <span className="text-sm">Searching...</span>
                  </div>
                </div>
              ) : groupedResults.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  {query ? (
                    <>
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-overlay/[0.03] mb-3">
                        <Search size={20} className="text-ink-faint" />
                      </div>
                      <div className="text-ink-subtle text-sm">No results found</div>
                      <div className="text-ink-faint text-xs mt-1">Try a different search term</div>
                    </>
                  ) : recentSearches.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 px-4 py-2 text-ink-subtle text-xs">
                        <Clock size={12} />
                        <span>Recent Searches</span>
                      </div>
                      <div className="space-y-1">
                        {recentSearches.map((term, i) => (
                          <button
                            key={i}
                            onClick={() => setQuery(term)}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-ink-muted hover:text-ink-bright hover:bg-overlay/[0.03] transition-colors"
                          >
                            <Clock size={14} className="text-ink-faint" />
                            <span>{term}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 mb-3">
                        <Search size={20} className="text-accent/60" />
                      </div>
                      <div className="text-ink-subtle text-sm">Start typing to search</div>
                      <div className="text-ink-faint text-xs mt-1">Search across files, conversations, skills, and more</div>
                    </>
                  )}
                </div>
              ) : (
                groupedResults.map((group) => (
                  <div key={group.category} className="mb-2 last:mb-0">
                    {/* Category Header */}
                    <div className="px-4 py-2 flex items-center gap-2">
                      {(() => {
                        const Icon = CATEGORY_CONFIG[group.category].icon
                        return <Icon size={12} className="text-ink-faint" />
                      })()}
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint font-medium">
                        {CATEGORY_CONFIG[group.category].label}
                      </span>
                      <span className="text-[10px] text-ink-ghost">
                        ({group.items.length})
                      </span>
                    </div>

                    {/* Results */}
                    {group.items.map((result) => {
                      itemIndex++
                      const currentIndex = itemIndex
                      const isSelected = currentIndex === selectedIndex
                      const Icon = result.icon

                      return (
                        <button
                          key={result.id}
                          id={`result-${result.id}`}
                          data-index={currentIndex}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => result.action()}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                            isSelected ? 'bg-accent/10' : 'hover:bg-overlay/[0.02]'
                          }`}
                        >
                          {/* Icon */}
                          <div
                            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
                              isSelected ? 'bg-accent/20' : 'bg-overlay/[0.03]'
                            }`}
                          >
                            <Icon
                              size={18}
                              className={isSelected ? 'text-accent' : result.iconColor || 'text-ink-muted'}
                            />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${
                              isSelected ? 'text-ink-bright' : 'text-ink'
                            }`}>
                              {result.title}
                            </div>
                            {result.subtitle && (
                              <div className="text-xs text-ink-faint truncate mt-0.5">
                                {result.subtitle}
                              </div>
                            )}
                          </div>

                          {/* Quick Actions (on hover/select) */}
                          {isSelected && result.quickActions && (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {result.quickActions.slice(0, 2).map((action) => {
                                const ActionIcon = action.icon
                                return (
                                  <button
                                    key={action.id}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      action.action()
                                    }}
                                    className="p-1.5 rounded-lg text-ink-subtle hover:text-accent hover:bg-accent/10 transition-colors"
                                    title={action.label}
                                  >
                                    <ActionIcon size={14} />
                                  </button>
                                )
                              })}
                            </div>
                          )}

                          {/* Selection indicator */}
                          {isSelected && (
                            <ChevronRight size={16} className="text-accent flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Preview Panel */}
            {showPreview && previewItem && (
              <div className="w-1/2 p-4 overflow-y-auto bg-overlay/[0.01]">
                <PreviewPanel item={previewItem} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-overlay/[0.06] bg-overlay/[0.02]">
            <div className="flex items-center gap-4 text-[10px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-overlay/[0.06] font-medium">Tab</kbd>
                <span>categories</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-overlay/[0.06] font-medium">\u2191\u2193</kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-overlay/[0.06] font-medium">\u21B5</kbd>
                <span>select</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-overlay/[0.06] font-medium">\u2318\u2192</kbd>
                <span>preview</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Command size={12} className="text-accent" />
              <span className="text-[10px] text-ink-faint">Global Search</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Preview Panel Component
function PreviewPanel({ item }: { item: SearchResult }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (item.type === 'files' && item.path) {
      loadFilePreview(item.path)
    } else if (item.type === 'conversations') {
      const conv = (item.data as { conversation: Conversation })?.conversation
      if (conv) {
        loadConversationPreview(conv)
      }
    } else {
      setContent(null)
    }
  }, [item])

  const loadFilePreview = async (path: string) => {
    setLoading(true)
    try {
      const text = await window.api?.readFile(path)
      setContent(text?.slice(0, 2000) || null)
    } catch {
      setContent(null)
    }
    setLoading(false)
  }

  const loadConversationPreview = async (conv: Conversation) => {
    setLoading(true)
    try {
      const messages = await window.api?.getConversationMessages(conv.id, conv.projectFolder, 5)
      if (messages && messages.length > 0) {
        setContent(messages.map(m => `[${m.type}]: ${m.content.slice(0, 200)}`).join('\n\n'))
      } else {
        setContent(conv.preview || null)
      }
    } catch {
      setContent(conv.preview || null)
    }
    setLoading(false)
  }

  const Icon = item.icon

  return (
    <div className="h-full flex flex-col">
      {/* Preview Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-overlay/[0.04] mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10">
          <Icon size={20} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-bright truncate">{item.title}</div>
          {item.subtitle && (
            <div className="text-xs text-ink-subtle truncate">{item.subtitle}</div>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : content ? (
          <pre className="text-xs text-ink-muted font-mono whitespace-pre-wrap break-words">
            {content}
          </pre>
        ) : (
          <div className="text-center py-8">
            <div className="text-sm text-ink-subtle">No preview available</div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {item.quickActions && item.quickActions.length > 0 && (
        <div className="pt-4 border-t border-overlay/[0.04] mt-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">Actions</div>
          <div className="flex flex-wrap gap-2">
            {item.quickActions.map((action) => {
              const ActionIcon = action.icon
              return (
                <button
                  key={action.id}
                  onClick={action.action}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-overlay/[0.03] text-xs text-ink-muted hover:text-ink-bright hover:bg-overlay/[0.06] transition-colors"
                >
                  <ActionIcon size={12} />
                  <span>{action.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Hook for Cmd+K/Cmd+P keyboard shortcut
export function useGlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  }
}

// Utility functions
function getRelativePath(fullPath: string, cwd: string): string {
  if (fullPath.startsWith(cwd)) {
    const relative = fullPath.slice(cwd.length)
    return relative.startsWith('/') ? relative.slice(1) : relative
  }
  return fullPath
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
