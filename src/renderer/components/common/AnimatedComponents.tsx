import { ReactNode, forwardRef, useEffect, useState, useRef } from 'react'
import { useScrollAnimation, useStaggeredList, useAnimatedMount, useFeedbackAnimation, useRipple } from '../../hooks/useAnimations'
import { Check, X, AlertTriangle } from 'lucide-react'

/* ============================================
   PAGE TRANSITION WRAPPER
   ============================================ */

interface PageTransitionProps {
  children: ReactNode
  className?: string
  direction?: 'fade' | 'slide-up' | 'slide-left' | 'scale'
}

export function PageTransition({
  children,
  className = '',
  direction = 'fade'
}: PageTransitionProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    })
  }, [])

  const directionClasses = {
    fade: 'transition-opacity duration-300',
    'slide-up': 'transition-all duration-300',
    'slide-left': 'transition-all duration-300',
    scale: 'transition-all duration-300'
  }

  const hiddenClasses = {
    fade: 'opacity-0',
    'slide-up': 'opacity-0 translate-y-4',
    'slide-left': 'opacity-0 translate-x-4',
    scale: 'opacity-0 scale-95'
  }

  const visibleClasses = {
    fade: 'opacity-100',
    'slide-up': 'opacity-100 translate-y-0',
    'slide-left': 'opacity-100 translate-x-0',
    scale: 'opacity-100 scale-100'
  }

  return (
    <div
      className={`${directionClasses[direction]} ${
        isVisible ? visibleClasses[direction] : hiddenClasses[direction]
      } ${className}`}
    >
      {children}
    </div>
  )
}

/* ============================================
   ANIMATED LIST
   ============================================ */

interface AnimatedListProps {
  children: ReactNode[]
  className?: string
  itemClassName?: string
  staggerDelay?: number
  direction?: 'up' | 'left' | 'fade'
}

