import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  File,
  FilePlus,
  FolderPlus,
  Search,
  MoreHorizontal,
  Trash2,
  Edit3,
  Copy,
  ExternalLink,
  X,
  RefreshCw,
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  Settings,
  Image,
  Database,
  Terminal,
  Palette,
  Eye,
  EyeOff,
  Home,
  MessageSquarePlus,
  Monitor
} from 'lucide-react'
import { useContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import FileTabBar, { type OpenFile } from '../files/FileTabBar'
import { useAppStore } from '../../store'
import type { FileNode, FileStats, GitFileStatusMap, GitFileStatusType } from '../../../shared/types'

interface SidebarProps {
  cwd: string
  onSelectFolder: () => void
  onPreviewFile?: (path: string) => void
  onSendToChat?: (path: string) => void
}

// File type icons and colors
const FILE_ICONS: Record<string, { Icon: typeof File; color: string }> = {
  '.ts': { Icon: FileCode, color: '#3178c6' },
  '.tsx': { Icon: FileCode, color: '#3178c6' },
  '.js': { Icon: FileCode, color: '#f7df1e' },
  '.jsx': { Icon: FileCode, color: '#61dafb' },
  '.json': { Icon: FileJson, color: '#cbcb41' },
  '.css': { Icon: Palette, color: '#264de4' },
  '.scss': { Icon: Palette, color: '#cc6699' },
  '.md': { Icon: FileText, color: '#083fa1' },
  '.txt': { Icon: FileText, color: '#6d6d6d' },
  '.html': { Icon: FileCode, color: '#e34c26' },
  '.py': { Icon: FileCode, color: '#3776ab' },
  '.go': { Icon: FileCode, color: '#00add8' },
  '.rs': { Icon: FileCode, color: '#dea584' },
  '.sql': { Icon: Database, color: '#336791' },
  '.sh': { Icon: Terminal, color: '#89e051' },
  '.env': { Icon: Settings, color: '#ecd53f' },
  '.png': { Icon: Image, color: '#a4c639' },
  '.jpg': { Icon: Image, color: '#a4c639' },
  '.svg': { Icon: Image, color: '#ffb13b' },
  '.gif': { Icon: Image, color: '#a4c639' }
}

// Git status config
const GIT_STATUS: Record<GitFileStatusType, { color: string; label: string }> = {
  modified: { color: '#e2a93d', label: 'M' },
  added: { color: '#3fb950', label: 'A' },
  deleted: { color: '#f85149', label: 'D' },
  renamed: { color: '#a371f7', label: 'R' },
  untracked: { color: '#8b949e', label: 'U' },
  staged: { color: '#3fb950', label: 'S' },
  conflict: { color: '#f85149', label: '!' }
}

// Check if a file can be previewed in-app
const isPreviewable = (name: string): boolean => {
  const ext = name.toLowerCase().split('.').pop() || ''
  const previewableExts = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'md', 'txt', 'json', 'css']
  return previewableExts.includes(ext)
}

