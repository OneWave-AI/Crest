import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Save, FileText, Eye, Code, Loader2 } from 'lucide-react'

interface SkillEditorProps {
  isOpen: boolean
  onClose: () => void
  itemPath: string
  itemName: string
  itemType: 'skill' | 'agent'
  onSave: () => void
}

// Simple markdown syntax highlighting
function highlightMarkdown(content: string): string {
  let html = content
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Frontmatter block
  html = html.replace(
    /^(---\n)([\s\S]*?)(\n---)/m,
    '<span class="text-[#cc785c]/60">$1</span><span class="text-[#cc785c]">$2</span><span class="text-[#cc785c]/60">$3</span>'
  )

  // Headers
  html = html.replace(/^(#{1,6})\s(.+)$/gm, '<span class="text-[#cc785c] font-bold">$1 $2</span>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<span class="text-white font-bold">**$1**</span>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<span class="text-gray-300 italic">*$1*</span>')

  // Code blocks (triple backticks)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<span class="text-sand-400">```$1</span>\n<span class="text-emerald-400">$2</span><span class="text-sand-400">```</span>'
  )

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<span class="text-emerald-400 bg-emerald-500/10 px-1 rounded">`$1`</span>')

  // Lists
  html = html.replace(/^(\s*[-*+])\s/gm, '<span class="text-[#cc785c]">$1 </span>')
  html = html.replace(/^(\s*\d+\.)\s/gm, '<span class="text-[#cc785c]">$1 </span>')

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<span class="text-blue-400">[<span class="underline">$1</span>](<span class="text-blue-300/70">$2</span>)</span>'
  )

  // Blockquotes
  html = html.replace(/^(&gt;)\s(.+)$/gm, '<span class="text-gray-500 italic border-l-2 border-gray-600 pl-2">$1 $2</span>')

  return html
}

// Simple markdown to HTML for preview
function markdownToHtml(content: string): string {
  let html = content
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Remove frontmatter
  html = html.replace(/^---\n[\s\S]*?\n---\n?/, '')

  // Headers
  html = html.replace(/^######\s(.+)$/gm, '<h6 class="text-sm font-semibold text-white mt-4 mb-2">$1</h6>')
  html = html.replace(/^#####\s(.+)$/gm, '<h5 class="text-sm font-semibold text-white mt-4 mb-2">$1</h5>')
  html = html.replace(/^####\s(.+)$/gm, '<h4 class="text-base font-semibold text-white mt-4 mb-2">$1</h4>')
  html = html.replace(/^###\s(.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
  html = html.replace(/^##\s(.+)$/gm, '<h2 class="text-xl font-semibold text-white mt-5 mb-3">$1</h2>')
  html = html.replace(/^#\s(.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')

  // Code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-black/40 border border-white/10 rounded-lg p-4 my-3 overflow-x-auto"><code class="text-emerald-400 text-sm font-mono">$2</code></pre>'
  )

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-white/10 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#cc785c] hover:underline">$1</a>')

  // Lists (unordered)
  html = html.replace(/^\s*[-*+]\s(.+)$/gm, '<li class="text-gray-300 ml-4">$1</li>')

  // Lists (ordered)
  html = html.replace(/^\s*\d+\.\s(.+)$/gm, '<li class="text-gray-300 ml-4 list-decimal">$1</li>')

  // Blockquotes
  html = html.replace(/^&gt;\s(.+)$/gm, '<blockquote class="border-l-2 border-[#cc785c] pl-4 text-gray-400 italic my-2">$1</blockquote>')

  // Paragraphs (simple approach)
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<')) return p
    if (p.trim() === '') return ''
    return `<p class="text-gray-300 mb-3">${p}</p>`
  }).join('\n')

  // Line breaks within paragraphs
  html = html.replace(/([^>\n])\n([^<\n])/g, '$1<br/>$2')

  return html
}

export default function SkillEditor({
  isOpen,
  onClose,
  itemPath,
  itemName,
  itemType,
  onSave
}: SkillEditorProps) {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [hasChanges, setHasChanges] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && itemPath) {
      loadContent()
    }
  }, [isOpen, itemPath])

  useEffect(() => {
    setHasChanges(content !== originalContent)
  }, [content, originalContent])

  const loadContent = async () => {
    setLoading(true)
    try {
      const data = await window.api.readSkillContent(itemPath)
      setContent(data)
      setOriginalContent(data)
    } catch (err) {
      console.error('Failed to load content:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.saveSkillContent(itemPath, content)
      setOriginalContent(content)
      setHasChanges(false)
      onSave()
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = useCallback(() => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }, [hasChanges, onClose])

  // Sync scroll between textarea and highlight
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges) handleSave()
      }

      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, hasChanges, handleClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-6xl h-[90vh] bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${itemType === 'skill' ? 'bg-[#cc785c]/10' : 'bg-sand-500/10'}`}>
              <FileText size={18} className={itemType === 'skill' ? 'text-[#cc785c]' : 'text-sand-400'} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Edit {itemType === 'skill' ? 'Skill' : 'Agent'}: {itemName}
              </h2>
              <p className="text-xs text-gray-500 font-mono">{itemPath}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View mode toggle */}
            <div className="flex items-center bg-white/[0.04] rounded-lg p-1">
              <button
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-[#cc785c]/20 text-[#cc785c]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Code size={14} className="inline mr-1.5" />
                Edit
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-[#cc785c]/20 text-[#cc785c]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-[#cc785c]/20 text-[#cc785c]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Eye size={14} className="inline mr-1.5" />
                Preview
              </button>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                hasChanges
                  ? 'bg-[#cc785c] text-white hover:bg-[#d68a6e]'
                  : 'bg-white/[0.04] text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Saving...' : 'Save'}
            </button>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-[#cc785c]" />
            </div>
          ) : (
            <>
              {/* Editor */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className={`relative ${viewMode === 'split' ? 'w-1/2 border-r border-white/[0.06]' : 'w-full'}`}>
                  {/* Syntax highlight layer */}
                  <div
                    ref={highlightRef}
                    className="absolute inset-0 p-4 overflow-auto pointer-events-none font-mono text-sm leading-6 whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: highlightMarkdown(content) }}
                  />
                  {/* Textarea overlay */}
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onScroll={handleScroll}
                    spellCheck={false}
                    className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white font-mono text-sm leading-6 resize-none focus:outline-none"
                    style={{ caretColor: 'white' }}
                  />
                </div>
              )}

              {/* Preview */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-auto`}>
                  <div className="p-6">
                    <div
                      className="prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status bar */}
        <div className="px-6 py-2 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Lines: {content.split('\n').length}</span>
            <span>Characters: {content.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-[#cc785c]">Unsaved changes</span>
            )}
            <span className="text-gray-600">Cmd+S to save</span>
          </div>
        </div>
      </div>
    </div>
  )
}
