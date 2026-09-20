import { ReactNode, useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from 'react'
import { usePrefersReducedMotion } from '../../hooks/useAnimations'

/* ============================================
   TYPES & INTERFACES
   ============================================ */

type Screen = 'home' | 'terminal' | 'skills' | 'history'

type TransitionDirection = 'forward' | 'back' | 'none'

type TransitionState = 'idle' | 'preloading' | 'exiting' | 'entering' | 'complete'

interface ScrollPosition {
  x: number
  y: number
}

interface NavigationHistoryEntry {
  screen: Screen
  timestamp: number
}

interface TransitionConfig {
  duration: number
  enterDelay: number
  exitDuration: number
  blurAmount: number
}

interface PageTransitionContextValue {
  currentScreen: Screen
  previousScreen: Screen | null
  transitionState: TransitionState
  transitionDirection: TransitionDirection
  isTransitioning: boolean
  navigateTo: (screen: Screen) => void
  goBack: () => void
  canGoBack: boolean
  navigationHistory: NavigationHistoryEntry[]
  scrollPositions: Map<Screen, ScrollPosition>
  saveScrollPosition: (screen: Screen, position: ScrollPosition) => void
  restoreScrollPosition: (screen: Screen) => ScrollPosition | null
}

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null)

/* ============================================
   CUSTOM HOOKS
   ============================================ */

export function usePageTransitionContext(): PageTransitionContextValue {
  const context = useContext(PageTransitionContext)
  if (!context) {
    throw new Error('usePageTransitionContext must be used within a PageTransitionWrapper')
  }
  return context
}

/* ============================================
   SCREEN ORDER FOR DIRECTION DETECTION
   ============================================ */

const SCREEN_ORDER: Record<Screen, number> = {
  home: 0,
  terminal: 1,
  skills: 2,
  history: 3
}

function getTransitionDirection(from: Screen | null, to: Screen): TransitionDirection {
  if (!from) return 'none'
  if (from === to) return 'none'
  return SCREEN_ORDER[to] > SCREEN_ORDER[from] ? 'forward' : 'back'
}

/* ============================================
   TRANSITION CONFIG
   ============================================ */

const DEFAULT_CONFIG: TransitionConfig = {
  duration: 350,
  enterDelay: 50,
  exitDuration: 250,
  blurAmount: 8
}

/* ============================================
   INDIVIDUAL SCREEN WRAPPER
   ============================================ */

interface ScreenContentProps {
  screen: Screen
  isActive: boolean
  isPrevious: boolean
  transitionState: TransitionState
  transitionDirection: TransitionDirection
  children: ReactNode
  config: TransitionConfig
  onScrollRef?: (screen: Screen, ref: HTMLDivElement | null) => void
}

function ScreenContent({
  screen,
  isActive,
  isPrevious,
  transitionState,
  transitionDirection,
  children,
  config,
  onScrollRef
}: ScreenContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (onScrollRef && containerRef.current) {
      onScrollRef(screen, containerRef.current)
    }
  }, [screen, onScrollRef])

  // Calculate transform and opacity based on state
  const getStyles = useCallback(() => {
    if (prefersReducedMotion) {
      return {
        opacity: isActive ? 1 : 0,
        transform: 'none',
        filter: 'none',
        zIndex: isActive ? 10 : isPrevious ? 5 : 0,
        pointerEvents: isActive ? 'auto' as const : 'none' as const,
        visibility: (isActive || isPrevious) ? 'visible' as const : 'hidden' as const
      }
    }

    const baseTransition = `
      opacity ${config.duration}ms cubic-bezier(0.4, 0, 0.2, 1),
      transform ${config.duration}ms cubic-bezier(0.4, 0, 0.2, 1),
      filter ${config.duration}ms cubic-bezier(0.4, 0, 0.2, 1)
    `

    // Entering screen (becoming active)
    if (isActive && (transitionState === 'entering' || transitionState === 'complete')) {
      return {
        opacity: 1,
        transform: 'translateX(0) scale(1)',
        filter: 'blur(0px)',
        transition: baseTransition,
        zIndex: 10,
        pointerEvents: 'auto' as const,
        visibility: 'visible' as const
      }
    }

    // Exiting screen (was active, now leaving)
    if (isPrevious && transitionState === 'exiting') {
      const translateX = transitionDirection === 'forward' ? '-8%' : '8%'
      return {
        opacity: 0.3,
        transform: `translateX(${translateX}) scale(0.97)`,
        filter: `blur(${config.blurAmount}px)`,
        transition: baseTransition,
        zIndex: 5,
        pointerEvents: 'none' as const,
        visibility: 'visible' as const
      }
    }

    // Active but still preloading/idle (initial state for new screen)
    if (isActive && (transitionState === 'preloading' || transitionState === 'idle')) {
      const translateX = transitionDirection === 'forward' ? '8%' : '-8%'
      return {
        opacity: 0,
        transform: `translateX(${translateX}) scale(0.97)`,
        filter: `blur(${config.blurAmount}px)`,
        transition: 'none',
        zIndex: 10,
        pointerEvents: 'none' as const,
        visibility: 'visible' as const
      }
    }

    // Hidden screens
    return {
      opacity: 0,
      transform: 'translateX(0) scale(1)',
      filter: 'none',
      transition: baseTransition,
      zIndex: 0,
      pointerEvents: 'none' as const,
      visibility: 'hidden' as const
    }
  }, [isActive, isPrevious, transitionState, transitionDirection, config, prefersReducedMotion])

  const styles = getStyles()

  // Don't render if not active and not previous during transition
  if (!isActive && !isPrevious) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-auto"
      style={{
        opacity: styles.opacity,
        transform: styles.transform,
        filter: styles.filter,
        transition: styles.transition,
        zIndex: styles.zIndex,
        pointerEvents: styles.pointerEvents,
        visibility: styles.visibility,
        willChange: 'opacity, transform, filter'
      }}
      data-screen={screen}
      data-active={isActive}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  )
}

