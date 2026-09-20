import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

// Map toast type to ARIA role
const getAriaRole = (type: ToastType): 'status' | 'alert' => {
  // Errors and warnings should interrupt screen readers
  return type === 'error' || type === 'warning' ? 'alert' : 'status'
}

// Map toast type to politeness level
const getAriaPoliteness = (type: ToastType): 'polite' | 'assertive' => {
  return type === 'error' || type === 'warning' ? 'assertive' : 'polite'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const announcerRef = useRef<HTMLDivElement>(null)

  const showToast = useCallback((type: ToastType, title: string, message?: string, duration = 4000) => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, type, title, message, duration }])

    // Announce to screen readers via live region
    if (announcerRef.current) {
      const announcement = message ? `${title}. ${message}` : title
      announcerRef.current.textContent = ''
      requestAnimationFrame(() => {
        if (announcerRef.current) {
          announcerRef.current.textContent = announcement
        }
      })
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Live region for screen reader announcements */}
      <div
        ref={announcerRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true))

    // Auto dismiss
    const timer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => onRemove(toast.id), 300)
    }, toast.duration || 4000)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  }

  const colors = {
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      icon: 'text-green-400',
      glow: 'shadow-[0_0_30px_rgba(34,197,94,0.15)]'
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      icon: 'text-red-400',
      glow: 'shadow-[0_0_30px_rgba(239,68,68,0.15)]'
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      icon: 'text-yellow-400',
      glow: 'shadow-[0_0_30px_rgba(234,179,8,0.15)]'
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      icon: 'text-blue-400',
      glow: 'shadow-[0_0_30px_rgba(59,130,246,0.15)]'
    }
  }

  const Icon = icons[toast.type]
  const color = colors[toast.type]
  const ariaRole = getAriaRole(toast.type)
  const ariaPoliteness = getAriaPoliteness(toast.type)

  // Add type-specific entrance animation
  const entranceAnimation = toast.type === 'success'
    ? 'animate-bounce-in'
    : toast.type === 'error'
    ? 'animate-shake'
    : ''

  return (
    <div
      role={ariaRole}
      aria-live={ariaPoliteness}
      aria-atomic="true"
      className={`pointer-events-auto flex items-start gap-3 min-w-[320px] max-w-[420px] p-4 rounded-xl border backdrop-blur-xl transition-all duration-300 ${
        color.bg
      } ${color.border} ${color.glow} ${
        isVisible && !isLeaving
          ? `opacity-100 translate-x-0 ${entranceAnimation}`
          : 'opacity-0 translate-x-8'
      }`}
    >
      <Icon size={20} className={`flex-shrink-0 ${color.icon} ${toast.type === 'success' && isVisible ? 'animate-success-pop' : ''}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink-bright text-sm">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-ink-muted mt-0.5">{toast.message}</div>
        )}
      </div>
      <button
        onClick={() => {
          setIsLeaving(true)
          setTimeout(() => onRemove(toast.id), 300)
        }}
        className="flex-shrink-0 p-1 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/10 transition-colors focus-ring"
        aria-label={`Dismiss ${toast.title} notification`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
