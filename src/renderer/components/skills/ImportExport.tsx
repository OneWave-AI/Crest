import { useState, useCallback } from 'react'
import { X, Upload, Download, FileText, Folder, Check, AlertCircle, Loader2 } from 'lucide-react'

interface ImportExportProps {
  isOpen: boolean
  onClose: () => void
  mode: 'import' | 'export'
  itemType: 'skill' | 'agent'
  exportItem?: {
    id: string
    name: string
    path: string
  }
  onComplete: () => void
}

export default function ImportExport({
  isOpen,
  onClose,
  mode,
  itemType,
  exportItem,
  onComplete
}: ImportExportProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const file = files[0]

      // Validate file type
      if (!file.name.endsWith('.md')) {
        throw new Error('Only .md files are supported')
      }

      const content = await file.text()

      // Extract name from frontmatter or filename
      const frontmatterMatch = content.match(/^---\n[\s\S]*?name:\s*(.+?)\n[\s\S]*?\n---/)
      const name = frontmatterMatch ? frontmatterMatch[1].trim() : file.name.replace('.md', '')
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

      if (itemType === 'skill') {
        await window.api.importSkill(id, content)
      } else {
        await window.api.importAgent(id, content)
      }

      setSuccess(`Successfully imported ${itemType}: ${name}`)
      setTimeout(() => {
        onComplete()
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!exportItem) return

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.exportSkillOrAgent(exportItem.path, exportItem.name, itemType)
      if (result.success) {
        setSuccess(`Exported to: ${result.path}`)
        setTimeout(() => {
          onClose()
        }, 2000)
      } else {
        setError(result.error || 'Export failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleImport(e.dataTransfer.files)
  }, [itemType])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {mode === 'import' ? (
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Upload size={18} className="text-emerald-400" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Download size={18} className="text-blue-400" />
              </div>
            )}
            <h2 className="text-lg font-semibold text-white">
              {mode === 'import' ? 'Import' : 'Export'} {itemType === 'skill' ? 'Skill' : 'Agent'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'import' ? (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  dragOver
                    ? 'border-accent bg-accent/10'
                    : 'border-white/[0.1] hover:border-white/[0.2]'
                }`}
              >
                <input
                  type="file"
                  accept=".md"
                  onChange={(e) => handleImport(e.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className={`p-4 rounded-2xl ${dragOver ? 'bg-accent/20' : 'bg-white/[0.04]'}`}>
                    <FileText size={32} className={dragOver ? 'text-accent' : 'text-gray-500'} />
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">
                      Drop your .md file here
                    </p>
                    <p className="text-sm text-gray-500">
                      or click to browse
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-4 text-center">
                Import a markdown file with frontmatter containing name and description
              </p>
            </>
          ) : (
            <>
              {/* Export preview */}
              {exportItem && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className={`p-2 rounded-lg ${itemType === 'skill' ? 'bg-accent/10' : 'bg-sand-500/10'}`}>
                      <FileText size={18} className={itemType === 'skill' ? 'text-accent' : 'text-sand-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{exportItem.name}</h3>
                      <p className="text-xs text-gray-500 font-mono truncate mt-1">{exportItem.path}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Folder size={14} />
                    <span>Will be saved to Downloads folder</span>
                  </div>

                  <button
                    onClick={handleExport}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent-400 transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                    {loading ? 'Exporting...' : 'Export to File'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              <Check size={16} />
              {success}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
