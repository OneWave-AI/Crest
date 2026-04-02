import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  ArrowRight,
  X,
  BarChart3,
  Bot,
  Users,
  SplitSquareVertical,
  Wand2,
  Plug,
  History,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface WelcomeScreenProps {
  onComplete: () => void
}

const APP_VERSION = '2.2.0'
const LAST_SEEN_KEY = 'crest_lastSeenVersion'

// Feature carousel steps
const FEATURES = [
  {
    id: 'welcome',
    icon: Sparkles,
    title: 'Welcome to Crest',
    subtitle: 'Your Premium AI Terminal Experience',
    description: 'A powerful, feature-rich terminal interface for AI coding agents. Navigate through this guide to discover everything Crest has to offer.',
    color: 'from-[#cc785c] to-[#e8956e]',
    iconBg: 'bg-gradient-to-br from-[#cc785c]/20 to-[#e8956e]/20',
    tips: [
      'Built for developers who demand more',
      'Seamless Claude integration',
      'Premium themes and customization'
    ]
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics Dashboard',
    subtitle: 'Track Your AI Usage',
    description: 'Monitor your Claude usage with detailed analytics. Track tokens, costs, and conversation patterns over time.',
    color: 'from-blue-500 to-cyan-400',
    iconBg: 'bg-gradient-to-br from-blue-500/20 to-cyan-400/20',
    tips: [
      'View daily, weekly, and monthly usage',
      'Track token consumption and costs',
      'Export analytics data for reports'
    ]
  },
  {
    id: 'superagent',
    icon: Bot,
    title: 'Super Agent',
    subtitle: 'Autonomous AI Task Completion',
    description: 'Let AI handle complex, multi-step tasks autonomously. Super Agent monitors Claude\'s output and provides intelligent guidance.',
    color: 'from-purple-500 to-pink-500',
    iconBg: 'bg-gradient-to-br from-purple-500/20 to-pink-500/20',
    tips: [
      'Set goals and let AI work autonomously',
      'Smart context injection and guidance',
      'Configure with any OpenAI-compatible LLM'
    ]
  },
  {
    id: 'hive',
    icon: Users,
    title: 'Agent Hive',
    subtitle: 'Coordinate Multiple AI Agents',
    description: 'Manage swarms of AI agents working in parallel. Perfect for large-scale tasks that benefit from distributed processing.',
    color: 'from-amber-500 to-orange-500',
    iconBg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/20',
    tips: [
      'Spawn multiple agents simultaneously',
      'Coordinate complex multi-part tasks',
      'Monitor all agents from one dashboard'
    ]
  },
  {
    id: 'panels',
    icon: SplitSquareVertical,
    title: 'Split Panels',
    subtitle: 'Multi-Panel Workspace',
    description: 'Drag tabs to create side-by-side terminal and browser panels. Work on multiple tasks simultaneously with a flexible layout.',
    color: 'from-emerald-500 to-teal-500',
    iconBg: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20',
    tips: [
      'Drag tabs to split the workspace',
      'Mix terminals and browser panels',
      'Resize panels by dragging borders'
    ]
  },
  {
    id: 'skills',
    icon: Wand2,
    title: 'Skills Library',
    subtitle: 'Extend Claude\'s Capabilities',
    description: 'Browse and install skills that enhance Claude\'s abilities. Create custom skills with markdown prompts and system configurations.',
    color: 'from-rose-500 to-red-500',
    iconBg: 'bg-gradient-to-br from-rose-500/20 to-red-500/20',
    tips: [
      'Install from the built-in skill library',
      'Create custom skills with markdown',
      'Share skills with the community'
    ]
  },
  {
    id: 'mcp',
    icon: Plug,
    title: 'MCP Servers',
    subtitle: 'Model Context Protocol',
    description: 'Connect to MCP servers for extended functionality. Access databases, APIs, and custom tools directly from Claude.',
    color: 'from-indigo-500 to-violet-500',
    iconBg: 'bg-gradient-to-br from-indigo-500/20 to-violet-500/20',
    tips: [
      'Connect to any MCP-compatible server',
      'Extend Claude with custom tools',
      'Access external data sources seamlessly'
    ]
  },
  {
    id: 'history',
    icon: History,
    title: 'Conversation History',
    subtitle: 'Never Lose Your Work',
    description: 'All conversations are automatically saved and searchable. Resume any previous session instantly with full context preserved.',
    color: 'from-slate-500 to-gray-500',
    iconBg: 'bg-gradient-to-br from-slate-500/20 to-gray-500/20',
    tips: [
      'Automatic conversation saving',
      'Search across all sessions',
      'Resume with one click'
    ]
  }
]

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [visible, setVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY)

    // Show welcome screen if first time or new version
    if (!lastSeen || lastSeen !== APP_VERSION) {
      setVisible(true)
    } else {
      onComplete()
    }
  }, [onComplete])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, APP_VERSION)
    setVisible(false)
    setTimeout(onComplete, 300)
  }, [onComplete])

  const goToStep = useCallback((step: number) => {
    if (step < 0 || step >= FEATURES.length) return
    setDirection(step > currentStep ? 'next' : 'prev')
    setCurrentStep(step)
  }, [currentStep])

  const nextStep = useCallback(() => {
    if (currentStep < FEATURES.length - 1) {
      setDirection('next')
      setCurrentStep(prev => prev + 1)
    } else {
      handleDismiss()
    }
  }, [currentStep, handleDismiss])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setDirection('prev')
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return

      switch (e.key) {
        case 'Escape':
          handleDismiss()
          break
        case 'ArrowRight':
        case 'Enter':
          nextStep()
          break
        case 'ArrowLeft':
          prevStep()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, handleDismiss, nextStep, prevStep])

  if (!visible) return null

  const feature = FEATURES[currentStep]
  const isLastStep = currentStep === FEATURES.length - 1
  const progress = ((currentStep + 1) / FEATURES.length) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl mx-4 bg-[#141414] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/5">
          <div
            className={`h-full bg-gradient-to-r ${feature.color} transition-all duration-500 ease-out`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Skip button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors z-10"
          title="Skip (Esc)"
        >
          <X size={18} />
        </button>

        {/* Step counter */}
        <div className="absolute top-4 left-4 px-2 py-1 rounded-md bg-white/5 text-xs text-gray-500">
          {currentStep + 1} / {FEATURES.length}
        </div>

        {/* Content */}
        <div className="p-8 pt-12">
          {/* Feature content */}
          <div
            key={feature.id}
            className={`animate-in ${direction === 'next' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'} duration-300`}
          >
            {/* Icon and title */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className={`p-4 rounded-2xl ${feature.iconBg} mb-4`}>
                <feature.icon
                  className="w-10 h-10"
                  style={{
                    color: feature.color.includes('cc785c') ? '#cc785c' :
                           feature.color.includes('blue') ? '#3b82f6' :
                           feature.color.includes('purple') ? '#a855f7' :
                           feature.color.includes('amber') ? '#f59e0b' :
                           feature.color.includes('emerald') ? '#10b981' :
                           feature.color.includes('rose') ? '#f43f5e' :
                           feature.color.includes('indigo') ? '#6366f1' :
                           '#64748b'
                  }}
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {feature.title}
              </h2>
              <p className={`text-sm font-medium bg-gradient-to-r ${feature.color} bg-clip-text text-transparent`}>
                {feature.subtitle}
              </p>
            </div>

            {/* Description */}
            <p className="text-gray-400 text-center mb-6 leading-relaxed">
              {feature.description}
            </p>

            {/* Tips */}
            <div className="space-y-2 mb-8">
              {feature.tips.map((tip, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className={`w-5 h-5 rounded-full bg-gradient-to-r ${feature.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-xs font-bold">{index + 1}</span>
                  </div>
                  <p className="text-sm text-gray-300">{tip}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {FEATURES.map((_, index) => (
              <button
                key={index}
                onClick={() => goToStep(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? `w-6 bg-gradient-to-r ${feature.color}`
                    : 'bg-white/20 hover:bg-white/40'
                }`}
                title={FEATURES[index].title}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                currentStep === 0
                  ? 'border-white/5 text-gray-600 cursor-not-allowed'
                  : 'border-white/10 text-gray-300 hover:bg-white/5 hover:border-white/20'
              }`}
            >
              <ChevronLeft size={18} />
              <span>Previous</span>
            </button>

            <button
              onClick={nextStep}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r ${feature.color} text-white font-medium hover:opacity-90 transition-opacity`}
            >
              <span>{isLastStep ? 'Get Started' : 'Next'}</span>
              {isLastStep ? <ArrowRight size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>

          {/* Keyboard hints */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-gray-600">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-500">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-500 ml-1">→</kbd>
              {' '}to navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-500">Esc</kbd>
              {' '}to skip
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
