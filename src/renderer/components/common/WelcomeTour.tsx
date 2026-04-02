import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Sparkles,
  Terminal,
  FolderTree,
  Puzzle,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight
} from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface WelcomeTourProps {
  onComplete: () => void
}

interface TourStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  targetSelector?: string
  position: 'center' | 'left' | 'right' | 'top' | 'bottom'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Crest',
    description: 'Your powerful AI-assisted development environment. Let us show you around and help you get the most out of your experience.',
    icon: Sparkles,
    position: 'center'
  },
  {
    id: 'terminal',
    title: 'Claude Terminal',
    description: 'This is where the magic happens. Interact with Claude directly through a natural conversation interface. Ask questions, request code changes, and let AI assist your workflow.',
    icon: Terminal,
    targetSelector: '[data-tour="terminal"]',
    position: 'left'
  },
  {
    id: 'file-explorer',
    title: 'File Explorer',
    description: 'Browse and navigate your project files with ease. Claude can see and modify files in your workspace to help with code changes.',
    icon: FolderTree,
    targetSelector: '[data-tour="file-explorer"]',
    position: 'right'
  },
  {
    id: 'skills',
    title: 'Skills Manager',
    description: 'Extend Claude\'s capabilities with custom skills. Create reusable commands and workflows tailored to your development needs.',
    icon: Puzzle,
    targetSelector: '[data-tour="skills"]',
    position: 'bottom'
  },
  {
    id: 'history',
    title: 'Conversation History',
    description: 'Access your past conversations anytime. Resume previous sessions, review solutions, and maintain context across your work.',
    icon: History,
    targetSelector: '[data-tour="history"]',
    position: 'right'
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Customize your experience. Configure themes, API settings, keyboard shortcuts, and more to match your workflow.',
    icon: Settings,
    targetSelector: '[data-tour="settings"]',
    position: 'bottom'
  }
]

const STORAGE_KEY = 'claude-ui-tour-completed'

