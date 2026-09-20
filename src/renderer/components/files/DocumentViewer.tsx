import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  ZoomIn,
  ZoomOut,
  Download,
  Copy,
  Maximize,
  Minimize,
  RotateCw,
  FileText,
  Image as ImageIcon,
  Code,
  Table,
  FileType,
  Check,
  Loader2
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

interface DocumentViewerProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  fileName: string
}

type FileType = 'image' | 'pdf' | 'markdown' | 'code' | 'csv' | 'text' | 'unknown'

// File extension mappings
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
const CODE_EXTENSIONS = [
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'swift', 'kt', 'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1',
  'sql', 'graphql', 'yaml', 'yml', 'toml', 'ini', 'conf', 'json', 'xml', 'html', 'css', 'scss', 'sass', 'less'
]
const MARKDOWN_EXTENSIONS = ['md', 'mdx', 'markdown']
const CSV_EXTENSIONS = ['csv', 'tsv']
const TEXT_EXTENSIONS = ['txt', 'log', 'env', 'gitignore', 'dockerignore', 'editorconfig']

// Language mapping for syntax highlighting
const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
  swift: 'swift', kt: 'kotlin', scala: 'scala', sh: 'bash', bash: 'bash',
  zsh: 'bash', fish: 'bash', ps1: 'powershell', sql: 'sql', graphql: 'graphql',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', json: 'json', xml: 'xml',
  html: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  md: 'markdown', mdx: 'markdown'
}

// Syntax highlighting color scheme (dark theme)
const TOKEN_COLORS: Record<string, string> = {
  keyword: '#cc785c',
  string: '#98c379',
  number: '#d19a66',
  comment: '#5c6370',
  function: '#61afef',
  class: '#e5c07b',
  operator: '#56b6c2',
  punctuation: '#abb2bf',
  variable: '#e06c75',
  property: '#d19a66',
  tag: '#e06c75',
  attribute: '#d19a66',
  default: '#abb2bf'
}

function getFileType(fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown'
  if (CODE_EXTENSIONS.includes(ext)) return 'code'
  if (CSV_EXTENSIONS.includes(ext)) return 'csv'
  if (TEXT_EXTENSIONS.includes(ext)) return 'text'

  return 'unknown'
}

function getFileIcon(type: FileType) {
  switch (type) {
    case 'image': return ImageIcon
    case 'pdf': return FileType
    case 'markdown': return FileText
    case 'code': return Code
    case 'csv': return Table
    case 'text': return FileText
    default: return FileText
  }
}

// Simple syntax highlighter
function highlightCode(code: string, language: string): string {
  const patterns: { regex: RegExp; type: string }[] = [
    // Comments
    { regex: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, type: 'comment' },
    // Strings
    { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, type: 'string' },
    // Numbers
    { regex: /\b(\d+\.?\d*)\b/g, type: 'number' },
    // Keywords
    { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|static|get|set|typeof|instanceof|in|of|true|false|null|undefined|void|def|self|lambda|yield|raise|except|with|as|pass|elif|end|begin|module|require|include|puts|print|println|fn|pub|mut|impl|trait|struct|enum|match|loop|move|ref|use|mod|crate|where|type|interface|namespace|public|private|protected|abstract|final|override|virtual|sealed|readonly|volatile|synchronized|native|transient|package)\b/g, type: 'keyword' },
    // Functions
    { regex: /\b([a-zA-Z_]\w*)\s*(?=\()/g, type: 'function' },
    // Operators
    { regex: /([+\-*/%=<>!&|^~?:]+)/g, type: 'operator' },
    // Punctuation
    { regex: /([{}[\]();,.])/g, type: 'punctuation' },
  ]

  let highlighted = code
  const tokens: { start: number; end: number; type: string; text: string }[] = []

  // Find all tokens
  patterns.forEach(({ regex, type }) => {
    let match
    const re = new RegExp(regex.source, regex.flags)
    while ((match = re.exec(code)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        text: match[0]
      })
    }
  })

  // Sort by position and filter overlaps
  tokens.sort((a, b) => a.start - b.start)
  const filtered: typeof tokens = []
  let lastEnd = 0
  tokens.forEach(token => {
    if (token.start >= lastEnd) {
      filtered.push(token)
      lastEnd = token.end
    }
  })

  // Build highlighted string
  let result = ''
  let pos = 0
  filtered.forEach(token => {
    if (token.start > pos) {
      result += escapeHtml(code.slice(pos, token.start))
    }
    const color = TOKEN_COLORS[token.type] || TOKEN_COLORS.default
    result += `<span style="color: ${color}">${escapeHtml(token.text)}</span>`
    pos = token.end
  })
  if (pos < code.length) {
    result += escapeHtml(code.slice(pos))
  }

  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Markdown renderer
