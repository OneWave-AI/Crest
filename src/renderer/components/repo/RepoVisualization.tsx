import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderTree,
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  Package,
  FileCode,
  BarChart3,
  Layers,
  RefreshCw,
  X,
  Search,
  ExternalLink,
  FileText,
  Boxes,
  Check,
  AlertCircle
} from 'lucide-react'
import type { RepoAnalysis, RepoFileNode, RepoStats } from '../../../shared/types'

interface RepoVisualizationProps {
  isOpen: boolean
  onClose: () => void
  projectPath: string
}

// Color mapping for file types
const TYPE_COLORS: Record<string, string> = {
  'TypeScript': '#3178c6',
  'TypeScript (React)': '#61dafb',
  'JavaScript': '#f7df1e',
  'JavaScript (React)': '#61dafb',
  'JSON': '#5d5d5d',
  'CSS': '#264de4',
  'SCSS': '#cd6799',
  'HTML': '#e34c26',
  'Markdown': '#083fa1',
  'Python': '#3776ab',
  'Go': '#00add8',
  'Rust': '#dea584',
  'Java': '#b07219',
  'C': '#555555',
  'C++': '#f34b7d',
  'Swift': '#fa7343',
  'Ruby': '#cc342d',
  'PHP': '#4f5d95',
  'SQL': '#e38c00',
  'Shell': '#89e051',
  'YAML': '#cb171e',
  'Vue': '#41b883',
  'Svelte': '#ff3e00',
  'Other': '#6b7280'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

// Tree node component
function TreeNode({
  node,
  depth = 0,
  onSelectFile
}: {
  node: RepoFileNode
  depth?: number
  onSelectFile?: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isDirectory = node.type === 'directory'
  const hasChildren = isDirectory && node.children && node.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-overlay/[0.04] ${
          depth === 0 ? 'font-medium' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            setExpanded(!expanded)
          } else {
            onSelectFile?.(node.path)
          }
        }}
      >
        {isDirectory ? (
          <>
            {hasChildren && (
              expanded ? (
                <ChevronDown size={12} className="text-ink-subtle flex-shrink-0" />
              ) : (
                <ChevronRight size={12} className="text-ink-subtle flex-shrink-0" />
              )
            )}
            {!hasChildren && <div className="w-3" />}
            <Folder size={14} className="text-amber-400 flex-shrink-0" />
          </>
        ) : (
          <>
            <div className="w-3" />
            <File
              size={14}
              className="flex-shrink-0"
              style={{ color: TYPE_COLORS[node.category || 'Other'] }}
            />
          </>
        )}
        <span className={`text-sm truncate ${isDirectory ? 'text-ink-bright' : 'text-ink'}`}>
          {node.name}
        </span>
        {!isDirectory && (
          <span className="text-[10px] text-ink-subtle ml-auto flex-shrink-0">
            {formatBytes(node.size)}
          </span>
        )}
      </div>
      {isDirectory && expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} onSelectFile={onSelectFile} />
          ))}
        </div>
      )}
    </div>
  )
}

// File type bar chart
function TypeBarChart({ stats }: { stats: RepoStats }) {
  const sortedTypes = useMemo(() => {
    return Object.entries(stats.filesByType)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 10)
  }, [stats])

  const maxSize = sortedTypes[0]?.[1].size || 1

  return (
    <div className="space-y-2">
      {sortedTypes.map(([type, data]) => (
        <div key={type} className="flex items-center gap-2">
          <span className="text-xs text-ink-muted w-32 truncate">{type}</span>
          <div className="flex-1 h-5 bg-overlay/[0.03] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(data.size / maxSize) * 100}%`,
                backgroundColor: TYPE_COLORS[type] || TYPE_COLORS.Other
              }}
            />
          </div>
          <span className="text-xs text-ink-subtle w-16 text-right">{data.count} files</span>
          <span className="text-xs text-ink-subtle w-16 text-right">{formatBytes(data.size)}</span>
        </div>
      ))}
    </div>
  )
}

