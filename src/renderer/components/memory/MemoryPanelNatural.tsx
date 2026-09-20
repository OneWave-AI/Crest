import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Brain,
  X,
  Sparkles,
  Send,
  Lightbulb,
  Heart,
  Code2,
  FolderHeart,
  Globe,
  Lock,
  Trash2,
  Edit3,
  Check,
  RefreshCw,
  MessageSquare,
  Zap,
  Coffee,
  GitBranch,
  TestTube,
  Palette,
  FileCode,
  Settings,
  Star,
  ChevronRight,
  Plus
} from 'lucide-react'
import type { MemoryListResult, MemoryStats, MemoryCategory, MemoryCheckResult } from '../../../shared/types'

interface MemoryPanelNaturalProps {
  projectPath: string
  isOpen: boolean
  onClose: () => void
}

type Scope = 'project' | 'private' | 'global'

// Map internal categories to user-friendly concepts
const categoryFromInput = (input: string): MemoryCategory => {
  const lower = input.toLowerCase()
  if (lower.includes('style') || lower.includes('format') || lower.includes('naming') || lower.includes('convention')) {
    return 'conventions'
  }
  if (lower.includes('prefer') || lower.includes('like') || lower.includes('want') || lower.includes('always') || lower.includes('never')) {
    return 'preferences'
  }
  if (lower.includes('architecture') || lower.includes('structure') || lower.includes('pattern') || lower.includes('folder')) {
    return 'architecture'
  }
  if (lower.includes('command') || lower.includes('run') || lower.includes('build') || lower.includes('test') || lower.includes('deploy')) {
    return 'commands'
  }
  if (lower.includes('decided') || lower.includes('chose') || lower.includes('decision') || lower.includes('why we')) {
    return 'decisions'
  }
  return 'context'
}

// Quick suggestion chips
const quickSuggestions = [
  { icon: Code2, label: 'Coding style', prompt: 'I prefer ' },
  { icon: GitBranch, label: 'Git workflow', prompt: 'For commits, ' },
  { icon: TestTube, label: 'Testing', prompt: 'When writing tests, ' },
  { icon: Palette, label: 'UI/Design', prompt: 'For UI components, ' },
  { icon: FileCode, label: 'File structure', prompt: 'Files should be organized ' },
  { icon: Settings, label: 'Project config', prompt: 'This project uses ' },
]

// Example prompts to inspire users
const examplePrompts = [
  "I prefer functional components over class components",
  "Always use TypeScript strict mode",
  "Run tests with: npm test",
  "We use Tailwind CSS for styling",
  "Keep functions under 50 lines",
  "Use descriptive variable names",
  "This is a Next.js 14 app with App Router",
  "Don't add comments unless complex logic"
]