export default function Sidebar({ cwd, onSelectFolder, onPreviewFile, onSendToChat }: SidebarProps) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitFileStatusMap>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [createModal, setCreateModal] = useState<{ type: 'file' | 'folder'; path: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)

  // Open files state from store
  const {
    openFiles,
    activeFilePath,
    addOpenFile,
    removeOpenFile,
    setActiveFile,
    closeOtherFiles,
    clearOpenFiles,
    reorderOpenFiles
  } = useAppStore()

  const { showContextMenu, ContextMenuComponent } = useContextMenu()
  const renameRef = useRef<HTMLInputElement>(null)
  const createRef = useRef<HTMLInputElement>(null)
  const [createName, setCreateName] = useState('')

  // Load directory
  const loadDir = useCallback(async (path: string) => {
    setIsLoading(true)
    try {
      const entries = await window.api.listDirectoryFull(path, showHidden)
      setFiles(entries)
    } catch (e) {
      console.error('Failed to load:', e)
    } finally {
      setIsLoading(false)
    }
  }, [showHidden])

  // Load git status
  const loadGit = useCallback(async () => {
    try {
      const status = await window.api.gitFileStatus()
      setGitStatus(status)
    } catch {}
  }, [])

  useEffect(() => {
    if (cwd) {
      loadDir(cwd)
      loadGit()
    }
  }, [cwd, loadDir, loadGit])

  // Refresh git periodically
  useEffect(() => {
    if (!cwd) return
    const i = setInterval(loadGit, 5000)
    return () => clearInterval(i)
  }, [cwd, loadGit])

  // Reload on hidden toggle
  useEffect(() => {
    if (cwd) loadDir(cwd)
  }, [showHidden, cwd, loadDir])

  // Filter files
  const filtered = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    const filter = (nodes: FileNode[]): FileNode[] =>
      nodes.filter(n => n.name.toLowerCase().includes(q))
    return filter(files)
  }, [files, search])

  // Toggle expand
  const toggle = async (path: string) => {
    const next = new Set(expanded)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
      try {
        const children = await window.api.listDirectoryFull(path, showHidden)
        setFiles(prev => {
          const update = (nodes: FileNode[]): FileNode[] =>
            nodes.map(n => n.path === path ? { ...n, children } : n.children ? { ...n, children: update(n.children) } : n)
          return update(prev)
        })
      } catch {}
    }
    setExpanded(next)
  }

  // Get icon for file
  const getIcon = (name: string, isDir: boolean) => {
    if (isDir) return { Icon: Folder, color: '#cc785c' }
    const ext = name.includes('.') ? '.' + name.split('.').pop()?.toLowerCase() : ''
    return FILE_ICONS[ext] || { Icon: File, color: '#6d6d6d' }
  }

  // Start rename
  const startRename = (node: FileNode) => {
    setRenaming(node.path)
    setRenameValue(node.name)
    setTimeout(() => renameRef.current?.select(), 50)
  }

  // Confirm rename
  const confirmRename = async () => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null)
      return
    }
    const result = await window.api.renameFile(renaming, renameValue.trim())
    if (result.success) {
      loadDir(cwd)
      loadGit()
    }
    setRenaming(null)
  }

  // Create file/folder
  const handleCreate = async () => {
    if (!createModal || !createName.trim()) {
      setCreateModal(null)
      setCreateName('')
      return
    }
    const result = createModal.type === 'file'
      ? await window.api.createFile(createModal.path, createName.trim())
      : await window.api.createFolder(createModal.path, createName.trim())
    if (result.success) {
      loadDir(cwd)
      if (createModal.type === 'folder') {
        setExpanded(prev => new Set([...prev, createModal.path]))
      }
    }
    setCreateModal(null)
    setCreateName('')
  }

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    const result = await window.api.deleteFile(deleteTarget.path)
    if (result.success) {
      loadDir(cwd)
      loadGit()
    }
    setDeleteTarget(null)
  }

  // Context menu - organized by action type
  const handleContext = (e: React.MouseEvent, node: FileNode) => {
    const items: ContextMenuItem[] = []

    // Primary actions first
    if (!node.isDirectory && onSendToChat) {
      items.push({ id: 'chat', label: 'Send to Claude', icon: MessageSquarePlus, onClick: () => onSendToChat(node.path) })
    }

    if (!node.isDirectory && isPreviewable(node.name) && onPreviewFile) {
      items.push({ id: 'preview', label: 'Preview in App', icon: Monitor, onClick: () => handleFileClick(node.path) })
    }

    if (items.length > 0) {
      items.push({ id: 'd0', label: '', divider: true })
    }

    // Open actions
    items.push(
      { id: 'open', label: 'Open in Default App', icon: ExternalLink, onClick: () => window.api.openFileExternal(node.path) },
      { id: 'finder', label: 'Reveal in Finder', icon: FolderOpen, onClick: () => window.api.showInFinder(node.path) }
    )

    if (node.isDirectory) {
      items.push({
        id: 'terminal',
        label: 'Open in Terminal',
        icon: Terminal,
        onClick: async () => {
          try {
            const terminals = await window.api.getTerminals()
            if (terminals && terminals.length > 0) {
              await window.api.terminalSendText(`cd "${node.path}"\n`, terminals[0].id)
            }
          } catch (err) {
            console.error('Failed to cd:', err)
          }
        }
      })
    }

    items.push(
      { id: 'd1', label: '', divider: true },
      { id: 'copy', label: 'Copy Path', icon: Copy, onClick: () => navigator.clipboard.writeText(node.path) },
      { id: 'rename', label: 'Rename', icon: Edit3, shortcut: 'F2', onClick: () => startRename(node) }
    )

    if (node.isDirectory) {
      items.push(
        { id: 'd2', label: '', divider: true },
        { id: 'newfile', label: 'New File', icon: FilePlus, onClick: () => { setCreateModal({ type: 'file', path: node.path }); setTimeout(() => createRef.current?.focus(), 50) } },
        { id: 'newfolder', label: 'New Folder', icon: FolderPlus, onClick: () => { setCreateModal({ type: 'folder', path: node.path }); setTimeout(() => createRef.current?.focus(), 50) } }
      )
    }

    items.push(
      { id: 'd3', label: '', divider: true },
      { id: 'delete', label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(node) }
    )

    showContextMenu(e, items)
  }

  // Render file tree
  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expanded.has(node.path)
      const isRenaming = renaming === node.path
      const { Icon, color } = getIcon(node.name, node.isDirectory)
      const status = gitStatus[node.path]
      const canPreview = !node.isDirectory && isPreviewable(node.name)

      return (
        <div key={node.path}>
          <div
            className={`group flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer transition-colors hover:bg-overlay/[0.04] ${
              isRenaming ? 'bg-overlay/[0.06]' : ''
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => {
              if (node.isDirectory) {
                toggle(node.path)
              } else {
                // Single click: preview if possible, otherwise open externally
                if (canPreview && onPreviewFile) {
                  handleFileClick(node.path)
                } else {
                  // For non-previewable files, open in default app
                  window.api.openFileExternal(node.path)
                }
              }
            }}
            onContextMenu={e => handleContext(e, node)}
            onDoubleClick={() => {
              if (!node.isDirectory) {
                // Double click always opens externally
                window.api.openFileExternal(node.path)
              }
            }}
          >
            {/* Expand arrow */}
            {node.isDirectory ? (
              <ChevronRight
                size={14}
                className={`flex-shrink-0 text-ink-subtle transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            ) : (
              <span className="w-3.5" />
            )}

            {/* Icon */}
            <Icon size={15} style={{ color }} className="flex-shrink-0" />

            {/* Name or rename input */}
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-black/40 border border-accent/50 rounded text-ink-bright focus:outline-none"
              />
            ) : (
              <span className={`flex-1 truncate text-xs ${node.name.startsWith('.') ? 'text-ink-subtle' : 'text-ink'}`}>
                {node.name}
              </span>
            )}

            {/* Git badge */}
            {status && (
              <span
                className="flex-shrink-0 text-[9px] font-bold px-1 rounded"
                style={{ color: GIT_STATUS[status].color, backgroundColor: `${GIT_STATUS[status].color}20` }}
              >
                {GIT_STATUS[status].label}
              </span>
            )}

            {/* Quick actions on hover - clearer icons */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
              {/* Send to Claude - files only */}
              {!node.isDirectory && onSendToChat && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSendToChat(node.path)
                  }}
                  className="p-0.5 rounded hover:bg-blue-500/20 text-ink-subtle hover:text-blue-400 transition-all"
                  title="Send to Claude"
                >
                  <MessageSquarePlus size={12} />
                </button>
              )}
              {/* Preview in app - previewable files only */}
              {canPreview && onPreviewFile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFileClick(node.path)
                  }}
                  className="p-0.5 rounded hover:bg-accent/20 text-ink-subtle hover:text-accent transition-all"
                  title="Preview in App"
                >
                  <Monitor size={12} />
                </button>
              )}
              {/* Terminal cd button - folders only */}
              {node.isDirectory && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      const terminals = await window.api.getTerminals()
                      if (terminals && terminals.length > 0) {
                        await window.api.terminalSendText(`cd "${node.path}"\n`, terminals[0].id)
                      }
                    } catch (err) {
                      console.error('Failed to cd:', err)
                    }
                  }}
                  className="p-0.5 rounded hover:bg-green-500/20 text-ink-subtle hover:text-green-400 transition-all"
                  title="cd in Terminal"
                >
                  <Terminal size={12} />
                </button>
              )}
              {/* Open externally */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  window.api.openFileExternal(node.path)
                }}
                className="p-0.5 rounded hover:bg-overlay/10 text-ink-subtle hover:text-ink transition-all"
                title="Open in Default App"
              >
                <ExternalLink size={12} />
              </button>
              {/* Copy path button */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(node.path)
                }}
                className="p-0.5 rounded hover:bg-overlay/10 text-ink-subtle hover:text-ink transition-all"
                title="Copy Path"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          {/* Children */}
          {node.isDirectory && isExpanded && node.children && (
            <div className="overflow-hidden">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  const projectName = cwd?.split('/').pop() || 'Project'

  // Convert openFiles paths to OpenFile format
  const openFilesData: OpenFile[] = useMemo(() => {
    return openFiles.map(path => ({
      path,
      name: path.split('/').pop() || path
    }))
  }, [openFiles])

  // Handle file tab selection
  const handleTabSelect = useCallback((path: string) => {
    setActiveFile(path)
    onPreviewFile?.(path)
  }, [setActiveFile, onPreviewFile])

  // Handle file click in tree - opens in tabs and previews
  const handleFileClick = useCallback((path: string) => {
    addOpenFile(path)
    onPreviewFile?.(path)
  }, [addOpenFile, onPreviewFile])

  // Handle reorder
  const handleReorderTabs = useCallback((files: OpenFile[]) => {
    reorderOpenFiles(files.map(f => f.path))
  }, [reorderOpenFiles])

  return (
    <aside className="w-60 h-full flex flex-col bg-surface-2 border-r border-overlay/[0.06]">
      {/* Open Files Tabs */}
      {openFilesData.length > 0 && (
        <FileTabBar
          openFiles={openFilesData}
          activeFilePath={activeFilePath}
          onSelectFile={handleTabSelect}
          onCloseFile={removeOpenFile}
          onCloseOthers={closeOtherFiles}
          onCloseAll={clearOpenFiles}
          onReorderFiles={handleReorderTabs}
        />
      )}

      {/* Header */}
      <div className="p-3 border-b border-overlay/[0.06]">
        {cwd ? (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <Folder size={14} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-bright truncate">{projectName}</p>
              <p className="text-[10px] text-ink-subtle truncate">{cwd}</p>
            </div>
            <button
              onClick={() => loadDir(cwd)}
              className="p-1 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        ) : (
          <button
            onClick={onSelectFolder}
            className="w-full flex items-center gap-2 p-2 rounded-lg bg-overlay/[0.03] hover:bg-overlay/[0.06] border border-overlay/[0.06] hover:border-overlay/[0.1] transition-all"
          >
            <FolderOpen size={16} className="text-accent" />
            <span className="text-xs text-ink-muted">Open Folder</span>
          </button>
        )}

        {/* Search */}
        {cwd && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-overlay/[0.03] border border-overlay/[0.06] rounded-lg text-ink-bright placeholder-ink-faint focus:outline-none focus:border-accent/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-bright"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      {cwd && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-overlay/[0.06]">
          <button
            onClick={() => setCreateModal({ type: 'file', path: cwd })}
            className="p-1.5 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink transition-colors"
            title="New File"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={() => setCreateModal({ type: 'folder', path: cwd })}
            className="p-1.5 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink transition-colors"
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 rounded hover:bg-overlay/[0.06] transition-colors ${showHidden ? 'text-accent' : 'text-ink-subtle hover:text-ink'}`}
            title={showHidden ? 'Hide Hidden' : 'Show Hidden'}
          >
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={onSelectFolder}
            className="p-1.5 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink transition-colors"
            title="Change Folder"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {cwd ? (
          filtered.length > 0 ? (
            renderTree(filtered)
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-ink-subtle">
                {search ? 'No matching files' : 'Empty folder'}
              </p>
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-overlay/[0.03] flex items-center justify-center mb-3">
              <Home size={20} className="text-ink-faint" />
            </div>
            <p className="text-sm text-ink-muted mb-1">No folder open</p>
            <p className="text-xs text-ink-faint">Select a folder to explore files</p>
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      {cwd && (
        <div className="px-3 py-2 border-t border-overlay/[0.06] text-[10px] text-ink-faint">
          Click to preview • Double-click to open • Right-click for more
        </div>
      )}

      {/* Context Menu */}
      {ContextMenuComponent}

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-xl border border-overlay/[0.08] bg-surface-4 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-ink-bright mb-1">
              New {createModal.type === 'file' ? 'File' : 'Folder'}
            </h3>
            <p className="text-[11px] text-ink-subtle mb-4 truncate">
              in {createModal.path.split('/').pop()}
            </p>
            <input
              ref={createRef}
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreateModal(null); setCreateName('') }
              }}
              placeholder={createModal.type === 'file' ? 'filename.txt' : 'folder-name'}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-overlay/[0.08] text-ink-bright text-sm placeholder-ink-subtle focus:outline-none focus:border-accent/50 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setCreateModal(null); setCreateName('') }}
                className="px-4 py-2 text-sm text-ink-muted hover:text-ink-bright transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createName.trim()}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-xl border border-overlay/[0.08] bg-surface-4 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-ink-bright mb-2">
              Delete {deleteTarget.isDirectory ? 'Folder' : 'File'}
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Are you sure you want to delete <span className="text-ink-bright font-medium">"{deleteTarget.name}"</span>?
              {deleteTarget.isDirectory && <span className="block text-xs text-ink-subtle mt-1">This will delete all contents inside.</span>}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-ink-muted hover:text-ink-bright transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
