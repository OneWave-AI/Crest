import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X,
  RefreshCw,
  Loader2,
  Check,
  Undo2,
  FileDiff,
  Columns2,
  AlignLeft,
  MessageSquare,
  AlertTriangle,
  GitCommit
} from 'lucide-react'
import { useToast } from '../common/Toast'
import { parseUnifiedDiff, buildHunkPatch, toSplitRows } from '../../utils/parseDiff'
import type { ParsedDiff, DiffHunk, DiffLine } from '../../utils/parseDiff'
import type { GitDiffFile, GitFileStatusType } from '../../../shared/types'

interface DiffPanelProps {
  isOpen: boolean
  onClose: () => void
  /** When set, hunks can be handed to the running agent for explanation */
  activeTerminalId?: string | null
}

type ViewMode = 'inline' | 'split'
type Side = 'unstaged' | 'staged'

const STATUS_LABEL: Record<GitFileStatusType, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  staged: 'S',
  conflict: '!'
}

const STATUS_COLOR: Record<GitFileStatusType, string> = {
  modified: 'text-amber-400 bg-amber-400/10',
  added: 'text-emerald-400 bg-emerald-400/10',
  deleted: 'text-red-400 bg-red-400/10',
  renamed: 'text-blue-400 bg-blue-400/10',
  untracked: 'text-gray-400 bg-white/[0.06]',
  staged: 'text-accent bg-accent/10',
  conflict: 'text-red-400 bg-red-400/15'
}

interface ConfirmState {
  title: string
  detail: string
  actionLabel: string
  run: () => Promise<void>
}