// Memory item display component
function MemoryCard({
  content,
  category,
  onDelete,
  onEdit
}: {
  content: string
  category: MemoryCategory
  onDelete: () => void
  onEdit: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)

  const categoryStyles: Record<MemoryCategory, { bg: string; icon: typeof Brain; color: string }> = {
    context: { bg: 'bg-blue-500/10', icon: Lightbulb, color: 'text-blue-400' },
    architecture: { bg: 'bg-sand-500/10', icon: FolderHeart, color: 'text-sand-400' },
    conventions: { bg: 'bg-green-500/10', icon: Code2, color: 'text-green-400' },
    commands: { bg: 'bg-orange-500/10', icon: Zap, color: 'text-orange-400' },
    preferences: { bg: 'bg-pink-500/10', icon: Heart, color: 'text-pink-400' },
    decisions: { bg: 'bg-amber-500/10', icon: Star, color: 'text-amber-400' }
  }

  const style = categoryStyles[category]
  const Icon = style.icon

  return (
    <div
      className={`group relative p-4 rounded-xl ${style.bg} border border-white/[0.04] transition-all duration-200 hover:border-white/[0.08] hover:scale-[1.01]`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-black/20 ${style.color}`}>
          <Icon size={16} />
        </div>
        <p className="flex-1 text-sm text-gray-200 leading-relaxed">{content}</p>
      </div>

      {/* Hover actions */}
      <div className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg bg-black/40 text-gray-400 hover:text-white hover:bg-black/60 transition-colors"
          title="Edit"
        >
          <Edit3 size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg bg-black/40 text-gray-400 hover:text-red-400 hover:bg-black/60 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

export default function MemoryPanelNatural({ projectPath, isOpen, onClose }: MemoryPanelNaturalProps) {
  const [scope, setScope] = useState<Scope>('project')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memoryData, setMemoryData] = useState<MemoryListResult | null>(null)
  const [fileStatus, setFileStatus] = useState<MemoryCheckResult | null>(null)
  const [editingItem, setEditingItem] = useState<{ content: string; index: number } | null>(null)
  const [showExamples, setShowExamples] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load all memory data
  const loadData = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    try {
      const [data, status] = await Promise.all([
        window.api.memoryList(projectPath),
        window.api.memoryCheck(projectPath)
      ])
      setMemoryData(data)
      setFileStatus(status)
    } catch (err) {
      console.error('Failed to load memory:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (isOpen) {
      loadData()
      // Focus input after opening
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, loadData])

  // Get current memories for display
  const getCurrentMemories = () => {
    if (!memoryData) return []
    const sections = scope === 'project' ? memoryData.main
      : scope === 'private' ? memoryData.local
      : memoryData.user

    // Flatten all sections into individual memory items
    return sections.flatMap(section =>
      section.items.map(item => ({
        content: item,
        category: section.category
      }))
    )
  }

  // Check if current scope has any content
  const hasContent = () => {
    switch (scope) {
      case 'project': return fileStatus?.hasMain
      case 'private': return fileStatus?.hasLocal
      case 'global': return fileStatus?.hasUser
      default: return false
    }
  }

  // Add new memory
  const handleAdd = async () => {
    if (!input.trim()) return
    setSaving(true)

    try {
      const category = categoryFromInput(input)
      const target = scope === 'project' ? 'main' : scope === 'private' ? 'local' : 'user'

      // Initialize file if needed
      if (!hasContent() && scope === 'project') {
        await window.api.memoryInit(projectPath)
      }

      await window.api.memoryAdd(projectPath, {
        category,
        content: input.trim(),
        target
      })

      setInput('')
      setEditingItem(null)
      loadData()
    } catch (err) {
      console.error('Failed to add memory:', err)
    } finally {
      setSaving(false)
    }
  }

  // Handle quick suggestion click
  const handleSuggestion = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  // Handle example click
  const handleExample = (example: string) => {
    setInput(example)
    setShowExamples(false)
    inputRef.current?.focus()
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleAdd()
    }
  }

  // Delete memory (by editing raw and removing the line)
  const handleDelete = async (content: string) => {
    if (!confirm('Remove this memory?')) return

    try {
      const typeMap = { project: 'main', private: 'local', global: 'user' } as const
      const type = typeMap[scope]
      const rawContent = await window.api.memoryGetRaw(projectPath, type)

      // Remove the line containing this content
      const lines = rawContent.split('\n')
      const filtered = lines.filter(line => !line.includes(content))

      await window.api.memorySaveRaw(projectPath, type, filtered.join('\n'))
      loadData()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  // Start editing a memory
  const handleEdit = (content: string, index: number) => {
    setEditingItem({ content, index })
    setInput(content)
    inputRef.current?.focus()
  }

  if (!isOpen) return null

  const memories = getCurrentMemories()
  const scopeInfo = {
    project: {
      icon: FolderHeart,
      label: 'This Project',
      desc: 'Shared with your team via CLAUDE.md',
      color: 'text-sand-400',
      bg: 'bg-sand-500/20'
    },
    private: {
      icon: Lock,
      label: 'Just for Me',
      desc: 'Private notes, not committed to git',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20'
    },
    global: {
      icon: Globe,
      label: 'All Projects',
      desc: 'Your preferences across everything',
      color: 'text-green-400',
      bg: 'bg-green-500/20'
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-b from-[#1a1a1d] to-[#141416] rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-white/[0.08] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-sand-500/30 to-pink-500/30 rounded-xl">
                <Brain size={22} className="text-sand-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Claude's Memory</h2>
                <p className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-sand-400" />
                  Teach Claude about your preferences
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/[0.06] rounded-xl text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scope selector - pill buttons */}
          <div className="flex gap-2">
            {(Object.keys(scopeInfo) as Scope[]).map((s) => {
              const info = scopeInfo[s]
              const Icon = info.icon
              const isActive = scope === s
              return (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? `${info.bg} ${info.color} ring-1 ring-white/10`
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={14} />
                  {info.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-600 mt-2 ml-1">{scopeInfo[scope].desc}</p>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Input area */}
          <div className="p-6 border-b border-white/[0.04]">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={editingItem ? "Update this memory..." : "Tell Claude something to remember..."}
                className="w-full h-24 bg-black/30 border border-white/[0.08] rounded-2xl px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-sand-500/50 focus:ring-2 focus:ring-sand-500/20 transition-all"
              />
              <button
                onClick={handleAdd}
                disabled={!input.trim() || saving}
                className={`absolute bottom-3 right-3 p-2.5 rounded-xl transition-all ${
                  input.trim()
                    ? 'bg-sand-500 text-white hover:bg-sand-600 shadow-lg shadow-sand-500/25'
                    : 'bg-white/[0.06] text-gray-500'
                }`}
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>

            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-2 mt-3">
              {quickSuggestions.map((suggestion, i) => {
                const Icon = suggestion.icon
                return (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(suggestion.prompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white rounded-full text-xs transition-colors"
                  >
                    <Icon size={12} />
                    {suggestion.label}
                  </button>
                )
              })}
              <button
                onClick={() => setShowExamples(!showExamples)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                  showExamples
                    ? 'bg-sand-500/20 text-sand-400'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white'
                }`}
              >
                <MessageSquare size={12} />
                Examples
              </button>
            </div>

            {/* Example prompts dropdown */}
            {showExamples && (
              <div className="mt-3 p-3 bg-sand-500/10 rounded-xl border border-sand-500/20">
                <p className="text-xs text-sand-300 mb-2 font-medium">Try saying something like:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => handleExample(example)}
                      className="px-2.5 py-1 bg-black/30 hover:bg-black/50 text-gray-300 hover:text-white rounded-lg text-xs transition-colors text-left"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {editingItem && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                <Edit3 size={12} />
                <span>Editing memory - press ⌘+Enter to update</span>
                <button
                  onClick={() => { setEditingItem(null); setInput('') }}
                  className="ml-auto text-gray-500 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Memory list */}
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <RefreshCw size={24} className="animate-spin mb-3 text-sand-400" />
                <p className="text-sm">Loading memories...</p>
              </div>
            ) : memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 bg-sand-500/10 rounded-2xl mb-4">
                  <Coffee size={32} className="text-sand-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No memories yet</h3>
                <p className="text-sm text-gray-500 max-w-sm mb-4">
                  {scope === 'project' && "Tell Claude about this project - your tech stack, coding style, or anything it should know."}
                  {scope === 'private' && "Add personal notes that stay on your machine - shortcuts, local setup, or things just for you."}
                  {scope === 'global' && "Set preferences that apply everywhere - your favorite frameworks, coding philosophies, or pet peeves."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {examplePrompts.slice(0, 3).map((example, i) => (
                    <button
                      key={i}
                      onClick={() => handleExample(example)}
                      className="px-3 py-1.5 bg-sand-500/20 text-sand-300 hover:bg-sand-500/30 rounded-lg text-xs transition-colors"
                    >
                      + {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-400">
                    {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
                  </h3>
                  <button
                    onClick={loadData}
                    className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw size={10} />
                    Refresh
                  </button>
                </div>
                {memories.map((memory, i) => (
                  <MemoryCard
                    key={`${memory.category}-${i}`}
                    content={memory.content}
                    category={memory.category}
                    onDelete={() => handleDelete(memory.content)}
                    onEdit={() => handleEdit(memory.content, i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-white/[0.04] bg-black/20">
          <p className="text-xs text-gray-600 text-center">
            <span className="text-gray-500">⌘+Enter</span> to save • Claude reads these at the start of each session
          </p>
        </div>
      </div>
    </div>
  )
}