export default function WelcomeTour({ onComplete }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isContentVisible, setIsContentVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isVisible)

  const step = TOUR_STEPS[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === TOUR_STEPS.length - 1
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100

  // Animate content visibility
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setIsContentVisible(true), 100)
      return () => clearTimeout(timer)
    } else {
      setIsContentVisible(false)
    }
  }, [isVisible])

  // Find and highlight target element
  useEffect(() => {
    if (step.targetSelector) {
      const target = document.querySelector(step.targetSelector)
      if (target) {
        const rect = target.getBoundingClientRect()
        setTargetRect(rect)
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        setTargetRect(null)
      }
    } else {
      setTargetRect(null)
    }
  }, [step.targetSelector, currentStep])

  const handleNext = useCallback(() => {
    if (isAnimating) return
    setIsAnimating(true)

    if (isLastStep) {
      handleComplete()
    } else {
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1)
        setIsAnimating(false)
      }, 200)
    }
  }, [isLastStep, isAnimating])

  const handlePrevious = useCallback(() => {
    if (isAnimating || isFirstStep) return
    setIsAnimating(true)

    setTimeout(() => {
      setCurrentStep((prev) => prev - 1)
      setIsAnimating(false)
    }, 200)
  }, [isFirstStep, isAnimating])

  const handleSkip = useCallback(() => {
    handleComplete()
  }, [])

  const handleComplete = useCallback(() => {
    setIsVisible(false)
    localStorage.setItem(STORAGE_KEY, 'true')
    setTimeout(() => {
      onComplete()
    }, 350)
  }, [onComplete])

  const goToStep = useCallback((index: number) => {
    if (isAnimating || index === currentStep) return
    setIsAnimating(true)

    setTimeout(() => {
      setCurrentStep(index)
      setIsAnimating(false)
    }, 200)
  }, [currentStep, isAnimating])

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || step.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }
    }

    const padding = 20
    const tooltipWidth = 420
    const tooltipHeight = 300

    switch (step.position) {
      case 'left':
        return {
          position: 'fixed',
          top: Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding)),
          left: Math.max(padding, targetRect.left - tooltipWidth - padding),
          transform: 'none'
        }
      case 'right':
        return {
          position: 'fixed',
          top: Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding)),
          left: Math.min(targetRect.right + padding, window.innerWidth - tooltipWidth - padding),
          transform: 'none'
        }
      case 'top':
        return {
          position: 'fixed',
          top: Math.max(padding, targetRect.top - tooltipHeight - padding),
          left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
          transform: 'none'
        }
      case 'bottom':
        return {
          position: 'fixed',
          top: Math.min(targetRect.bottom + padding, window.innerHeight - tooltipHeight - padding),
          left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
          transform: 'none'
        }
      default:
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrevious, handleSkip])

  const Icon = step.icon

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      aria-describedby="tour-step-description"
      className={`fixed inset-0 z-[200] transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Overlay with spotlight cutout */}
      <div className="absolute inset-0">
        {/* Dark overlay with radial gradient */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            background: `
              radial-gradient(
                ellipse at center,
                rgba(0, 0, 0, 0.7) 0%,
                rgba(0, 0, 0, 0.85) 50%,
                rgba(0, 0, 0, 0.92) 100%
              )
            `,
            backdropFilter: 'blur(4px)'
          }}
        />

        {/* Spotlight effect for target element */}
        {targetRect && (
          <>
            {/* Animated spotlight ring */}
            <div
              className="absolute transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-xl"
              style={{
                top: targetRect.top - 10,
                left: targetRect.left - 10,
                width: targetRect.width + 20,
                height: targetRect.height + 20,
                boxShadow: `
                  0 0 0 4000px rgba(0, 0, 0, 0.85),
                  0 0 60px 12px rgba(204, 120, 92, 0.4),
                  inset 0 0 30px rgba(204, 120, 92, 0.2)
                `,
                border: '2px solid rgba(204, 120, 92, 0.5)'
              }}
            />
            {/* Pulsing glow effect */}
            <div
              className="absolute rounded-xl animate-pulse"
              style={{
                top: targetRect.top - 16,
                left: targetRect.left - 16,
                width: targetRect.width + 32,
                height: targetRect.height + 32,
                boxShadow: '0 0 80px 30px rgba(204, 120, 92, 0.15)',
                pointerEvents: 'none'
              }}
            />
          </>
        )}
      </div>

      {/* Tooltip box with glass morphism */}
      <div
        ref={tooltipRef}
        className={`w-[420px] transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isAnimating ? 'opacity-0 scale-[0.97] translate-y-2' : 'opacity-100 scale-100 translate-y-0'
        }`}
        style={getTooltipStyle()}
      >
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(22, 22, 22, 0.98) 0%, rgba(12, 12, 12, 0.99) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: `
              0 0 0 1px rgba(0, 0, 0, 0.5),
              0 30px 60px -15px rgba(0, 0, 0, 0.7),
              0 0 120px -30px rgba(204, 120, 92, 0.25),
              inset 0 1px 0 rgba(255, 255, 255, 0.06)
            `
          }}
        >
          {/* Subtle top glow accent */}
          <div
            className="absolute -top-px left-1/2 -translate-x-1/2 w-2/3 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(204, 120, 92, 0.6), transparent)'
            }}
            aria-hidden="true"
          />

          {/* Accent glow blob */}
          <div
            className="absolute -top-24 -right-24 w-48 h-48 bg-[#cc785c]/15 rounded-full blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          {/* Content */}
          <div className="relative p-6">
            {/* Header with icon */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#cc785c] to-[#a85f48] flex items-center justify-center shadow-xl shadow-[#cc785c]/25 transition-transform duration-300 hover:scale-105"
                  aria-hidden="true"
                >
                  <Icon size={26} className="text-white" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#cc785c] font-semibold" aria-label={`Step ${currentStep + 1} of ${TOUR_STEPS.length}`}>
                    Step {currentStep + 1} of {TOUR_STEPS.length}
                  </span>
                  <h3 id="tour-step-title" className="text-lg font-semibold text-white mt-1">
                    {step.title}
                  </h3>
                </div>
              </div>

              {/* Close button with rotation animation */}
              <button
                onClick={handleSkip}
                className="group p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200 focus-ring"
                aria-label="Skip tour"
              >
                <X size={18} aria-hidden="true" className="transition-transform duration-300 group-hover:rotate-90" />
              </button>
            </div>

            {/* Description with smooth transition */}
            <p
              id="tour-step-description"
              className={`text-gray-400 text-sm leading-relaxed mb-6 transition-all duration-300 ${
                isContentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              {step.description}
            </p>

            {/* Progress bar */}
            <div
              role="progressbar"
              aria-valuenow={currentStep + 1}
              aria-valuemin={1}
              aria-valuemax={TOUR_STEPS.length}
              aria-label={`Tour progress: step ${currentStep + 1} of ${TOUR_STEPS.length}`}
              className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-5"
            >
              <div
                className="h-full bg-gradient-to-r from-[#cc785c] to-[#e8a088] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Progress dots */}
            <div
              role="tablist"
              aria-label="Tour steps"
              className="flex items-center justify-center gap-2 mb-6"
            >
              {TOUR_STEPS.map((tourStep, index) => (
                <button
                  key={index}
                  role="tab"
                  aria-selected={index === currentStep}
                  aria-label={`Go to step ${index + 1}: ${tourStep.title}`}
                  onClick={() => goToStep(index)}
                  className={`transition-all duration-300 ease-out rounded-full focus-ring ${
                    index === currentStep
                      ? 'w-7 h-2 bg-gradient-to-r from-[#cc785c] to-[#e8a088]'
                      : index < currentStep
                      ? 'w-2 h-2 bg-[#cc785c]/50 hover:bg-[#cc785c]/70 hover:scale-125'
                      : 'w-2 h-2 bg-white/20 hover:bg-white/35 hover:scale-125'
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <nav className="flex items-center justify-between" aria-label="Tour navigation">
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-300 transition-all duration-200 focus-ring rounded-xl hover:bg-white/[0.03]"
                aria-label="Skip welcome tour"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <button
                    onClick={handlePrevious}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] rounded-xl transition-all duration-200 focus-ring active:scale-[0.98]"
                    aria-label={`Go to previous step: ${TOUR_STEPS[currentStep - 1]?.title}`}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    Previous
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#cc785c] to-[#b86a50] hover:from-[#d8866a] hover:to-[#cc785c] rounded-xl shadow-lg shadow-[#cc785c]/25 hover:shadow-xl hover:shadow-[#cc785c]/30 transition-all duration-200 focus-ring active:scale-[0.98] hover:scale-[1.02]"
                  aria-label={isLastStep ? 'Complete tour and get started' : `Go to next step: ${TOUR_STEPS[currentStep + 1]?.title}`}
                >
                  {isLastStep ? (
                    <>
                      Get Started
                      <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-gray-600" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-gray-500">Esc</kbd>
            <span>to skip</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-gray-500">
              <ChevronLeft size={10} className="inline" />
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-gray-500">
              <ChevronRight size={10} className="inline" />
            </kbd>
            <span>to navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-gray-500">{'\u21B5'}</kbd>
            <span>to continue</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// Utility hook to check if tour should be shown
export function useShouldShowTour(): boolean {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY)
    setShouldShow(!completed)
  }, [])

  return shouldShow
}

// Utility to reset tour (for testing or settings)
export function resetWelcomeTour(): void {
  localStorage.removeItem(STORAGE_KEY)
}
