import { useState, useEffect, useCallback } from 'react'
import {
  GitCommit,
  GitPullRequest,
  Upload,
  Download,
  GitBranch,
  X,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useToast } from './Toast'
import { notifyGitOperation } from '../../store/notificationStore'
import type { GitStatus } from '../../../shared/types'

interface CommitModalProps {
  isOpen: boolean
  onClose: () => void
  onCommit: (message: string) => void
  isLoading: boolean
  status: GitStatus | null
}

function CommitModal({ isOpen, onClose, onCommit, isLoading, status }: CommitModalProps) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setMessage('')
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      onCommit(message.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  const totalChanges = (status?.staged || 0) + (status?.unstaged || 0) + (status?.untracked || 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="commit-dialog-title"
    >
      <div
        className="relative w-full max-w-md mx-4 bg-gradient-to-b from-surface-7 to-surface-5 rounded-2xl border border-overlay/10 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-overlay/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/20" aria-hidden="true">
              <GitCommit size={18} className="text-accent" />
            </div>
            <div>
              <h2 id="commit-dialog-title" className="text-lg font-semibold text-ink-bright">Commit Changes</h2>
              <p className="text-xs text-ink-muted">
                {totalChanges} file{totalChanges !== 1 ? 's' : ''} to commit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/10 transition-colors focus-ring"
            aria-label="Close commit dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Change summary */}
          {status && (
            <div className="flex gap-4 text-xs">
              {status.staged > 0 && (
                <span className="text-green-400">{status.staged} staged</span>
              )}
              {status.unstaged > 0 && (
                <span className="text-yellow-400">{status.unstaged} modified</span>
              )}
              {status.untracked > 0 && (
                <span className="text-ink-muted">{status.untracked} untracked</span>
              )}
            </div>
          )}

          {/* Message input */}
          <div className="space-y-2">
            <label htmlFor="commit-message" className="block text-sm font-medium text-ink">
              Commit message
            </label>
            <textarea
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              autoFocus
              rows={4}
              className="w-full px-4 py-3 bg-black/30 border border-overlay/10 rounded-xl text-ink-bright placeholder-ink-subtle focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-ink bg-overlay/5 border border-overlay/10 hover:bg-overlay/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-accent hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Commit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function GitActions() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [showCommitModal, setShowCommitModal] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.api.gitStatus()
      setStatus(result)
    } catch (error) {
      console.error('Failed to fetch git status:', error)
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Poll for status every 5 seconds
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleCommit = async (message: string) => {
    setLoadingAction('commit')
    try {
      const result = await window.api.gitCommit(message)
      if (result.success) {
        showToast('success', 'Committed', result.message)
        notifyGitOperation('commit', true, result.message)
        setShowCommitModal(false)
        fetchStatus()
      } else {
        showToast('error', 'Commit failed', result.message)
        notifyGitOperation('commit', false, result.message)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      showToast('error', 'Commit failed', errorMsg)
      notifyGitOperation('commit', false, errorMsg)
    } finally {
      setLoadingAction(null)
    }
  }

  const handlePush = async () => {
    setLoadingAction('push')
    try {
      const result = await window.api.gitPush()
      if (result.success) {
        showToast('success', 'Pushed', result.message)
        notifyGitOperation('push', true, result.message)
        fetchStatus()
      } else {
        showToast('error', 'Push failed', result.message)
        notifyGitOperation('push', false, result.message)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      showToast('error', 'Push failed', errorMsg)
      notifyGitOperation('push', false, errorMsg)
    } finally {
      setLoadingAction(null)
    }
  }

  const handlePull = async () => {
    setLoadingAction('pull')
    try {
      const result = await window.api.gitPull()
      if (result.success) {
        showToast('success', 'Pulled', result.message)
        notifyGitOperation('pull', true, result.message)
        fetchStatus()
      } else {
        showToast('error', 'Pull failed', result.message)
        notifyGitOperation('pull', false, result.message)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      showToast('error', 'Pull failed', errorMsg)
      notifyGitOperation('pull', false, errorMsg)
    } finally {
      setLoadingAction(null)
    }
  }

  // Not a git repository
  if (status === null) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-overlay/5 border border-overlay/10"
        role="status"
        aria-label="Not a git repository"
      >
        <GitBranch size={14} className="text-ink-subtle" aria-hidden="true" />
        <span className="text-xs text-ink-subtle">Not a git repo</span>
      </div>
    )
  }

  const hasChanges = status.dirty
  const totalChanges = status.staged + status.unstaged + status.untracked

  return (
    <>
      <div
        className="flex items-center gap-1.5"
        role="toolbar"
        aria-label="Git actions"
      >
        {/* Branch indicator */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
            hasChanges
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-overlay/5 border-overlay/10 text-ink-muted'
          }`}
          role="status"
          aria-label={`Git branch: ${status.branch}${hasChanges ? `, ${totalChanges} changes` : ''}${status.ahead > 0 ? `, ${status.ahead} commits ahead` : ''}${status.behind > 0 ? `, ${status.behind} commits behind` : ''}`}
        >
          <GitBranch size={14} aria-hidden="true" />
          <span className="text-xs font-medium max-w-[100px] truncate">{status.branch}</span>

          {/* Status indicators */}
          {hasChanges && (
            <span className="flex items-center gap-1 ml-1" aria-hidden="true">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs">{totalChanges}</span>
            </span>
          )}

          {status.ahead > 0 && (
            <span className="text-xs text-green-400" title={`${status.ahead} ahead`} aria-hidden="true">
              +{status.ahead}
            </span>
          )}

          {status.behind > 0 && (
            <span className="text-xs text-yellow-400" title={`${status.behind} behind`} aria-hidden="true">
              -{status.behind}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 p-1 rounded-lg bg-overlay/5 border border-overlay/10">
          {/* Commit */}
          <button
            onClick={() => setShowCommitModal(true)}
            disabled={!hasChanges || loadingAction !== null}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus-ring ${
              hasChanges
                ? 'text-ink-bright hover:bg-accent/20 hover:text-accent'
                : 'text-ink-subtle cursor-not-allowed'
            }`}
            aria-label={hasChanges ? `Commit ${totalChanges} changes` : 'No changes to commit'}
            title="Commit changes"
          >
            {loadingAction === 'commit' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <GitCommit size={14} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Commit</span>
          </button>

          {/* Pull */}
          <button
            onClick={handlePull}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-muted hover:bg-overlay/10 hover:text-ink-bright transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
            aria-label="Pull changes from remote"
            title="Pull changes"
          >
            {loadingAction === 'pull' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Pull</span>
          </button>

          {/* Push */}
          <button
            onClick={handlePush}
            disabled={loadingAction !== null || status.ahead === 0}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus-ring ${
              status.ahead > 0
                ? 'text-green-400 hover:bg-green-500/20'
                : 'text-ink-subtle cursor-not-allowed'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={status.ahead > 0 ? `Push ${status.ahead} commit${status.ahead !== 1 ? 's' : ''} to remote` : 'Nothing to push'}
            title={status.ahead > 0 ? `Push ${status.ahead} commit(s)` : 'Nothing to push'}
          >
            {loadingAction === 'push' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={14} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Push</span>
            {status.ahead > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20" aria-hidden="true">
                {status.ahead}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchStatus}
            disabled={loadingAction !== null}
            className="p-1.5 rounded-md text-ink-subtle hover:bg-overlay/10 hover:text-ink-bright transition-all disabled:opacity-50 focus-ring"
            aria-label="Refresh git status"
            title="Refresh status"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Commit Modal */}
      <CommitModal
        isOpen={showCommitModal}
        onClose={() => setShowCommitModal(false)}
        onCommit={handleCommit}
        isLoading={loadingAction === 'commit'}
        status={status}
      />
    </>
  )
}