// Treemap visualization
function TreeMap({ stats }: { stats: RepoStats }) {
  const types = useMemo(() => {
    return Object.entries(stats.filesByType)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 12)
  }, [stats])

  const totalSize = types.reduce((sum, [, data]) => sum + data.size, 0)

  return (
    <div className="flex flex-wrap gap-1 h-48">
      {types.map(([type, data]) => {
        const percentage = (data.size / totalSize) * 100
        const minWidth = Math.max(percentage, 8)

        return (
          <div
            key={type}
            className="rounded-lg flex items-center justify-center overflow-hidden transition-all hover:opacity-80 cursor-pointer"
            style={{
              backgroundColor: TYPE_COLORS[type] || TYPE_COLORS.Other,
              width: `${minWidth}%`,
              minWidth: '60px',
              flexGrow: percentage > 20 ? 1 : 0
            }}
            title={`${type}: ${formatBytes(data.size)} (${data.count} files)`}
          >
            <div className="text-center p-2">
              <div className="text-xs font-medium text-overlay/90 truncate">{type}</div>
              <div className="text-[10px] text-overlay/70">{formatBytes(data.size)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function RepoVisualization({ isOpen, onClose, projectPath }: RepoVisualizationProps) {
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tree' | 'stats' | 'deps'>('stats')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)

  const analyze = useCallback(async () => {
    if (!projectPath) return

    setLoading(true)
    setError(null)
    try {
      const result = await window.api.repoAnalyze(projectPath)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (isOpen && projectPath) {
      analyze()
    }
  }, [isOpen, projectPath, analyze])

  const loadFileContent = useCallback(async (filePath: string) => {
    setSelectedFile(filePath)
    try {
      const content = await window.api.repoGetFileContent(filePath)
      setFileContent(content)
    } catch {
      setFileContent('Unable to load file content')
    }
  }, [])

  // Filter dependencies by search
  const filteredDeps = useMemo(() => {
    if (!analysis?.dependencies) return []
    if (!searchQuery) return analysis.dependencies
    const query = searchQuery.toLowerCase()
    return analysis.dependencies.filter(d => d.name.toLowerCase().includes(query))
  }, [analysis?.dependencies, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-4 rounded-lg border border-overlay/[0.06] w-[1000px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-overlay/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <FolderTree className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-ink-bright">Repository Visualization</h2>
              <p className="text-sm text-ink-subtle">{projectPath.split('/').pop()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={analyze}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-overlay/[0.06] text-ink-muted hover:text-ink-bright transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-overlay/[0.06] text-ink-muted hover:text-ink-bright transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-overlay/[0.06]">
          {[
            { id: 'stats', label: 'Overview', icon: BarChart3 },
            { id: 'tree', label: 'File Tree', icon: FolderTree },
            { id: 'deps', label: 'Dependencies', icon: Package }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-ink-subtle hover:text-ink'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
                <p className="text-ink-muted">Analyzing repository...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-3" />
                <p>{error}</p>
              </div>
            </div>
          ) : analysis ? (
            <>
              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <div className="p-6 overflow-y-auto h-full space-y-6">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">{formatNumber(analysis.stats.totalFiles)}</div>
                      <div className="text-sm text-ink-subtle">Files</div>
                    </div>
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">{formatNumber(analysis.stats.totalDirectories)}</div>
                      <div className="text-sm text-ink-subtle">Directories</div>
                    </div>
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">{formatBytes(analysis.stats.totalSize)}</div>
                      <div className="text-sm text-ink-subtle">Total Size</div>
                    </div>
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">{formatNumber(analysis.stats.totalLines)}</div>
                      <div className="text-sm text-ink-subtle">Lines of Code</div>
                    </div>
                  </div>

                  {/* Project Structure */}
                  <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                    <h3 className="text-sm font-medium text-ink-bright mb-3 flex items-center gap-2">
                      <Boxes size={14} className="text-emerald-400" />
                      Project Structure
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {analysis.structure.framework && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                          {analysis.structure.framework}
                        </span>
                      )}
                      {analysis.structure.hasPackageJson && (
                        <span className="px-3 py-1 rounded-full bg-overlay/[0.06] text-ink-muted text-sm flex items-center gap-1.5">
                          <Check size={12} className="text-green-400" /> package.json
                        </span>
                      )}
                      {analysis.structure.hasTsConfig && (
                        <span className="px-3 py-1 rounded-full bg-overlay/[0.06] text-ink-muted text-sm flex items-center gap-1.5">
                          <Check size={12} className="text-green-400" /> TypeScript
                        </span>
                      )}
                      {analysis.structure.hasSrc && (
                        <span className="px-3 py-1 rounded-full bg-overlay/[0.06] text-ink-muted text-sm flex items-center gap-1.5">
                          <Check size={12} className="text-green-400" /> src/
                        </span>
                      )}
                      {analysis.structure.hasTests && (
                        <span className="px-3 py-1 rounded-full bg-overlay/[0.06] text-ink-muted text-sm flex items-center gap-1.5">
                          <Check size={12} className="text-green-400" /> Tests
                        </span>
                      )}
                      {analysis.structure.hasReadme && (
                        <span className="px-3 py-1 rounded-full bg-overlay/[0.06] text-ink-muted text-sm flex items-center gap-1.5">
                          <Check size={12} className="text-green-400" /> README
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Treemap */}
                  <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                    <h3 className="text-sm font-medium text-ink-bright mb-3 flex items-center gap-2">
                      <Layers size={14} className="text-emerald-400" />
                      File Distribution
                    </h3>
                    <TreeMap stats={analysis.stats} />
                  </div>

                  {/* Type Breakdown */}
                  <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                    <h3 className="text-sm font-medium text-ink-bright mb-3 flex items-center gap-2">
                      <FileCode size={14} className="text-emerald-400" />
                      File Types
                    </h3>
                    <TypeBarChart stats={analysis.stats} />
                  </div>

                  {/* Largest Files */}
                  <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                    <h3 className="text-sm font-medium text-ink-bright mb-3 flex items-center gap-2">
                      <FileText size={14} className="text-emerald-400" />
                      Largest Files
                    </h3>
                    <div className="space-y-2">
                      {analysis.stats.largestFiles.slice(0, 8).map((file, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="text-ink-subtle w-4">{i + 1}.</span>
                          <span className="text-ink flex-1 truncate font-mono text-xs">{file.path}</span>
                          <span className="text-ink-subtle">{formatNumber(file.lines)} lines</span>
                          <span className="text-ink-muted w-20 text-right">{formatBytes(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tree Tab */}
              {activeTab === 'tree' && (
                <div className="flex h-full">
                  <div className="w-1/2 border-r border-overlay/[0.06] overflow-y-auto p-2">
                    <TreeNode node={analysis.tree} onSelectFile={loadFileContent} />
                  </div>
                  <div className="w-1/2 p-4">
                    {selectedFile ? (
                      <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-ink-muted font-mono truncate">{selectedFile.split('/').pop()}</span>
                          <button
                            onClick={() => window.api.openFileExternal(selectedFile)}
                            className="p-1 hover:bg-overlay/[0.06] rounded"
                          >
                            <ExternalLink size={14} className="text-ink-subtle" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-black/30 rounded-lg p-3 font-mono text-xs text-ink whitespace-pre">
                          {fileContent || 'Loading...'}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-ink-subtle text-sm">
                        Select a file to preview
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dependencies Tab */}
              {activeTab === 'deps' && (
                <div className="p-6 overflow-y-auto h-full">
                  <div className="mb-4">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search dependencies..."
                        className="w-full bg-overlay/[0.03] border border-overlay/[0.06] rounded-lg pl-9 pr-4 py-2 text-sm text-ink-bright placeholder-ink-subtle"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">
                        {analysis.dependencies.filter(d => d.type === 'dependency').length}
                      </div>
                      <div className="text-sm text-ink-subtle">Dependencies</div>
                    </div>
                    <div className="bg-overlay/[0.03] rounded-lg p-4 border border-overlay/[0.06]">
                      <div className="text-2xl font-bold text-ink-bright">
                        {analysis.dependencies.filter(d => d.type === 'devDependency').length}
                      </div>
                      <div className="text-sm text-ink-subtle">Dev Dependencies</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {filteredDeps.map((dep, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-overlay/[0.03] transition-colors"
                      >
                        <Package size={14} className={dep.type === 'dependency' ? 'text-emerald-400' : 'text-ink-subtle'} />
                        <span className="text-sm text-ink-bright flex-1">{dep.name}</span>
                        <span className="text-xs text-ink-subtle font-mono">{dep.version}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          dep.type === 'dependency'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-ink-subtle/20 text-ink-muted'
                        }`}>
                          {dep.type === 'dependency' ? 'prod' : 'dev'}
                        </span>
                      </div>
                    ))}
                    {filteredDeps.length === 0 && (
                      <div className="text-center text-ink-subtle py-8">
                        {analysis.dependencies.length === 0
                          ? 'No dependencies found (no package.json)'
                          : 'No matching dependencies'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
