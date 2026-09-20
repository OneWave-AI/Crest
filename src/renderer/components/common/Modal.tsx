import { useEffect, useCallback, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showClose?: boolean
  closeOnBackdrop?: boolean
  children: React.ReactNode
  /** Optional ID for the modal description element */
  ariaDescribedBy?: string
  /** Show keyboard hint badge */
  showKeyboardHint?: boolean
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl'
}

export default function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  showClose = true,
  closeOnBackdrop = true,
  children,
  ariaDescribedBy,
  showKeyboardHint = true
}: ModalProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Use focus trap hook
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, {
    restoreFocus: true,
    autoFocus: true
  })

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
    } else {
      setIsVisible(false)
      // Wait for animation to complete before unmounting
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle escape key
  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleEscapeKey)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen, handleEscapeKey])

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnBackdrop && event.target === event.currentTarget) {
        onClose()
      }
    },
    [closeOnBackdrop, onClose]
  )

  // Handle focus state for glow effect
  const handleFocus = useCallback(() => setIsFocused(true), [])
  const handleBlur = useCallback(() => setIsFocused(false), [])

  // Don't render if not open and not animating
  if (!isOpen && !isAnimating) {
    return null
  }

  const titleId = title ? 'modal-title' : undefined

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={ariaDescribedBy}
    >
      {/* Backdrop with radial gradient blur - darker at edges */}
      <div
        className={`absolute inset-0 transition-all duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: `
            radial-gradient(
              ellipse at center,
              rgba(0, 0, 0, 0.5) 0%,
              rgba(0, 0, 0, 0.7) 50%,
              rgba(0, 0, 0, 0.85) 100%
            )
          `,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        ref={(node) => {
          // Combine refs
          if (focusTrapRef) {
            (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node
          }
          (modalRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`relative w-full ${sizeClasses[size]} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-[0.97] translate-y-3'
        }`}
        style={{
          background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.98) 0%, rgba(10, 10, 10, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: `
            0 0 0 1px rgba(0, 0, 0, 0.5),
            0 25px 50px -12px rgba(0, 0, 0, 0.7),
            0 0 100px -20px rgba(204, 120, 92, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.05)
            ${isFocused ? ', 0 0 0 2px rgba(204, 120, 92, 0.3), 0 0 40px rgba(204, 120, 92, 0.15)' : ''}
          `
        }}
      >
        {/* Subtle top glow accent */}
        <div
          className="absolute -top-px left-1/2 -translate-x-1/2 w-1/2 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(204, 120, 92, 0.5), transparent)'
          }}
          aria-hidden="true"
        />

        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            {title && (
              <h2
                id={titleId}
                className="text-lg font-semibold text-white"
              >
                {title}
              </h2>
            )}
            <div className="flex items-center gap-3 ml-auto">
              {/* Keyboard hint badge */}
              {showKeyboardHint && (
                <kbd
                  className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-gray-500 font-medium transition-colors"
                  aria-label="Press Escape to close"
                >
                  <span className="text-[9px]">ESC</span>
                  <span className="text-gray-600">to close</span>
                </kbd>
              )}
              {showClose && (
                <button
                  onClick={onClose}
                  className="group p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200 btn-scale-hover focus-ring"
                  aria-label="Close modal"
                >
                  <X
                    size={18}
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:rotate-90"
                  />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body with smooth content transition */}
        <div
          className={`p-6 transition-all duration-300 delay-75 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// Reusable modal button component with micro-interactions
interface ModalButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost'
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

export function ModalButton({
  variant = 'secondary',
  children,
  onClick,
  disabled = false,
  className = '',
  type = 'button'
}: ModalButtonProps) {
  const baseStyles = `
    relative px-4 py-2.5 text-sm font-medium rounded-xl
    transition-all duration-200 ease-out
    focus-ring
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
  `

  const variantStyles = {
    primary: `
      text-white
      bg-gradient-to-r from-accent to-accent-600
      hover:from-[#d8866a] hover:to-accent
      shadow-lg shadow-accent/20
      hover:shadow-xl hover:shadow-accent/30
      active:scale-[0.98]
      hover:scale-[1.02]
    `,
    secondary: `
      text-gray-300
      bg-white/[0.05]
      border border-white/[0.08]
      hover:bg-white/[0.08]
      hover:border-white/[0.12]
      hover:text-white
      active:scale-[0.98]
      hover:scale-[1.01]
    `,
    ghost: `
      text-gray-400
      hover:text-white
      hover:bg-white/[0.05]
      active:scale-[0.98]
    `
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// Modal footer component for consistent button layout
interface ModalFooterProps {
  children: React.ReactNode
  className?: string
}

export function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div
      className={`flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06] mt-4 -mx-6 -mb-6 px-6 py-4 bg-black/20 rounded-b-2xl ${className}`}
    >
      {children}
    </div>
  )
}

// Scrollable modal content with fade edges
interface ModalScrollContentProps {
  children: React.ReactNode
  maxHeight?: string
  className?: string
}

export function ModalScrollContent({
  children,
  maxHeight = '400px',
  className = ''
}: ModalScrollContentProps) {
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkScroll = () => {
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
        setShowTopFade(scrollTop > 10)
        setShowBottomFade(scrollTop < scrollHeight - clientHeight - 10)
      }
    }

    const scrollEl = scrollRef.current
    if (scrollEl) {
      checkScroll()
      scrollEl.addEventListener('scroll', checkScroll)
      return () => scrollEl.removeEventListener('scroll', checkScroll)
    }
  }, [children])

  return (
    <div className={`relative ${className}`}>
      {/* Top fade */}
      <div
        className={`absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[#0d0d0d] to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
          showTopFade ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="overflow-y-auto scroll-smooth"
        style={{ maxHeight }}
      >
        {children}
      </div>

      {/* Bottom fade */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0d0d0d] to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
          showBottomFade ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
    </div>
  )
}