/* ============================================
   LOADING INDICATOR
   ============================================ */

interface TransitionLoadingProps {
  isVisible: boolean
}

function TransitionLoading({ isVisible }: TransitionLoadingProps) {
  if (!isVisible) return null

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 150ms ease-out'
      }}
    >
      <div className="relative">
        {/* Spinning ring */}
        <div
          className="w-8 h-8 border-2 border-overlay/10 border-t-accent rounded-full"
          style={{
            animation: 'spin 0.8s linear infinite'
          }}
        />
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(204,120,92,0.2) 0%, transparent 70%)',
            filter: 'blur(8px)'
          }}
        />
      </div>
    </div>
  )
}

/* ============================================
   TRANSITION BACKDROP
   ============================================ */

interface TransitionBackdropProps {
  isVisible: boolean
  blurAmount: number
}

function TransitionBackdrop({ isVisible, blurAmount }: TransitionBackdropProps) {
  return (
    <div
      className="absolute inset-0 z-[1] pointer-events-none"
      style={{
        opacity: isVisible ? 1 : 0,
        backdropFilter: isVisible ? `blur(${blurAmount / 2}px)` : 'blur(0px)',
        background: isVisible ? 'rgba(13, 13, 13, 0.3)' : 'transparent',
        transition: 'opacity 200ms ease-out, backdrop-filter 200ms ease-out, background 200ms ease-out'
      }}
    />
  )
}

/* ============================================
   MAIN PAGE TRANSITION WRAPPER
   ============================================ */

interface PageTransitionWrapperProps {
  currentScreen: Screen
  onScreenChange: (screen: Screen) => void
  children: (renderScreen: (screen: Screen, content: ReactNode, options?: { keepMounted?: boolean }) => ReactNode) => ReactNode
  config?: Partial<TransitionConfig>
  showLoadingIndicator?: boolean
}

