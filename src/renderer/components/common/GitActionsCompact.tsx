import { useState, useEffect, useCallback } from 'react'
import {
  GitCommit,
  Upload,
  Download,
  GitBranch,
  X,
  Check,
  Loader2,
  RefreshCw,
  ChevronDown
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
        className="relative w-full max-w-md mx-4 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] rounded-2xl border border-white/10 shadow-2xl shadow-black/50 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/20" aria-hidden="true">
              <GitCommit size={18} className="text-accent" />
            </div>
            <div>
              <h2 id="commit-dialog-title" className="text-lg font-semibold text-white">Commit Changes</h2>
              <p className="text-xs text-gray-400">
                {totalChanges} file{totalChanges !== 1 ? 's' : ''} to commit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus-ring"
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
                <span className="text-gray-400">{status.untracked} untracked</span>
              )}
            </div>
          )}

          {/* Message input */}
          <div className="space-y-2">
            <label htmlFor="commit-message" className="block text-sm font-medium text-gray-300">
              Commit message
            </label>
            <textarea
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              autoFocus
              rows={4}
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
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

export default function GitActionsCompact() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [showCommitModal, setShowCommitModal] = useState(false)
  const [expanded, setExpanded] = useState(false)

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
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 text-gray-500"
        role="status"
        aria-label="Not a git repository"
      >
        <GitBranch size={12} aria-hidden="true" />
        <span className="text-[10px]">No git</span>
      </div>
    )
  }

  const hasChanges = status.dirty
  const totalChanges = status.staged + status.unstaged + status.untracked

  return (
    <>
      <div
        className="flex items-center"
        role="toolbar"
        aria-label="Git actions"
      >
        {/* Compact branch indicator with expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all text-xs ${
            hasChanges
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
          aria-label={`Git: ${status.branch}${hasChanges ? `, ${totalChanges} changes` : ''}. Click to ${expanded ? 'collapse' : 'expand'}`}
          aria-expanded={expanded}
        >
          <GitBranch size={12} aria-hidden="true" />
          <span className="max-w-[60px] truncate font-medium">{status.branch}</span>

          {/* Status indicators */}
          {hasChanges && (
            <span className="flex items-center gap-0.5" aria-hidden="true">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px]">{totalChanges}</span>
            </span>
          )}

          {status.ahead > 0 && (
            <span className="text-[10px] text-green-400" aria-hidden="true">
              +{status.ahead}
            </span>
          )}

          {status.behind > 0 && (
            <span className="text-[10px] text-yellow-400" aria-hidden="true">
              -{status.behind}
            </span>
          )}

          <ChevronDown
            size={10}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {/* Expanded action buttons */}
        {expanded && (
          <div className="flex items-center gap-0.5 ml-1 p-0.5 rounded-lg bg-white/5 border border-white/10 animate-fade-in">
            {/* Commit */}
            <button
              onClick={() => setShowCommitModal(true)}
              disabled={!hasChanges || loadingAction !== null}
              className={`p-1.5 rounded-md transition-all focus-ring ${
                hasChanges
                  ? 'text-white hover:bg-accent/20 hover:text-accent'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              aria-label={hasChanges ? `Commit ${totalChanges} changes` : 'No changes to commit'}
              title="Commit"
            >
              {loadingAction === 'commit' ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <GitCommit size={12} aria-hidden="true" />
              )}
            </button>

            {/* Pull */}
            <button
              onClick={handlePull}
              disabled={loadingAction !== null}
              className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
              aria-label="Pull changes"
              title="Pull"
            >
              {loadingAction === 'pull' ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={12} aria-hidden="true" />
              )}
            </button>

            {/* Push */}
            <button
              onClick={handlePush}
              disabled={loadingAction !== null || status.ahead === 0}
              className={`p-1.5 rounded-md transition-all focus-ring ${
                status.ahead > 0
                  ? 'text-green-400 hover:bg-green-500/20'
                  : 'text-gray-600 cursor-not-allowed'
              } disabled:opacity-50`}
              aria-label={status.ahead > 0 ? `Push ${status.ahead} commit(s)` : 'Nothing to push'}
              title={status.ahead > 0 ? `Push (${status.ahead})` : 'Nothing to push'}
            >
              {loadingAction === 'push' ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload size={12} aria-hidden="true" />
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchStatus}
              disabled={loadingAction !== null}
              className="p-1.5 rounded-md text-gray-500 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 focus-ring"
              aria-label="Refresh git status"
              title="Refresh"
            >
              <RefreshCw size={10} aria-hidden="true" />
            </button>
          </div>
        )}
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
