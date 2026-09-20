import { useState, useEffect, useRef } from 'react'
import { Rocket, GitPullRequest, ChevronDown, Globe, ExternalLink } from 'lucide-react'
import { useAppStore } from '../../store'

interface DeployOption {
  id: string
  label: string
  icon: React.ReactNode
  command: string
  description: string
}

const DEPLOY_OPTIONS: DeployOption[] = [
  {
    id: 'vercel',
    label: 'Deploy to Vercel',
    icon: <Rocket size={14} />,
    command: 'Please deploy this project to Vercel',
    description: 'Deploy to Vercel hosting'
  },
  {
    id: 'github-pages',
    label: 'Deploy to GitHub Pages',
    icon: <Globe size={14} />,
    command: 'Please deploy this project to GitHub Pages. Build the project if needed, then push to the gh-pages branch.',
    description: 'Deploy to GitHub Pages'
  },
  {
    id: 'pull-request',
    label: 'Create Pull Request',
    icon: <GitPullRequest size={14} />,
    command: 'Please create a pull request for my changes',
    description: 'Open a PR for current changes'
  }
]

export default function DeployMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeTerminalId = useAppStore((state) => state.activeTerminalId)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleDeployAction = async (option: DeployOption) => {
    setIsOpen(false)

    if (!activeTerminalId) {
      console.warn('No active terminal to send deploy command')
      return
    }

    try {
      await window.api.terminalSendText(option.command, activeTerminalId)
    } catch (error) {
      console.error('Failed to send deploy command:', error)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-xs ${
          isOpen
            ? 'bg-accent/20 border-accent/40 text-accent'
            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
        }`}
        aria-label="Deploy actions (Cmd+Shift+D)"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Deploy (Cmd+Shift+D)"
      >
        <Rocket size={12} aria-hidden="true" />
        <span className="font-medium">Deploy</span>
        <ChevronDown
          size={10}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl shadow-black/40 overflow-hidden z-50 animate-fade-in-down"
          role="menu"
          aria-label="Deploy options"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-accent/20">
                <Rocket size={12} className="text-accent" />
              </div>
              <span className="text-xs font-medium text-gray-300">Deploy Options</span>
            </div>
            <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] text-gray-500 font-medium">
              <span>Cmd</span>
              <span>Shift</span>
              <span>D</span>
            </kbd>
          </div>

          {/* Options */}
          <div className="py-1">
            {DEPLOY_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleDeployAction(option)}
                disabled={!activeTerminalId}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                role="menuitem"
              >
                <div className={`p-1.5 rounded-lg transition-colors ${
                  option.id === 'pull-request'
                    ? 'bg-sand-500/10 text-sand-400 group-hover:bg-sand-500/20'
                    : 'bg-accent/10 text-accent group-hover:bg-accent/20'
                }`}>
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                    {option.label}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {option.description}
                  </div>
                </div>
                <ExternalLink
                  size={10}
                  className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          {/* Footer hint */}
          {!activeTerminalId && (
            <div className="px-3 py-2 border-t border-white/10 bg-yellow-500/5">
              <p className="text-[10px] text-yellow-500/80 text-center">
                Open a terminal to use deploy commands
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