export function PageTransitionWrapper({
  currentScreen,
  onScreenChange,
  children,
  config: userConfig,
  showLoadingIndicator = false
}: PageTransitionWrapperProps) {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig])
  const prefersReducedMotion = usePrefersReducedMotion()

  // State
  const [transitionState, setTransitionState] = useState<TransitionState>('idle')
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null)
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>('none')
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryEntry[]>([
    { screen: currentScreen, timestamp: Date.now() }
  ])
  const [scrollPositions] = useState<Map<Screen, ScrollPosition>>(new Map())
  const [mountedScreens, setMountedScreens] = useState<Set<Screen>>(new Set([currentScreen]))

  // Refs for scroll containers
  const scrollContainerRefs = useRef<Map<Screen, HTMLDivElement | null>>(new Map())

  // Track screen changes
  const lastScreenRef = useRef<Screen>(currentScreen)

  // Handle scroll position saving
  const saveScrollPosition = useCallback((screen: Screen, position: ScrollPosition) => {
    scrollPositions.set(screen, position)
  }, [scrollPositions])

  // Handle scroll position restoration
  const restoreScrollPosition = useCallback((screen: Screen): ScrollPosition | null => {
    return scrollPositions.get(screen) || null
  }, [scrollPositions])

  // Save scroll position before leaving
  const saveCurrentScrollPosition = useCallback(() => {
    const container = scrollContainerRefs.current.get(lastScreenRef.current)
    if (container) {
      saveScrollPosition(lastScreenRef.current, {
        x: container.scrollLeft,
        y: container.scrollTop
      })
    }
  }, [saveScrollPosition])

  // Restore scroll position after entering
  const restoreCurrentScrollPosition = useCallback((screen: Screen) => {
    requestAnimationFrame(() => {
      const container = scrollContainerRefs.current.get(screen)
      const position = restoreScrollPosition(screen)
      if (container && position) {
        container.scrollLeft = position.x
        container.scrollTop = position.y
      }
    })
  }, [restoreScrollPosition])

  // Handle screen ref registration
  const handleScrollRef = useCallback((screen: Screen, ref: HTMLDivElement | null) => {
    scrollContainerRefs.current.set(screen, ref)
  }, [])

  // Navigation function
  const navigateTo = useCallback((screen: Screen) => {
    if (screen === currentScreen || transitionState !== 'idle') return

    // Save current scroll position
    saveCurrentScrollPosition()

    // Determine direction
    const direction = getTransitionDirection(currentScreen, screen)
    setTransitionDirection(direction)

    // Update history
    setNavigationHistory(prev => [...prev, { screen, timestamp: Date.now() }])

    // Track previous screen
    setPreviousScreen(currentScreen)
    lastScreenRef.current = currentScreen

    // Add new screen to mounted screens
    setMountedScreens(prev => new Set([...prev, screen]))

    // Start transition
    if (prefersReducedMotion) {
      onScreenChange(screen)
      setTransitionState('idle')
      return
    }

    // Preload phase
    setTransitionState('preloading')

    // Short delay for preloading content
    setTimeout(() => {
      // Start exit animation
      setTransitionState('exiting')
      onScreenChange(screen)

      // After exit starts, begin enter animation
      setTimeout(() => {
        setTransitionState('entering')

        // Complete transition
        setTimeout(() => {
          setTransitionState('complete')
          setPreviousScreen(null)
          restoreCurrentScrollPosition(screen)

          // Reset to idle after animation settles
          setTimeout(() => {
            setTransitionState('idle')
          }, 50)
        }, config.duration)
      }, config.enterDelay)
    }, 50)
  }, [currentScreen, transitionState, prefersReducedMotion, onScreenChange, config, saveCurrentScrollPosition, restoreCurrentScrollPosition])

  // Go back function
  const goBack = useCallback(() => {
    if (navigationHistory.length <= 1) return

    const newHistory = [...navigationHistory]
    newHistory.pop() // Remove current
    const previousEntry = newHistory[newHistory.length - 1]

    if (previousEntry) {
      setNavigationHistory(newHistory)
      navigateTo(previousEntry.screen)
    }
  }, [navigationHistory, navigateTo])

  // Check if can go back
  const canGoBack = navigationHistory.length > 1

  // Context value
  const contextValue: PageTransitionContextValue = useMemo(() => ({
    currentScreen,
    previousScreen,
    transitionState,
    transitionDirection,
    isTransitioning: transitionState !== 'idle',
    navigateTo,
    goBack,
    canGoBack,
    navigationHistory,
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition
  }), [
    currentScreen,
    previousScreen,
    transitionState,
    transitionDirection,
    navigateTo,
    goBack,
    canGoBack,
    navigationHistory,
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition
  ])

  // Render screen helper
  const renderScreen = useCallback((screen: Screen, content: ReactNode, options?: { keepMounted?: boolean }) => {
    const isActive = currentScreen === screen
    const isPrevious = previousScreen === screen
    const keepMounted = options?.keepMounted ?? false

    // Check if screen should be rendered
    const shouldRender = isActive || isPrevious || (keepMounted && mountedScreens.has(screen))

    if (!shouldRender) return null

    return (
      <ScreenContent
        key={screen}
        screen={screen}
        isActive={isActive}
        isPrevious={isPrevious}
        transitionState={transitionState}
        transitionDirection={transitionDirection}
        config={config}
        onScrollRef={handleScrollRef}
      >
        {content}
      </ScreenContent>
    )
  }, [currentScreen, previousScreen, transitionState, transitionDirection, config, handleScrollRef, mountedScreens])

  // Show loading during preload phase
  const showLoading = showLoadingIndicator && transitionState === 'preloading'

  return (
    <PageTransitionContext.Provider value={contextValue}>
      <div className="relative h-full w-full overflow-hidden bg-surface-1">
        {/* Transition backdrop blur */}
        <TransitionBackdrop
          isVisible={transitionState === 'exiting' || transitionState === 'entering'}
          blurAmount={config.blurAmount}
        />

        {/* Loading indicator */}
        <TransitionLoading isVisible={showLoading} />

        {/* Screen content */}
        {children(renderScreen)}
      </div>
    </PageTransitionContext.Provider>
  )
}

/* ============================================
   PERSISTENT SCREEN WRAPPER
   For keeping terminal mounted
   ============================================ */

interface PersistentScreenProps {
  screen: Screen
  currentScreen: Screen
  children: ReactNode
  className?: string
}

export function PersistentScreen({ screen, currentScreen, children, className = '' }: PersistentScreenProps) {
  const isActive = currentScreen === screen

  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? 'auto' : 'none',
        transition: 'opacity 300ms ease-out'
      }}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  )
}

/* ============================================
   EXPORTS
   ============================================ */

export type { Screen, TransitionDirection, TransitionState, ScrollPosition, NavigationHistoryEntry, PageTransitionContextValue }
export default PageTransitionWrapper
