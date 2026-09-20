import { useState, useEffect } from 'react'
import { ExternalLink, Eye, X } from 'lucide-react'

interface PreviewBarProps {
  url: string | null
  onDismiss: () => void
  onOpenPreview: (url: string) => void
  onOpenInBrowser: (url: string) => void
}

export default function PreviewBar({
  url,
  onDismiss,
  onOpenPreview,
  onOpenInBrowser
}: PreviewBarProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    if (url) {
      // Small delay for smooth animation in
      const timer = setTimeout(() => setIsVisible(true), 50)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
    }
  }, [url])

  const handleDismiss = () => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      setIsAnimatingOut(false)
      onDismiss()
    }, 200)
  }

  if (!url) return null

  return (
    <div
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-200 ease-out ${
        isVisible && !isAnimatingOut
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md"
        style={{
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          borderColor: 'rgba(204, 120, 92, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
        }}
      >
        {/* Accent glow effect */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(204, 120, 92, 0.1) 0%, transparent 70%)'
          }}
          aria-hidden="true"
        />

        {/* Status indicator */}
        <div className="relative flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: '#cc785c' }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-ink-muted">Preview available</span>
        </div>

        {/* URL display */}
        <div
          className="px-3 py-1 rounded-lg font-mono text-xs truncate max-w-[240px]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            color: '#cc785c'
          }}
          title={url}
        >
          {url}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenPreview(url)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 focus-ring"
            style={{
              backgroundColor: 'rgba(204, 120, 92, 0.15)',
              color: '#cc785c'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(204, 120, 92, 0.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(204, 120, 92, 0.15)'
            }}
            title="Open Preview"
          >
            <Eye size={12} />
            <span>Preview</span>
          </button>

          <button
            onClick={() => onOpenInBrowser(url)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 focus-ring"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#e0e0e0'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
            }}
            title="Open in Browser"
          >
            <ExternalLink size={12} />
            <span>Browser</span>
          </button>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/10 transition-all duration-200 focus-ring ml-1"
            title="Dismiss"
            aria-label="Dismiss preview bar"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
