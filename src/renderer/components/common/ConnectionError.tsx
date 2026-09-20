import { Wifi, WifiOff, RotateCcw, RefreshCcw, Cloud, CloudOff, Server } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

type ConnectionType = 'network' | 'server' | 'ipc' | 'timeout'

interface ConnectionErrorProps {
  type?: ConnectionType
  title?: string
  message?: string
  onRetry?: () => void
  onCancel?: () => void
  autoRetry?: boolean
  autoRetryInterval?: number
  maxRetries?: number
  className?: string
}

const connectionConfig: Record<ConnectionType, {
  icon: typeof Wifi
  iconOff: typeof WifiOff
  title: string
  message: string
  bgColor: string
  borderColor: string
  iconColor: string
}> = {
  network: {
    icon: Wifi,
    iconOff: WifiOff,
    title: 'No Internet Connection',
    message: 'Please check your internet connection and try again.',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    iconColor: 'text-yellow-400'
  },
  server: {
    icon: Cloud,
    iconOff: CloudOff,
    title: 'Server Unavailable',
    message: 'Unable to connect to the server. It may be temporarily unavailable.',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    iconColor: 'text-orange-400'
  },
  ipc: {
    icon: Server,
    iconOff: Server,
    title: 'Application Error',
    message: 'Lost connection to the application backend. Please restart the app.',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    iconColor: 'text-red-400'
  },
  timeout: {
    icon: RefreshCcw,
    iconOff: RefreshCcw,
    title: 'Request Timed Out',
    message: 'The request took too long to complete. Please try again.',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-400'
  }
}

export default function ConnectionError({
  type = 'network',
  title,
  message,
  onRetry,
  onCancel,
  autoRetry = false,
  autoRetryInterval = 5000,
  maxRetries = 3,
  className = ''
}: ConnectionErrorProps) {
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const config = connectionConfig[type]
  const IconOff = config.iconOff
  const displayTitle = title || config.title
  const displayMessage = message || config.message

  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying) return

    setIsRetrying(true)
    setRetryCount(prev => prev + 1)

    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }, [onRetry, isRetrying])

  // Auto-retry logic
  useEffect(() => {
    if (!autoRetry || !onRetry || retryCount >= maxRetries) return

    setCountdown(Math.ceil(autoRetryInterval / 1000))

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          handleRetry()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownInterval)
  }, [autoRetry, autoRetryInterval, maxRetries, retryCount, handleRetry, onRetry])

  const hasReachedMaxRetries = retryCount >= maxRetries

  return (
    <div className={`flex flex-col items-center justify-center min-h-[300px] py-12 px-8 ${className}`}>
      <div className="w-full max-w-md">
        {/* Error Card */}
        <div className={`rounded-2xl border ${config.bgColor} ${config.borderColor} shadow-lg overflow-hidden`}>
          {/* Animated Header */}
          <div className="flex flex-col items-center pt-8 pb-4">
            {/* Animated Icon */}
            <div className="relative mb-4">
              {/* Pulse animation */}
              {!hasReachedMaxRetries && (
                <div className={`absolute inset-0 rounded-full ${config.bgColor} animate-ping opacity-50`} />
              )}

              <div className={`relative flex items-center justify-center w-16 h-16 rounded-2xl ${config.bgColor} border ${config.borderColor}`}>
                <IconOff
                  size={32}
                  className={`${config.iconColor} ${isRetrying ? 'animate-pulse' : ''}`}
                />
              </div>
            </div>

            {/* Status */}
            <h3 className="text-lg font-semibold text-white mb-1">
              {displayTitle}
            </h3>
            <p className="text-sm text-gray-400 text-center px-6">
              {displayMessage}
            </p>
          </div>

          {/* Retry Status */}
          {autoRetry && !hasReachedMaxRetries && (
            <div className="px-6 pb-4">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                {isRetrying ? (
                  <>
                    <RotateCcw size={14} className="animate-spin" />
                    <span>Retrying...</span>
                  </>
                ) : countdown > 0 ? (
                  <span>Retrying in {countdown}s... (Attempt {retryCount + 1}/{maxRetries})</span>
                ) : null}
              </div>
            </div>
          )}

          {/* Max retries reached */}
          {hasReachedMaxRetries && autoRetry && (
            <div className="px-6 pb-4">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-sm text-red-400">
                  Maximum retry attempts reached. Please try again later.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 p-6 pt-2">
            {onRetry && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-600 disabled:bg-accent/50 text-white font-medium text-sm transition-all duration-200 shadow-[0_0_20px_rgba(204,120,92,0.2)] hover:shadow-[0_0_30px_rgba(204,120,92,0.3)] disabled:shadow-none"
              >
                {isRetrying ? (
                  <>
                    <RotateCcw size={16} className="animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    Try Again
                  </>
                )}
              </button>
            )}

            {onCancel && (
              <button
                onClick={onCancel}
                disabled={isRetrying}
                className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:bg-white/5 text-gray-300 hover:text-white disabled:text-gray-500 font-medium text-sm transition-all duration-200 border border-white/10"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Help text */}
        {type === 'network' && (
          <p className="text-center text-xs text-gray-500 mt-4">
            Try checking your Wi-Fi or Ethernet connection
          </p>
        )}

        {type === 'ipc' && (
          <p className="text-center text-xs text-gray-500 mt-4">
            If this persists, try restarting the application
          </p>
        )}
      </div>
    </div>
  )
}

// Preset connection errors
export function NetworkOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <ConnectionError
      type="network"
      onRetry={onRetry}
      autoRetry
      autoRetryInterval={10000}
      maxRetries={5}
    />
  )
}

export function ServerDown({ onRetry, onCancel }: { onRetry?: () => void; onCancel?: () => void }) {
  return (
    <ConnectionError
      type="server"
      onRetry={onRetry}
      onCancel={onCancel}
      autoRetry
      autoRetryInterval={5000}
      maxRetries={3}
    />
  )
}

export function IpcDisconnected({ onRetry }: { onRetry?: () => void }) {
  return (
    <ConnectionError
      type="ipc"
      onRetry={onRetry}
    />
  )
}

export function RequestTimeout({ onRetry, onCancel }: { onRetry?: () => void; onCancel?: () => void }) {
  return (
    <ConnectionError
      type="timeout"
      onRetry={onRetry}
      onCancel={onCancel}
    />
  )
}