export function AnimatedList({
  children,
  className = '',
  itemClassName = '',
  staggerDelay = 50,
  direction = 'up'
}: AnimatedListProps) {
  const [containerRef, visibleItems] = useStaggeredList<HTMLDivElement>(
    children.length,
    { staggerDelay }
  )

  const getDirectionClasses = (isVisible: boolean) => {
    const base = 'transition-all duration-300'
    if (direction === 'up') {
      return `${base} ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`
    }
    if (direction === 'left') {
      return `${base} ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'}`
    }
    return `${base} ${isVisible ? 'opacity-100' : 'opacity-0'}`
  }

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className={className}>
      {children.map((child, index) => (
        <div
          key={index}
          className={`${getDirectionClasses(visibleItems[index])} ${itemClassName}`}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/* ============================================
   SCROLL REVEAL
   ============================================ */

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade' | 'scale'
  delay?: number
  threshold?: number
}

export function ScrollReveal({
  children,
  className = '',
  direction = 'up',
  delay = 0,
  threshold = 0.1
}: ScrollRevealProps) {
  const [ref, isVisible] = useScrollAnimation<HTMLDivElement>({
    threshold,
    delay,
    triggerOnce: true
  })

  const getDirectionClasses = () => {
    const base = 'transition-all duration-500 ease-out'
    const transforms = {
      up: isVisible ? 'translate-y-0' : 'translate-y-8',
      down: isVisible ? 'translate-y-0' : '-translate-y-8',
      left: isVisible ? 'translate-x-0' : 'translate-x-8',
      right: isVisible ? 'translate-x-0' : '-translate-x-8',
      fade: '',
      scale: isVisible ? 'scale-100' : 'scale-95'
    }

    return `${base} ${transforms[direction]} ${isVisible ? 'opacity-100' : 'opacity-0'}`
  }

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={`${getDirectionClasses()} ${className}`}>
      {children}
    </div>
  )
}

/* ============================================
   ANIMATED MODAL / PANEL WRAPPER
   ============================================ */

interface AnimatedPanelProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  position?: 'right' | 'left' | 'center'
  className?: string
}

export function AnimatedPanel({
  isOpen,
  onClose,
  children,
  position = 'right',
  className = ''
}: AnimatedPanelProps) {
  const { shouldRender, isVisible } = useAnimatedMount(isOpen, { duration: 300 })

  if (!shouldRender) return null

  const positionClasses = {
    right: `fixed inset-y-0 right-0 ${isVisible ? 'translate-x-0' : 'translate-x-full'}`,
    left: `fixed inset-y-0 left-0 ${isVisible ? 'translate-x-0' : '-translate-x-full'}`,
    center: `fixed inset-0 flex items-center justify-center`
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`z-50 transition-transform duration-300 ease-out ${positionClasses[position]} ${className}`}
      >
        {position === 'center' ? (
          <div
            className={`transition-all duration-300 ${
              isVisible
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-95 translate-y-4'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </>
  )
}

/* ============================================
   ANIMATED BUTTON WITH RIPPLE
   ============================================ */

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
  iconHover?: 'bounce' | 'rotate' | 'pulse' | 'none'
  children: ReactNode
}

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      glow = false,
      iconHover = 'none',
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const [ripples, addRipple] = useRipple()

    const variantClasses = {
      primary:
        'bg-accent text-white hover:bg-accent-400 border-transparent',
      secondary:
        'bg-white/5 text-white border-white/[0.06] hover:bg-white/10 hover:border-white/[0.1]',
      ghost: 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white',
      danger: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
    }

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2.5'
    }

    const iconHoverClasses = {
      bounce: 'icon-hover-bounce',
      rotate: 'icon-hover-rotate',
      pulse: 'icon-hover-pulse',
      none: ''
    }

    const glowClasses = glow && variant === 'primary' ? 'btn-glow-hover' : 'btn-scale-hover'

    return (
      <button
        ref={ref}
        className={`
          relative overflow-hidden inline-flex items-center justify-center
          font-medium rounded-lg border transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${glowClasses}
          ${iconHoverClasses[iconHover]}
          ${className}
        `}
        disabled={disabled}
        onClick={(e) => {
          addRipple(e)
          props.onClick?.(e)
        }}
        {...props}
      >
        {children}
        {/* Ripple effects */}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute rounded-full bg-white/20 animate-ripple pointer-events-none"
            style={{
              left: ripple.x - 10,
              top: ripple.y - 10,
              width: 20,
              height: 20
            }}
          />
        ))}
      </button>
    )
  }
)

AnimatedButton.displayName = 'AnimatedButton'

/* ============================================
   SUCCESS CHECKMARK ANIMATION
   ============================================ */

interface SuccessCheckmarkProps {
  size?: number
  className?: string
}

export function SuccessCheckmark({ size = 48, className = '' }: SuccessCheckmarkProps) {
  return (
    <div className={`animate-success-pop ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        className="text-green-400"
      >
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-20"
        />
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="150"
          strokeDashoffset="150"
          className="animate-[checkmarkCircle_0.6s_ease-out_forwards]"
          style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
        />
        <path
          d="M14 27l7 7 16-16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="50"
          strokeDashoffset="50"
          className="animate-[checkmark_0.4s_ease-out_0.4s_forwards]"
        />
      </svg>
    </div>
  )
}

/* ============================================
   FEEDBACK TOAST WITH ANIMATION
   ============================================ */

interface FeedbackIndicatorProps {
  type: 'success' | 'error' | 'warning' | 'none'
  message?: string
  className?: string
}

export function FeedbackIndicator({
  type,
  message,
  className = ''
}: FeedbackIndicatorProps) {
  if (type === 'none') return null

  const config = {
    success: {
      icon: Check,
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      iconColor: 'text-green-400',
      animation: 'animate-success-pop'
    },
    error: {
      icon: X,
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      iconColor: 'text-red-400',
      animation: 'animate-shake'
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      iconColor: 'text-yellow-400',
      animation: 'animate-bounce-in'
    }
  }

  const { icon: Icon, bg, border, iconColor, animation } = config[type]

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur
        ${bg} ${border} ${animation} ${className}
      `}
    >
      <Icon size={16} className={iconColor} />
      {message && <span className="text-sm text-white">{message}</span>}
    </div>
  )
}

/* ============================================
   ANIMATED CARD
   ============================================ */

interface AnimatedCardProps {
  children: ReactNode
  className?: string
  hoverEffect?: 'lift' | 'glow' | 'border' | 'none'
  onClick?: () => void
}

export function AnimatedCard({
  children,
  className = '',
  hoverEffect = 'lift',
  onClick
}: AnimatedCardProps) {
  const hoverClasses = {
    lift: 'card-hover hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]',
    glow: 'transition-all duration-200 hover:shadow-[0_0_30px_rgba(204,120,92,0.15)]',
    border: 'transition-all duration-200 hover:border-white/[0.15]',
    none: ''
  }

  return (
    <div
      className={`
        p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]
        ${hoverClasses[hoverEffect]}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/* ============================================
   LOADING SPINNER WITH ANIMATION
   ============================================ */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <div
      className={`
        ${sizeClasses[size]}
        border-2 border-white/20 border-t-accent
        rounded-full animate-spin
        ${className}
      `}
    />
  )
}

/* ============================================
   PULSE DOT INDICATOR
   ============================================ */

interface PulseDotProps {
  color?: 'accent' | 'green' | 'red' | 'yellow'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function PulseDot({ color = 'accent', size = 'md', className = '' }: PulseDotProps) {
  const colorClasses = {
    accent: 'bg-accent',
    green: 'bg-green-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400'
  }

  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className={`
          ${sizeClasses[size]} ${colorClasses[color]}
          rounded-full animate-pulse-scale
        `}
      />
      <span
        className={`
          absolute inset-0 ${colorClasses[color]}
          rounded-full animate-ping opacity-75
        `}
      />
    </span>
  )
}
