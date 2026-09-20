import { ReactNode } from 'react'
import { Inbox, FolderOpen, FileText, Search, Package } from 'lucide-react'

type EmptyStateVariant = 'default' | 'folder' | 'file' | 'search' | 'package'

interface EmptyStateProps {
  variant?: EmptyStateVariant
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

const variantIcons: Record<EmptyStateVariant, typeof Inbox> = {
  default: Inbox,
  folder: FolderOpen,
  file: FileText,
  search: Search,
  package: Package
}

export default function EmptyState({
  variant = 'default',
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = ''
}: EmptyStateProps) {
  const IconComponent = variantIcons[variant]

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-8 ${className}`}>
      {/* Icon Container */}
      <div className="relative mb-6">
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl scale-150" />

        {/* Icon circle */}
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-b from-surface-4 to-surface-3 border border-overlay/10 shadow-lg">
          {icon || <IconComponent size={32} className="text-ink-subtle" />}
        </div>
      </div>

      {/* Text */}
      <h3 className="text-lg font-semibold text-ink-bright mb-2 text-center">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-ink-muted text-center max-w-sm mb-6">
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-600 text-white font-medium transition-all duration-200 shadow-[0_0_20px_rgba(204,120,92,0.2)] hover:shadow-[0_0_30px_rgba(204,120,92,0.3)]"
            >
              {action.label}
            </button>
          )}

          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-overlay/5 hover:bg-overlay/10 text-ink hover:text-ink-bright font-medium transition-all duration-200 border border-overlay/10"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Preset empty states for common use cases
export function NoFilesEmptyState({ onSelectFolder }: { onSelectFolder?: () => void }) {
  return (
    <EmptyState
      variant="folder"
      title="No files found"
      description="Select a folder to view its contents or start a new project."
      action={onSelectFolder ? { label: 'Select Folder', onClick: onSelectFolder } : undefined}
    />
  )
}

export function NoSearchResultsEmptyState({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <EmptyState
      variant="search"
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try a different search term.`}
      action={onClear ? { label: 'Clear Search', onClick: onClear } : undefined}
    />
  )
}

export function NoConversationsEmptyState({ onStartNew }: { onStartNew?: () => void }) {
  return (
    <EmptyState
      variant="default"
      title="No conversations yet"
      description="Start a new Claude session to begin chatting and exploring your codebase."
      action={onStartNew ? { label: 'Start New Session', onClick: onStartNew } : undefined}
    />
  )
}

export function NoSkillsEmptyState({ onInstall, onCreate }: { onInstall?: () => void; onCreate?: () => void }) {
  return (
    <EmptyState
      variant="package"
      title="No skills installed"
      description="Skills extend Claude's capabilities. Install the starter kit or create your own custom skills."
      action={onInstall ? { label: 'Install Starter Kit', onClick: onInstall } : undefined}
      secondaryAction={onCreate ? { label: 'Create Skill', onClick: onCreate } : undefined}
    />
  )
}