function renderMarkdown(text: string): string {
  let html = escapeHtml(text)

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(code.trim(), lang || 'text')
    return `<pre class="code-block"><code>${highlighted}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>')

  // Lists
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr />')

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`
  html = html.replace(/<p><\/p>/g, '')

  return html
}

// CSV Parser
function parseCSV(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = []
  const lines = text.split('\n')

  for (const line of lines) {
    if (line.trim()) {
      const cells: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === delimiter && !inQuotes) {
          cells.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      cells.push(current.trim())
      rows.push(cells)
    }
  }

  return rows
}

export default function DocumentViewer({ isOpen, onClose, filePath, fileName }: DocumentViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageRotation, setImageRotation] = useState(0)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [currentPdfPage, setCurrentPdfPage] = useState(1)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const fileType = getFileType(fileName)
  const FileIcon = getFileIcon(fileType)
  const extension = fileName.split('.').pop()?.toLowerCase() || ''

  // Load file content
  useEffect(() => {
    if (!isOpen || !filePath) return

    setLoading(true)
    setError(null)
    setZoom(100)
    setImageRotation(0)
    setPdfPages([])
    setCurrentPdfPage(1)

    const loadFile = async () => {
      try {
        if (fileType === 'image') {
          // For images, we'll use the file path directly
          setContent(filePath)
          setLoading(false)
        } else if (fileType === 'pdf') {
          await loadPDF(filePath)
        } else {
          // For text-based files, read the content
          try {
            const result = await window.api.readFile(filePath)
            setContent(result || '')
          } catch (readErr) {
            setError(`Failed to read file: ${readErr}`)
          }
          setLoading(false)
        }
      } catch (err) {
        setError(`Failed to load file: ${err}`)
        setLoading(false)
      }
    }

    loadFile()
  }, [isOpen, filePath, fileType])

  // Load PDF
  const loadPDF = async (path: string) => {
    try {
      const loadingTask = pdfjsLib.getDocument(`local-file://${path}`)
      const pdf = await loadingTask.promise
      const pages: string[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const scale = 1.5
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.height = viewport.height
        canvas.width = viewport.width

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise

        pages.push(canvas.toDataURL())
      }

      setPdfPages(pages)
      setLoading(false)
    } catch (err) {
      setError(`Failed to load PDF: ${err}`)
      setLoading(false)
    }
  }

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 300))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(100)
  }, [])

  // Rotate image
  const handleRotate = useCallback(() => {
    setImageRotation(prev => (prev + 90) % 360)
  }, [])

  // Copy content
  const handleCopy = useCallback(async () => {
    if (fileType === 'image' || fileType === 'pdf') return

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content, fileType])

  // Download file / Show in Finder
  const handleDownload = useCallback(async () => {
    try {
      await window.api.showInFinder(filePath)
    } catch (err) {
      console.error('Failed to open file location:', err)
    }
  }, [filePath])

  // Toggle fullscreen
  const handleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          onClose()
        }
      } else if (e.key === '+' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleZoomReset()
      } else if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        // Allow default copy behavior
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isFullscreen, onClose, handleZoomIn, handleZoomOut, handleZoomReset])

  if (!isOpen) return null

  // Render content based on file type
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 size={32} className="text-accent animate-spin" />
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="p-4 rounded-2xl bg-red-500/10 mb-4">
            <FileText size={32} className="text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-ink-bright mb-2">Failed to load file</h3>
          <p className="text-sm text-ink-subtle max-w-md">{error}</p>
        </div>
      )
    }

    switch (fileType) {
      case 'image':
        return (
          <div className="flex items-center justify-center h-full p-8 overflow-auto">
            <img
              src={`local-file://${content}`}
              alt={fileName}
              style={{
                transform: `scale(${zoom / 100}) rotate(${imageRotation}deg)`,
                transition: 'transform 0.2s ease-out',
                maxWidth: zoom === 100 ? '100%' : 'none',
                maxHeight: zoom === 100 ? '100%' : 'none'
              }}
              className="object-contain"
              draggable={false}
            />
          </div>
        )

      case 'pdf':
        return (
          <div className="h-full overflow-auto p-8">
            <div className="flex flex-col items-center gap-8">
              {pdfPages.map((page, index) => (
                <div
                  key={index}
                  className="relative"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s ease-out'
                  }}
                >
                  <img
                    src={page}
                    alt={`Page ${index + 1}`}
                    className="shadow-lg rounded-lg"
                    draggable={false}
                  />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-xs text-ink-bright">
                    Page {index + 1} of {pdfPages.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'markdown':
        return (
          <div
            className="h-full overflow-auto p-8"
            style={{ fontSize: `${zoom}%` }}
          >
            <div
              className="markdown-content prose prose-invert max-w-4xl mx-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          </div>
        )

      case 'code':
        const language = LANGUAGE_MAP[extension] || 'text'
        return (
          <div
            className="h-full overflow-auto"
            style={{ fontSize: `${zoom}%` }}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4 text-xs text-ink-subtle">
                <Code size={14} />
                <span>{language.toUpperCase()}</span>
                <span className="text-ink-faint">|</span>
                <span>{content.split('\n').length} lines</span>
              </div>
              <pre className="font-mono text-sm leading-relaxed">
                <code dangerouslySetInnerHTML={{ __html: highlightCode(content, language) }} />
              </pre>
            </div>
          </div>
        )

      case 'csv':
        const delimiter = extension === 'tsv' ? '\t' : ','
        const data = parseCSV(content, delimiter)
        const headers = data[0] || []
        const rows = data.slice(1)

        return (
          <div
            className="h-full overflow-auto"
            style={{ fontSize: `${zoom}%` }}
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4 text-xs text-ink-subtle">
                <Table size={14} />
                <span>{rows.length} rows</span>
                <span className="text-ink-faint">|</span>
                <span>{headers.length} columns</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-overlay/[0.06]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-overlay/[0.04]">
                      {headers.map((header, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-left font-medium text-ink-bright border-b border-overlay/[0.06]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-overlay/[0.02] transition-colors"
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="px-4 py-3 text-ink border-b border-overlay/[0.04]"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case 'text':
      default:
        return (
          <div
            className="h-full overflow-auto p-6"
            style={{ fontSize: `${zoom}%` }}
          >
            <pre className="font-mono text-sm text-ink whitespace-pre-wrap leading-relaxed">
              {content}
            </pre>
          </div>
        )
    }
  }

  const showZoomControls = fileType === 'image' || fileType === 'pdf' || fileType === 'markdown' || fileType === 'code' || fileType === 'csv' || fileType === 'text'
  const showCopyButton = fileType !== 'image' && fileType !== 'pdf'
  const showRotateButton = fileType === 'image'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity ${
          isFullscreen ? 'opacity-100' : 'opacity-100'
        }`}
        onClick={onClose}
      />

      {/* Viewer Panel */}
      <div
        className={`fixed z-50 flex flex-col bg-surface-1 border border-overlay/[0.06] shadow-2xl transition-all duration-300 ${
          isFullscreen
            ? 'inset-0 rounded-none'
            : 'inset-y-4 right-4 left-[320px] rounded-2xl'
        }`}
        ref={containerRef}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-overlay/[0.06] bg-surface-1/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-accent/10">
              <FileIcon size={18} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-ink-bright truncate">{fileName}</h2>
              <p className="text-xs text-ink-subtle truncate">{filePath}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Zoom controls */}
            {showZoomControls && (
              <div className="flex items-center gap-1 mr-2 px-2 py-1 rounded-lg bg-overlay/[0.04]">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 25}
                  className="p-1.5 rounded text-ink-muted hover:text-ink-bright hover:bg-overlay/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="px-2 py-1 text-xs font-medium text-ink-muted hover:text-ink-bright transition-colors min-w-[48px]"
                  title="Reset zoom"
                >
                  {zoom}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 300}
                  className="p-1.5 rounded text-ink-muted hover:text-ink-bright hover:bg-overlay/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            )}

            {/* Rotate button (images only) */}
            {showRotateButton && (
              <button
                onClick={handleRotate}
                className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/5 transition-colors"
                title="Rotate"
              >
                <RotateCw size={18} />
              </button>
            )}

            {/* Copy button */}
            {showCopyButton && (
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/5 transition-colors"
                title="Copy content"
              >
                {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
              </button>
            )}

            {/* Download/reveal button */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/5 transition-colors"
              title="Show in Finder"
            >
              <Download size={18} />
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={handleFullscreen}
              className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/5 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/5 transition-colors ml-1"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-surface-0">
          {renderContent()}
        </div>

        {/* Footer with file info */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-overlay/[0.06] bg-surface-1/95 text-xs text-ink-subtle">
          <div className="flex items-center gap-4">
            <span className="uppercase">{extension}</span>
            {fileType === 'pdf' && pdfPages.length > 0 && (
              <span>{pdfPages.length} pages</span>
            )}
            {(fileType === 'code' || fileType === 'text' || fileType === 'markdown') && content && (
              <>
                <span>{content.split('\n').length} lines</span>
                <span>{content.length.toLocaleString()} characters</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-overlay/10 text-[10px]">Esc</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>

      {/* Styles for markdown content */}
      <style>{`
        .markdown-content h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; color: #fff; }
        .markdown-content h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; color: #fff; }
        .markdown-content h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; color: #fff; }
        .markdown-content h4 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.5em; color: #fff; }
        .markdown-content h5, .markdown-content h6 { font-size: 1em; font-weight: 600; margin: 1em 0 0.5em; color: #fff; }
        .markdown-content p { margin: 0.75em 0; color: #abb2bf; line-height: 1.7; }
        .markdown-content ul, .markdown-content ol { margin: 0.75em 0; padding-left: 1.5em; color: #abb2bf; }
        .markdown-content li { margin: 0.25em 0; }
        .markdown-content blockquote {
          margin: 1em 0;
          padding: 0.5em 1em;
          border-left: 3px solid #cc785c;
          background: rgba(204, 120, 92, 0.1);
          color: #999;
        }
        .markdown-content hr {
          margin: 2em 0;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .markdown-content .code-block {
          background: #1a1a1a;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 1em;
          margin: 1em 0;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9em;
          line-height: 1.5;
        }
        .markdown-content .inline-code {
          background: rgba(255, 255, 255, 0.08);
          padding: 0.2em 0.4em;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9em;
          color: #cc785c;
        }
        .markdown-content .md-link {
          color: #cc785c;
          text-decoration: none;
        }
        .markdown-content .md-link:hover {
          text-decoration: underline;
        }
        .markdown-content strong { color: #fff; font-weight: 600; }
        .markdown-content em { font-style: italic; }
      `}</style>
    </>
  )
}
