import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Image,
  GripVertical,
  MoreHorizontal
} from 'lucide-react'

export interface OpenFile {
  path: string
  name: string
  isDirty?: boolean
}

interface FileTabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onCloseOthers?: (path: string) => void
  onCloseAll?: () => void
  onReorderFiles?: (files: OpenFile[]) => void
}

// File extension to icon mapping
const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  const iconMap: Record<string, typeof File> = {
    ts: FileCode,
    tsx: FileCode,
    js: FileCode,
    jsx: FileCode,
    py: FileCode,
    rb: FileCode,
    go: FileCode,
    rs: FileCode,
    cpp: FileCode,
    c: FileCode,
    java: FileCode,
    swift: FileCode,
    kt: FileCode,
    vue: FileCode,
    svelte: FileCode,
    json: FileJson,
    yaml: FileJson,
    yml: FileJson,
    toml: FileJson,
    xml: FileJson,
    md: FileText,
    txt: FileText,
    doc: FileText,
    docx: FileText,
    pdf: FileText,
    css: FileType,
    scss: FileType,
    sass: FileType,
    less: FileType,
    png: Image,
    jpg: Image,
    jpeg: Image,
    gif: Image,
    svg: Image,
    webp: Image,
    ico: Image
  }

  return iconMap[ext] || File
}

// Get file extension color
const getExtColor = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  const colorMap: Record<string, string> = {
    ts: 'text-blue-400',
    tsx: 'text-blue-400',
    js: 'text-yellow-400',
    jsx: 'text-yellow-400',
    py: 'text-green-400',
    json: 'text-yellow-500',
    md: 'text-ink-muted',
    css: 'text-sand-400',
    scss: 'text-pink-400',
    html: 'text-orange-400',
  }

  return colorMap[ext] || 'text-ink-subtle'
}

export default function FileTabBar({
  openFiles,
  activeFilePath,
  onSelectFile,
  onCloseFile,
  onCloseOthers,
  onCloseAll,
  onReorderFiles
}: FileTabBarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close context menu on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, path })
  }, [])

  const handleMiddleClick = useCallback((e: React.MouseEvent, path: string) => {
    if (e.button === 1) {
      e.preventDefault()
      onCloseFile(path)
    }
  }, [onCloseFile])

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDropIndex(index)
    }
  }, [draggedIndex])

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dropIndex !== null && draggedIndex !== dropIndex && onReorderFiles) {
      const newFiles = [...openFiles]
      const [removed] = newFiles.splice(draggedIndex, 1)
      newFiles.splice(dropIndex, 0, removed)
      onReorderFiles(newFiles)
    }
    setDraggedIndex(null)
    setDropIndex(null)
  }, [draggedIndex, dropIndex, openFiles, onReorderFiles])

  if (openFiles.length === 0) {
    return null
  }

  return (
    <div className="relative">
      {/* Tab Bar */}
      <div
        ref={containerRef}
        className="flex items-center gap-0.5 px-2 py-1 bg-surface-3 border-b border-overlay/[0.06] overflow-x-auto scrollbar-hide"
      >
        {openFiles.map((file, index) => {
          const isActive = file.path === activeFilePath
          const FileIcon = getFileIcon(file.name)
          const extColor = getExtColor(file.name)
          const isDragging = draggedIndex === index
          const isDropTarget = dropIndex === index

          return (
            <div
              key={file.path}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onMouseDown={(e) => handleMiddleClick(e, file.path)}
              onContextMenu={(e) => handleContextMenu(e, file.path)}
              className={`
                group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                transition-all duration-150 cursor-pointer select-none flex-shrink-0 max-w-[180px]
                ${isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-subtle hover:text-ink hover:bg-overlay/[0.04]'
                }
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDropTarget ? 'ring-2 ring-accent/50 ring-inset' : ''}
              `}
              onClick={() => onSelectFile(file.path)}
            >
              {/* Drag handle */}
              <GripVertical
                size={10}
                className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
              />

              {/* File icon */}
              <FileIcon size={14} className={isActive ? 'text-accent' : extColor} />

              {/* File name */}
              <span className="truncate">{file.name}</span>

              {/* Dirty indicator */}
              {file.isDirty && (
                <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              )}

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file.path)
                }}
                className={`
                  p-0.5 rounded transition-all flex-shrink-0
                  ${isActive
                    ? 'opacity-60 hover:opacity-100 hover:bg-accent/20'
                    : 'opacity-0 group-hover:opacity-60 hover:opacity-100 hover:bg-overlay/10'
                  }
                `}
              >
                <X size={12} />
              </button>

              {/* Active indicator line */}
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
              )}
            </div>
          )
        })}

        {/* More button when there are many tabs */}
        {openFiles.length > 5 && (
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setContextMenu({ x: rect.left, y: rect.bottom + 4, path: '__more__' })
            }}
            className="p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/[0.06] transition-colors flex-shrink-0"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.path !== '__more__' && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-48 bg-surface-4 border border-overlay/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="p-1">
            <button
              onClick={() => {
                onCloseFile(contextMenu.path)
                setContextMenu(null)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ink hover:bg-overlay/[0.06] hover:text-ink-bright transition-colors"
            >
              <X size={14} />
              Close
            </button>
            {onCloseOthers && (
              <button
                onClick={() => {
                  onCloseOthers(contextMenu.path)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ink hover:bg-overlay/[0.06] hover:text-ink-bright transition-colors"
              >
                Close Others
              </button>
            )}
            {onCloseAll && (
              <button
                onClick={() => {
                  onCloseAll()
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ink hover:bg-overlay/[0.06] hover:text-ink-bright transition-colors"
              >
                Close All
              </button>
            )}
          </div>
        </div>
      )}

      {/* File list overflow menu */}
      {contextMenu && contextMenu.path === '__more__' && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-64 max-h-80 overflow-y-auto bg-surface-4 border border-overlay/10 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="p-1">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-ink-subtle font-medium">
              Open Files ({openFiles.length})
            </div>
            {openFiles.map((file) => {
              const FileIcon = getFileIcon(file.name)
              const isActive = file.path === activeFilePath

              return (
                <button
                  key={file.path}
                  onClick={() => {
                    onSelectFile(file.path)
                    setContextMenu(null)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink hover:bg-overlay/[0.06] hover:text-ink-bright'
                  }`}
                >
                  <FileIcon size={14} />
                  <span className="truncate">{file.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
