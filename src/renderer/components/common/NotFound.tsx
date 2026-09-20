import { FileQuestion, Home, ArrowLeft, Search } from 'lucide-react'

interface NotFoundProps {
  title?: string
  message?: string
  resourceType?: 'page' | 'file' | 'conversation' | 'skill' | 'resource'
  resourceId?: string
  onBack?: () => void
  onHome?: () => void
  onSearch?: () => void
  className?: string
}

const resourceMessages: Record<string, { title: string; message: string }> = {
  page: {
    title: 'Page Not Found',
    message: "The page you're looking for doesn't exist or has been moved."
  },
  file: {
    title: 'File Not Found',
    message: "The file you're looking for doesn't exist or may have been deleted."
  },
  conversation: {
    title: 'Conversation Not Found',
    message: "This conversation doesn't exist or may have been deleted."
  },
  skill: {
    title: 'Skill Not Found',
    message: "This skill doesn't exist or may have been removed."
  },
  resource: {
    title: 'Resource Not Found',
    message: "The requested resource couldn't be found."
  }
}

export default function NotFound({
  title,
  message,
  resourceType = 'resource',
  resourceId,
  onBack,
  onHome,
  onSearch,
  className = ''
}: NotFoundProps) {
  const defaultMessages = resourceMessages[resourceType] || resourceMessages.resource
  const displayTitle = title || defaultMessages.title
  const displayMessage = message || defaultMessages.message

  return (
    <div className={`flex flex-col items-center justify-center min-h-[400px] py-16 px-8 ${className}`}>
      <div className="w-full max-w-md text-center">
        {/* 404 Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-6">
          404
        </div>

        {/* Icon */}
        <div className="relative inline-flex mb-6">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-accent/20 blur-2xl scale-150" />

          {/* Icon circle */}
          <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-b from-surface-4 to-surface-3 border border-overlay/10 shadow-lg">
            <FileQuestion size={40} className="text-ink-subtle" />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-2xl font-bold text-ink-bright mb-3">
          {displayTitle}
        </h2>

        <p className="text-ink-muted mb-2">
          {displayMessage}
        </p>

        {resourceId && (
          <p className="text-xs text-ink-subtle font-mono mb-6">
            ID: {resourceId}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-600 text-white font-medium transition-all duration-200 shadow-[0_0_20px_rgba(204,120,92,0.2)] hover:shadow-[0_0_30px_rgba(204,120,92,0.3)]"
            >
              <ArrowLeft size={18} />
              Go Back
            </button>
          )}

          {onHome && (
            <button
              onClick={onHome}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-overlay/5 hover:bg-overlay/10 text-ink hover:text-ink-bright font-medium transition-all duration-200 border border-overlay/10"
            >
              <Home size={18} />
              Home
            </button>
          )}

          {onSearch && (
            <button
              onClick={onSearch}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-overlay/5 hover:bg-overlay/10 text-ink hover:text-ink-bright font-medium transition-all duration-200 border border-overlay/10"
            >
              <Search size={18} />
              Search
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Preset not found states
export function FileNotFound({
  filePath,
  onBack,
  onHome
}: {
  filePath?: string
  onBack?: () => void
  onHome?: () => void
}) {
  return (
    <NotFound
      resourceType="file"
      resourceId={filePath}
      onBack={onBack}
      onHome={onHome}
    />
  )
}

export function ConversationNotFound({
  conversationId,
  onBack,
  onHome
}: {
  conversationId?: string
  onBack?: () => void
  onHome?: () => void
}) {
  return (
    <NotFound
      resourceType="conversation"
      resourceId={conversationId}
      onBack={onBack}
      onHome={onHome}
    />
  )
}

export function SkillNotFound({
  skillId,
  onBack,
  onHome
}: {
  skillId?: string
  onBack?: () => void
  onHome?: () => void
}) {
  return (
    <NotFound
      resourceType="skill"
      resourceId={skillId}
      onBack={onBack}
      onHome={onHome}
    />
  )
}
