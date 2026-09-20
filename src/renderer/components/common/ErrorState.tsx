import { ReactNode } from 'react'
import { AlertCircle, RotateCcw, XCircle, AlertTriangle } from 'lucide-react'

type ErrorSeverity = 'error' | 'warning' | 'critical'

interface ErrorStateProps {
  title?: string
  message: string
  severity?: ErrorSeverity
  icon?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  details?: string
  className?: string
}

const severityConfig: Record<ErrorSeverity, {
  icon: typeof AlertCircle
  bgColor: string
  borderColor: string
  iconColor: string
  glowColor: string
}> = {
  error: {
    icon: XCircle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    iconColor: 'text-red-400',
    glowColor: 'shadow-[0_0_30px_rgba(239,68,68,0.1)]'
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    iconColor: 'text-yellow-400',
    glowColor: 'shadow-[0_0_30px_rgba(234,179,8,0.1)]'
  },
  critical: {
    icon: AlertCircle,
    bgColor: 'bg-red-600/15',
    borderColor: 'border-red-600/30',
    iconColor: 'text-red-500',
    glowColor: 'shadow-[0_0_40px_rgba(220,38,38,0.15)]'
  }
}

export default function ErrorState({
  title = 'Something went wrong',
  message,
  severity = 'error',
  icon,
  onRetry,
  retryLabel = 'Try Again',
  secondaryAction,
  details,
  className = ''
}: ErrorStateProps) {
  const config = severityConfig[severity]
  const IconComponent = config.icon

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-8 ${className}`}>
      <div className="w-full max-w-md">
        {/* Error Card */}
        <div className={`rounded-2xl border ${config.bgColor} ${config.borderColor} ${config.glowColor} overflow-hidden`}>
          {/* Header */}
          <div className="flex items-start gap-4 p-6">
            <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${config.bgColor} ${config.borderColor} border flex-shrink-0`}>
              {icon || <IconComponent size={24} className={config.iconColor} />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white mb-1">
                {title}
              </h3>
              <p className="text-sm text-gray-400 break-words">
                {message}
              </p>
            </div>
          </div>

          {/* Details (optional) */}
          {details && (
            <div className="px-6 pb-4">
              <div className="p-3 rounded-xl bg-[#0d0d0d] border border-white/5">
                <pre className="text-xs text-gray-500 font-mono whitespace-pre-wrap break-all">
                  {details}
                </pre>
              </div>
            </div>
          )}

          {/* Actions */}
          {(onRetry || secondaryAction) && (
            <div className="flex gap-3 p-6 pt-0">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-600 text-white font-medium text-sm transition-all duration-200 shadow-[0_0_20px_rgba(204,120,92,0.2)] hover:shadow-[0_0_30px_rgba(204,120,92,0.3)]"
                >
                  <RotateCcw size={16} />
                  {retryLabel}
                </button>
              )}
              {secondaryAction && (
                <button
                  onClick={secondaryAction.onClick}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium text-sm transition-all duration-200 border border-white/10"
                >
                  {secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Preset error states for common use cases
export function ApiError({
  message,
  onRetry,
  endpoint
}: {
  message: string
  onRetry?: () => void
  endpoint?: string
}) {
  return (
    <ErrorState
      title="API Error"
      message={message}
      severity="error"
      onRetry={onRetry}
      details={endpoint ? `Endpoint: ${endpoint}` : undefined}
    />
  )
}

export function IpcError({
  message,
  channel,
  onRetry
}: {
  message: string
  channel?: string
  onRetry?: () => void
}) {
  return (
    <ErrorState
      title="Communication Error"
      message={message || 'Failed to communicate with the application backend.'}
      severity="error"
      onRetry={onRetry}
      details={channel ? `IPC Channel: ${channel}` : undefined}
    />
  )
}

export function LoadingError({
  resource,
  onRetry
}: {
  resource: string
  onRetry?: () => void
}) {
  return (
    <ErrorState
      title={`Failed to load ${resource}`}
      message={`We encountered an error while loading ${resource}. Please try again.`}
      severity="error"
      onRetry={onRetry}
    />
  )
}

export function PermissionError({
  action,
  onRetry,
  onRequestPermission
}: {
  action: string
  onRetry?: () => void
  onRequestPermission?: () => void
}) {
  return (
    <ErrorState
      title="Permission Denied"
      message={`You don't have permission to ${action}.`}
      severity="warning"
      onRetry={onRetry}
      secondaryAction={onRequestPermission ? { label: 'Request Access', onClick: onRequestPermission } : undefined}
    />
  )
}
