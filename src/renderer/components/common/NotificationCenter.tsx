import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings2,
  Volume2,
  VolumeX,
  ChevronRight,
  Clock
} from 'lucide-react'
import { useNotificationStore, NotificationType, Notification } from '../../store/notificationStore'

interface NotificationCenterProps {
  onNavigate?: (screen: string) => void
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

// Group notifications by time period
function groupNotificationsByTime(notifications: Notification[]): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>()
  const now = Date.now()
  const today = new Date().setHours(0, 0, 0, 0)
  const yesterday = today - 86400000 // 24 hours in ms
  const thisWeek = today - 604800000 // 7 days in ms

  for (const notification of notifications) {
    let groupKey: string

    if (notification.timestamp >= today) {
      groupKey = 'Today'
    } else if (notification.timestamp >= yesterday) {
      groupKey = 'Yesterday'
    } else if (notification.timestamp >= thisWeek) {
      groupKey = 'This Week'
    } else {
      groupKey = 'Earlier'
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(notification)
  }

  return groups
}

// Icon mapping for notification types
const typeIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  system: Settings2
} as const

// Color mapping for notification types
const typeColors: Record<NotificationType, { bg: string; icon: string; border: string }> = {
  info: {
    bg: 'bg-blue-500/10',
    icon: 'text-blue-400',
    border: 'border-blue-500/20'
  },
  success: {
    bg: 'bg-green-500/10',
    icon: 'text-green-400',
    border: 'border-green-500/20'
  },
  warning: {
    bg: 'bg-yellow-500/10',
    icon: 'text-yellow-400',
    border: 'border-yellow-500/20'
  },
  error: {
    bg: 'bg-red-500/10',
    icon: 'text-red-400',
    border: 'border-red-500/20'
  },
  system: {
    bg: 'bg-accent/10',
    icon: 'text-accent',
    border: 'border-accent/20'
  }
}

// Single notification item
interface NotificationItemProps {
  notification: Notification
  onMarkRead: (id: string) => void
  onRemove: (id: string) => void
  onNavigate?: (screen: string) => void
}

function NotificationItem({ notification, onMarkRead, onRemove, onNavigate }: NotificationItemProps) {
  const Icon = typeIcons[notification.type]
  const colors = typeColors[notification.type]

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification.id)
    }
    if (notification.navigateTo && onNavigate) {
      onNavigate(notification.navigateTo)
    }
  }

  return (
    <div
      className={`group relative flex items-start gap-3 p-3 rounded-xl transition-all duration-200 ${
        notification.read
          ? 'bg-overlay/[0.02] hover:bg-overlay/[0.04]'
          : 'bg-overlay/[0.04] hover:bg-overlay/[0.06]'
      } ${notification.navigateTo ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      role="article"
      aria-label={`${notification.type} notification: ${notification.title}`}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div
          className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <div className={`flex-shrink-0 p-2 rounded-lg ${colors.bg}`}>
        <Icon size={16} className={colors.icon} aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className={`text-sm font-medium ${notification.read ? 'text-ink-muted' : 'text-ink-bright'}`}>
            {notification.title}
          </h4>
          <span className="flex-shrink-0 text-[10px] text-ink-subtle">
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>
        {notification.message && (
          <p className={`text-xs mt-0.5 ${notification.read ? 'text-ink-subtle' : 'text-ink-muted'}`}>
            {notification.message}
          </p>
        )}
        {notification.navigateTo && (
          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-accent">
            <span>Go to {notification.navigateTo}</span>
            <ChevronRight size={10} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.read && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkRead(notification.id)
            }}
            className="p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/10 transition-colors"
            aria-label="Mark as read"
            title="Mark as read"
          >
            <Check size={12} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(notification.id)
          }}
          className="p-1.5 rounded-lg text-ink-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Remove notification"
          title="Remove"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export default function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | NotificationType>('all')
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const {
    notifications,
    soundEnabled,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    setSoundEnabled,
    getUnreadCount
  } = useNotificationStore()

  const unreadCount = getUnreadCount()

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  // Filter notifications by tab
  const filteredNotifications = activeTab === 'all'
    ? notifications
    : notifications.filter((n) => n.type === activeTab)

  // Group notifications
  const groupedNotifications = groupNotificationsByTime(filteredNotifications)

  // Tab options
  const tabs: Array<{ id: 'all' | NotificationType; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'error', label: 'Errors' },
    { id: 'warning', label: 'Warnings' },
    { id: 'success', label: 'Success' },
    { id: 'info', label: 'Info' },
    { id: 'system', label: 'System' }
  ]

  const handleNavigate = useCallback((screen: string) => {
    setIsOpen(false)
    onNavigate?.(screen)
  }, [onNavigate])

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-all duration-150 focus-ring ${
          isOpen
            ? 'bg-accent/20 text-accent'
            : 'text-ink-muted hover:bg-overlay/5 hover:text-ink-bright'
        }`}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Notifications"
      >
        <Bell size={16} aria-hidden="true" />

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium text-white bg-accent rounded-full animate-bounce-in"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[400px] max-h-[600px] bg-surface-4 border border-overlay/[0.08] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-fade-in-up"
          role="dialog"
          aria-label="Notification center"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-overlay/[0.06]">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-accent" aria-hidden="true" />
              <h3 className="font-medium text-ink-bright">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium text-accent bg-accent/10 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-1.5 rounded-lg transition-colors ${
                  soundEnabled
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-ink-subtle hover:bg-overlay/5 hover:text-ink-bright'
                }`}
                aria-label={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                title={soundEnabled ? 'Sound on' : 'Sound off'}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>

              {/* Mark All Read */}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/5 transition-colors"
                  aria-label="Mark all as read"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                </button>
              )}

              {/* Clear All */}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1.5 rounded-lg text-ink-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Clear all notifications"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-3 py-2 border-b border-overlay/[0.06] overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const count = tab.id === 'all'
                ? notifications.length
                : notifications.filter((n) => n.type === tab.id).length

              if (tab.id !== 'all' && count === 0) return null

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-accent/20 text-accent'
                      : 'text-ink-subtle hover:text-ink-bright hover:bg-overlay/5'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-60">({count})</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Notifications List */}
          <div className="max-h-[440px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-2xl bg-overlay/[0.02] mb-3">
                  <Bell size={24} className="text-ink-faint" />
                </div>
                <p className="text-sm text-ink-subtle">No notifications</p>
                <p className="text-xs text-ink-faint mt-1">
                  {activeTab === 'all'
                    ? "You're all caught up!"
                    : `No ${activeTab} notifications`}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-4">
                {Array.from(groupedNotifications.entries()).map(([group, items]) => (
                  <div key={group}>
                    {/* Group Header */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <Clock size={10} className="text-ink-faint" />
                      <span className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider">
                        {group}
                      </span>
                      <div className="flex-1 h-px bg-overlay/[0.04]" />
                    </div>

                    {/* Items */}
                    <div className="space-y-1">
                      {items.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={markAsRead}
                          onRemove={removeNotification}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-overlay/[0.06] bg-overlay/[0.01]">
              <p className="text-[10px] text-ink-faint text-center">
                Showing {filteredNotifications.length} of {notifications.length} notifications
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