export default function DiffPanel({ isOpen, onClose, activeTerminalId }: DiffPanelProps) {
  const { showToast } = useToast()

  const [files, setFiles] = useState<GitDiffFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [side, setSide] = useState<Side>('unstaged')
  const [parsed, setParsed] = useState<ParsedDiff | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('inline')
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [busyHunk, setBusyHunk] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) || null,
    [files, selectedPath]
  )

  const loadFiles = useCallback(
    async (keepSelection = true) => {
      setLoadingFiles(true)
      try {
        const next = await window.api.gitDiffSummary()
        setFiles(next)

        setSelectedPath((current) => {
          if (keepSelection && current && next.some((file) => file.path === current)) return current
          return next[0]?.path ?? null
        })
      } catch {
        showToast('error', 'Could not read changes', 'Is this folder a git repository?')
      } finally {
        setLoadingFiles(false)
      }
    },
    [showToast]
  )

  // Load the file list whenever the panel opens
  useEffect(() => {
    if (isOpen) loadFiles(false)
  }, [isOpen, loadFiles])

  // Default to whichever side actually has changes for the selected file
  useEffect(() => {
    if (!selectedFile) return
    setSide((current) => {
      if (current === 'staged' && selectedFile.staged) return 'staged'
      if (current === 'unstaged' && selectedFile.unstaged) return 'unstaged'
      return selectedFile.unstaged ? 'unstaged' : 'staged'
    })
  }, [selectedFile])

  // Load the diff for the selected file/side
  const loadDiff = useCallback(async () => {
    if (!selectedFile) {
      setParsed(null)
      return
    }

    setLoadingDiff(true)
    try {
      const untracked = selectedFile.status === 'untracked' && side === 'unstaged'
      const result = await window.api.gitDiffFile(selectedFile.path, side === 'staged', untracked)

      if (!result.success) {
        setParsed(null)
        showToast('error', 'Could not read diff', result.error)
        return
      }

      setParsed(parseUnifiedDiff(result.diff || ''))
    } finally {
      setLoadingDiff(false)
    }
  }, [selectedFile, side, showToast])

  useEffect(() => {
    loadDiff()
  }, [loadDiff])

  // Escape closes the confirm dialog first, then the panel
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirm) setConfirm(null)
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, confirm, onClose])

  // Line numbers shift after every apply, so always re-read both the summary and
  // the diff rather than patching local state.
  const refreshAfterApply = useCallback(async () => {
    await loadFiles(true)
    await loadDiff()
  }, [loadFiles, loadDiff])

  const applyHunk = useCallback(
    async (hunk: DiffHunk, index: number, options: { reverse?: boolean; cached?: boolean }, successLabel: string) => {
      if (!parsed || !selectedFile) return

      setBusyHunk(index)
      try {
        const patch = buildHunkPatch(parsed, hunk)
        const result = await window.api.gitApplyPatch(patch, options)

        if (!result.success) {
          showToast(
            'error',
            'Hunk could not be applied',
            result.error || 'The file may have changed since this diff was read. Refresh and retry.'
          )
          return
        }

        showToast('success', successLabel, selectedFile.path)
        await refreshAfterApply()
      } finally {
        setBusyHunk(null)
      }
    },
    [parsed, selectedFile, showToast, refreshAfterApply]
  )

  const askAboutHunk = useCallback(
    (hunk: DiffHunk) => {
      if (!activeTerminalId || !selectedFile) return
      const body = [hunk.header, ...hunk.lines.map((line) => line.raw)].join('\n')
      const prompt = `Explain this change in ${selectedFile.path} and tell me if it looks correct:\n\n\`\`\`diff\n${body}\n\`\`\`\n`
      window.api.terminalSendText(prompt, activeTerminalId)
      showToast('info', 'Sent to session', selectedFile.path)
    },
    [activeTerminalId, selectedFile, showToast]
  )

  const askAboutEverything = useCallback(() => {
    if (!activeTerminalId) return
    const summary = files
      .map((file) => `- ${file.path} (+${file.insertions} / -${file.deletions})`)
      .join('\n')
    window.api.terminalSendText(
      `Review the current uncommitted changes and tell me what they do plus anything risky:\n\n${summary}\n`,
      activeTerminalId
    )
    showToast('info', 'Sent to session', `${files.length} changed files`)
  }, [activeTerminalId, files, showToast])

  const fileAction = useCallback(
    async (action: 'stage' | 'unstage' | 'discard', file: GitDiffFile) => {
      const result =
        action === 'stage'
          ? await window.api.gitStageFile(file.path)
          : action === 'unstage'
            ? await window.api.gitUnstageFile(file.path)
            : await window.api.gitDiscardFile(file.path, file.status === 'untracked')

      if (!result.success) {
        showToast('error', `Could not ${action} file`, result.error)
        return
      }

      showToast(
        'success',
        action === 'stage' ? 'File staged' : action === 'unstage' ? 'File unstaged' : 'Changes discarded',
        file.path
      )
      await refreshAfterApply()
    },
    [showToast, refreshAfterApply]
  )

  if (!isOpen) return null

  const totalInsertions = files.reduce((sum, file) => sum + file.insertions, 0)
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed inset-4 z-50 flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.06] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <FileDiff size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Review Changes</h2>
              <p className="text-xs text-gray-500">
                {files.length} {files.length === 1 ? 'file' : 'files'}
                <span className="text-emerald-400 ml-2">+{totalInsertions}</span>
                <span className="text-red-400 ml-1.5">-{totalDeletions}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 mr-2 p-0.5 rounded-lg bg-white/[0.04]">
              <button
                onClick={() => setViewMode('inline')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'inline' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-white'
                }`}
                title="Inline view"
              >
                <AlignLeft size={15} />
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'split' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-white'
                }`}
                title="Side-by-side view"
              >
                <Columns2 size={15} />
              </button>
            </div>

            {activeTerminalId && files.length > 0 && (
              <button
                onClick={askAboutEverything}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Ask the running session to review these changes"
              >
                <MessageSquare size={14} />
                <span>Ask session</span>
              </button>
            )}

            <button
              onClick={() => loadFiles(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={loadingFiles ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* File list */}
          <div className="w-80 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto">
            {files.length === 0 && !loadingFiles && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <GitCommit size={28} className="text-gray-600 mb-3" />
                <p className="text-sm text-gray-400">Working tree is clean</p>
                <p className="text-xs text-gray-600 mt-1">No uncommitted changes to review</p>
              </div>
            )}

            {files.map((file) => {
              const isSelected = file.path === selectedPath
              const name = file.path.split('/').pop() || file.path
              const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, '')

              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/[0.03] transition-colors ${
                    isSelected ? 'bg-accent/[0.08]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-semibold ${STATUS_COLOR[file.status]}`}
                    >
                      {STATUS_LABEL[file.status]}
                    </span>
                    <span className={`text-sm truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-7">
                    {dir && <span className="text-[10px] text-gray-600 truncate">{dir}</span>}
                    {file.binary ? (
                      <span className="text-[10px] text-gray-500">binary</span>
                    ) : (
                      <span className="text-[10px] whitespace-nowrap">
                        <span className="text-emerald-500/80">+{file.insertions}</span>
                        <span className="text-red-500/80 ml-1">-{file.deletions}</span>
                      </span>
                    )}
                    {file.staged && (
                      <span className="text-[9px] uppercase tracking-wide text-accent/80">staged</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Diff */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFile && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06] bg-[#111]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-gray-400 truncate">{selectedFile.path}</span>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {selectedFile.staged && selectedFile.unstaged && (
                    <div className="flex items-center gap-0.5 mr-2 p-0.5 rounded-lg bg-white/[0.04]">
                      <button
                        onClick={() => setSide('unstaged')}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${
                          side === 'unstaged' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-white'
                        }`}
                      >
                        Unstaged
                      </button>
                      <button
                        onClick={() => setSide('staged')}
                        className={`px-2 py-1 rounded text-[11px] transition-colors ${
                          side === 'staged' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-white'
                        }`}
                      >
                        Staged
                      </button>
                    </div>
                  )}

                  {side === 'unstaged' ? (
                    <button
                      onClick={() => fileAction('stage', selectedFile)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                    >
                      Stage file
                    </button>
                  ) : (
                    <button
                      onClick={() => fileAction('unstage', selectedFile)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-400 hover:bg-white/[0.06] transition-colors"
                    >
                      Unstage file
                    </button>
                  )}

                  {side === 'unstaged' && (
                    <button
                      onClick={() =>
                        setConfirm({
                          title: 'Discard all changes in this file?',
                          detail:
                            selectedFile.status === 'untracked'
                              ? `${selectedFile.path} will be deleted from disk. This cannot be undone.`
                              : `Working-tree changes to ${selectedFile.path} will be thrown away. This cannot be undone.`,
                          actionLabel: 'Discard file',
                          run: () => fileAction('discard', selectedFile)
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg text-[11px] text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      Discard file
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {loadingDiff && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="text-accent animate-spin" />
                </div>
              )}

              {!loadingDiff && selectedFile && parsed?.binary && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-sm text-gray-400">Binary file</p>
                  <p className="text-xs text-gray-600 mt-1">No line-level diff available</p>
                </div>
              )}

              {!loadingDiff && selectedFile && parsed && !parsed.binary && parsed.hunks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-sm text-gray-400">No changes on this side</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {side === 'staged' ? 'Nothing staged for this file' : 'Nothing left in the working tree'}
                  </p>
                </div>
              )}

              {!loadingDiff &&
                parsed &&
                !parsed.binary &&
                parsed.hunks.map((hunk, index) => (
                  <div key={`${hunk.header}-${index}`} className="border-b border-white/[0.06]">
                    {/* Hunk header */}
                    <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-[#151515] sticky top-0 z-10">
                      <span className="text-[11px] font-mono text-gray-500 truncate">{hunk.header}</span>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {busyHunk === index && <Loader2 size={13} className="text-accent animate-spin mr-1" />}

                        {activeTerminalId && (
                          <button
                            onClick={() => askAboutHunk(hunk)}
                            disabled={busyHunk !== null}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                            title="Ask the running session about this hunk"
                          >
                            <MessageSquare size={11} />
                            Ask
                          </button>
                        )}

                        {side === 'unstaged' ? (
                          <>
                            <button
                              onClick={() => applyHunk(hunk, index, { cached: true }, 'Hunk staged')}
                              disabled={busyHunk !== null}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40 transition-colors"
                            >
                              <Check size={11} />
                              Stage
                            </button>
                            <button
                              onClick={() =>
                                setConfirm({
                                  title: 'Discard this hunk?',
                                  detail:
                                    'These lines will be reverted in your working tree. This cannot be undone.',
                                  actionLabel: 'Discard hunk',
                                  run: () => applyHunk(hunk, index, { reverse: true }, 'Hunk discarded')
                                })
                              }
                              disabled={busyHunk !== null}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                            >
                              <Undo2 size={11} />
                              Discard
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() =>
                              applyHunk(hunk, index, { cached: true, reverse: true }, 'Hunk unstaged')
                            }
                            disabled={busyHunk !== null}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                          >
                            <Undo2 size={11} />
                            Unstage
                          </button>
                        )}
                      </div>
                    </div>

                    {viewMode === 'inline' ? (
                      <InlineHunk hunk={hunk} />
                    ) : (
                      <SplitHunk hunk={hunk} />
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Destructive-action confirmation */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[420px] rounded-2xl bg-[#161616] border border-white/[0.08] shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 p-5">
              <div className="p-2 rounded-lg bg-red-500/10 flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">{confirm.title}</h3>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{confirm.detail}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-white/[0.02] border-t border-white/[0.06]">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = confirm
                  setConfirm(null)
                  await action.run()
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-white bg-red-500/80 hover:bg-red-500 transition-colors"
              >
                {confirm.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function lineClasses(type: DiffLine['type']): string {
  if (type === 'add') return 'bg-emerald-500/[0.07] text-emerald-200'
  if (type === 'del') return 'bg-red-500/[0.07] text-red-200'
  return 'text-gray-400'
}

function InlineHunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="font-mono text-xs leading-[1.6]">
      {hunk.lines
        .filter((line) => line.type !== 'nonewline')
        .map((line, index) => (
          <div key={index} className={`flex ${lineClasses(line.type)}`}>
            <span className="w-12 flex-shrink-0 px-2 text-right text-gray-600 select-none tabular-nums">
              {line.oldLine ?? ''}
            </span>
            <span className="w-12 flex-shrink-0 px-2 text-right text-gray-600 select-none tabular-nums">
              {line.newLine ?? ''}
            </span>
            <span className="w-4 flex-shrink-0 text-center select-none">
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ''}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-4">{line.text}</span>
          </div>
        ))}
    </div>
  )
}

function SplitHunk({ hunk }: { hunk: DiffHunk }) {
  const rows = useMemo(() => toSplitRows(hunk), [hunk])

  return (
    <div className="font-mono text-xs leading-[1.6]">
      {rows.map((row, index) => (
        <div key={index} className="flex">
          <div
            className={`w-1/2 flex min-w-0 border-r border-white/[0.06] ${
              row.left ? lineClasses(row.left.type) : 'bg-white/[0.015]'
            }`}
          >
            <span className="w-12 flex-shrink-0 px-2 text-right text-gray-600 select-none tabular-nums">
              {row.left?.oldLine ?? ''}
            </span>
            <span className="w-3 flex-shrink-0 select-none">{row.left?.type === 'del' ? '-' : ''}</span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-2">{row.left?.text ?? ''}</span>
          </div>
          <div
            className={`w-1/2 flex min-w-0 ${row.right ? lineClasses(row.right.type) : 'bg-white/[0.015]'}`}
          >
            <span className="w-12 flex-shrink-0 px-2 text-right text-gray-600 select-none tabular-nums">
              {row.right?.newLine ?? ''}
            </span>
            <span className="w-3 flex-shrink-0 select-none">{row.right?.type === 'add' ? '+' : ''}</span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-2">{row.right?.text ?? ''}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
