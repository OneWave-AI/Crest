import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search,
  Terminal,
  X,
  Settings,
  Zap,
  History,
  Home,
  FolderOpen,
  GitCommit,
  GitBranch,
  ArrowDownToLine,
  PanelLeftClose,
  Plus,
  Trash2,
  Eraser
} from 'lucide-react'
import { useFocusTrap } from '../../hooks'

export interface Command {
  id: string
  label: string
  category: 'navigation' | 'terminal' | 'git' | 'files' | 'settings'
  shortcut?: string[]
  icon: React.ElementType
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onCommand: (commandId: string) => void
  commands?: Command[]
}

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  terminal: 'Terminal',
  git: 'Git',
  files: 'Files',
  settings: 'Settings'
}

const CATEGORY_ORDER = ['navigation', 'terminal', 'git', 'files', 'settings']

// Default commands - can be overridden via props
const DEFAULT_COMMANDS: Omit<Command, 'action'>[] = [
  // Navigation
  { id: 'go-home', label: 'Go Home', category: 'navigation', shortcut: ['Cmd', 'H'], icon: Home },
  { id: 'open-settings', label: 'Open Settings', category: 'settings', shortcut: ['Cmd', ','], icon: Settings },
  { id: 'open-skills', label: 'Open Skills Manager', category: 'navigation', shortcut: ['Cmd', 'Shift', 'S'], icon: Zap },
  { id: 'open-history', label: 'Open History', category: 'navigation', shortcut: ['Cmd', 'Shift', 'H'], icon: History },
  { id: 'toggle-sidebar', label: 'Toggle Sidebar', category: 'navigation', shortcut: ['Cmd', 'B'], icon: PanelLeftClose },

  // Terminal
  { id: 'new-terminal', label: 'New Terminal Tab', category: 'terminal', shortcut: ['Cmd', 'Shift', 'T'], icon: Plus },
  { id: 'close-terminal', label: 'Close Terminal Tab', category: 'terminal', shortcut: ['Cmd', 'W'], icon: X },
  { id: 'clear-terminal', label: 'Clear Terminal', category: 'terminal', shortcut: ['Cmd', 'K'], icon: Eraser },

  // Git
  { id: 'git-commit', label: 'Git Commit', category: 'git', shortcut: ['Cmd', 'Shift', 'C'], icon: GitCommit },
  { id: 'git-push', label: 'Git Push', category: 'git', shortcut: ['Cmd', 'Shift', 'P'], icon: GitBranch },
  { id: 'git-pull', label: 'Git Pull', category: 'git', shortcut: ['Cmd', 'Shift', 'L'], icon: ArrowDownToLine },

  // Files
  { id: 'select-folder', label: 'Select Folder', category: 'files', shortcut: ['Cmd', 'O'], icon: FolderOpen },
]

function fuzzyMatch(pattern: string, str: string): { match: boolean; score: number } {
  pattern = pattern.toLowerCase()
  str = str.toLowerCase()

  if (pattern.length === 0) return { match: true, score: 1 }
  if (str.includes(pattern)) return { match: true, score: 2 }

  let patternIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < str.length && patternIdx < pattern.length; i++) {
    if (str[i] === pattern[patternIdx]) {
      score += lastMatchIdx === i - 1 ? 2 : 1
      lastMatchIdx = i
      patternIdx++
    }
  }

  return {
    match: patternIdx === pattern.length,
    score: patternIdx === pattern.length ? score : 0
  }
}

export default function CommandPalette({ isOpen, onClose, onCommand, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  // Focus trap for accessibility
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, {
    restoreFocus: true,
    autoFocus: false, // We handle auto-focus manually for the input
    initialFocus: 'input[type="text"]'
  })

  // Use provided commands or defaults with a placeholder action
  const allCommands = useMemo(() => {
    if (commands) return commands
    return DEFAULT_COMMANDS.map(cmd => ({
      ...cmd,
      action: () => onCommand(cmd.id)
    }))
  }, [commands, onCommand])

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands

    return allCommands
      .map(cmd => ({
        cmd,
        ...fuzzyMatch(query, cmd.label)
      }))
      .filter(item => item.match)
      .sort((a, b) => b.score - a.score)
      .map(item => item.cmd)
  }, [allCommands, query])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {}

    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    }

    return CATEGORY_ORDER
      .filter(cat => groups[cat]?.length > 0)
      .map(cat => ({
        category: cat,
        commands: groups[cat]
      }))
  }, [filteredCommands])

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return groupedCommands.flatMap(g => g.commands)
  }, [groupedCommands])

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      setIsVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(false)
        })
      })
    } else {
      setIsAnimating(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setIsAnimating(false)
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view and update fade states
  useEffect(() => {
    if (listRef.current && flatCommands.length > 0) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }

      // Update fade indicators
      const { scrollTop, scrollHeight, clientHeight } = listRef.current
      setShowTopFade(scrollTop > 10)
      setShowBottomFade(scrollTop < scrollHeight - clientHeight - 10)
    }
  }, [selectedIndex, flatCommands.length])

  // Handle scroll for fade indicators
  const handleScroll = useCallback(() => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current
      setShowTopFade(scrollTop > 10)
      setShowBottomFade(scrollTop < scrollHeight - clientHeight - 10)
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < flatCommands.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : flatCommands.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (flatCommands[selectedIndex]) {
          flatCommands[selectedIndex].action()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [flatCommands, selectedIndex, onClose])

  const handleCommandClick = useCallback((command: Command) => {
    command.action()
    onClose()
  }, [onClose])

  if (!isVisible) return null

  let itemIndex = -1

  return (
    <>
      {/* Backdrop with radial gradient */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${
          isOpen && !isAnimating ? 'opacity-100' : 'opacity-0'
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
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Command Palette */}
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        aria-describedby="command-palette-description"
        className={`fixed left-1/2 top-[15%] z-50 w-full max-w-[560px] -translate-x-1/2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen && !isAnimating
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 -translate-y-4 scale-[0.97]'
        }`}
      >
        <span id="command-palette-description" className="sr-only">
          Search and execute commands. Use arrow keys to navigate, Enter to select, Escape to close.
        </span>
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.98) 0%, rgba(10, 10, 10, 0.99) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: `
              0 0 0 1px rgba(0, 0, 0, 0.5),
              0 25px 50px -12px rgba(0, 0, 0, 0.8),
              0 0 100px -20px rgba(204, 120, 92, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
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

          {/* Search Input */}
          <div className="relative flex items-center gap-3 px-4 py-4 border-b border-overlay/[0.06]">
            <Search size={18} className="text-ink-subtle flex-shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-ink-bright text-sm placeholder-ink-subtle outline-none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={flatCommands[selectedIndex] ? `command-${flatCommands[selectedIndex].id}` : undefined}
              aria-label="Search commands"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="group p-1.5 rounded-lg text-ink-subtle hover:text-ink-bright hover:bg-overlay/10 transition-all duration-200 focus-ring"
                aria-label="Clear search"
              >
                <X size={14} aria-hidden="true" className="transition-transform duration-300 group-hover:rotate-90" />
              </button>
            )}
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-overlay/[0.04] border border-overlay/[0.06] text-[10px] text-ink-subtle font-medium" aria-hidden="true">
              <span className="text-[9px]">ESC</span>
              <span className="text-ink-faint">to close</span>
            </kbd>
          </div>

          {/* Commands List with fade edges */}
          <div className="relative">
            {/* Top fade */}
            <div
              className={`absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-surface-2 to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
                showTopFade ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            />

            <div
              ref={listRef}
              id="command-list"
              role="listbox"
              aria-label="Available commands"
              className="max-h-[400px] overflow-y-auto py-2 scroll-smooth"
              onScroll={handleScroll}
            >
              {groupedCommands.length === 0 ? (
                <div className="px-4 py-8 text-center" role="status" aria-live="polite">
                  <div className="text-ink-subtle text-sm">No commands found</div>
                  <div className="text-ink-faint text-xs mt-1">Try a different search term</div>
                </div>
              ) : (
                groupedCommands.map((group, groupIndex) => (
                  <div
                    key={group.category}
                    className={`mb-2 last:mb-0 transition-all duration-300 delay-${groupIndex * 50}`}
                    role="group"
                    aria-labelledby={`category-${group.category}`}
                    style={{
                      opacity: isOpen && !isAnimating ? 1 : 0,
                      transform: isOpen && !isAnimating ? 'translateY(0)' : 'translateY(8px)',
                      transitionDelay: `${groupIndex * 30}ms`
                    }}
                  >
                    {/* Category Header */}
                    <div className="px-4 py-2" id={`category-${group.category}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                        {CATEGORY_LABELS[group.category]}
                      </span>
                    </div>

                    {/* Commands */}
                    {group.commands.map((command) => {
                      itemIndex++
                      const currentIndex = itemIndex
                      const isSelected = currentIndex === selectedIndex

                      return (
                        <button
                          key={command.id}
                          id={`command-${command.id}`}
                          data-index={currentIndex}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleCommandClick(command)}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150 focus-ring ${
                            isSelected
                              ? 'bg-accent/15'
                              : 'hover:bg-overlay/[0.04]'
                          }`}
                        >
                          {/* Icon */}
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200 ${
                              isSelected
                                ? 'bg-accent/20 text-accent scale-110'
                                : 'bg-overlay/[0.04] text-ink-muted'
                            }`}
                            aria-hidden="true"
                          >
                            <command.icon size={16} />
                          </div>

                          {/* Label */}
                          <span
                            className={`flex-1 text-sm font-medium transition-colors duration-150 ${
                              isSelected ? 'text-ink-bright' : 'text-ink'
                            }`}
                          >
                            {command.label}
                          </span>

                          {/* Shortcut */}
                          {command.shortcut && (
                            <div className="flex items-center gap-1" aria-label={`Shortcut: ${command.shortcut.join(' + ')}`}>
                              {command.shortcut.map((key, i) => (
                                <kbd
                                  key={i}
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-all duration-200 ${
                                    isSelected
                                      ? 'bg-accent/20 text-accent border border-accent/30'
                                      : 'bg-overlay/[0.04] text-ink-subtle border border-overlay/[0.06]'
                                  }`}
                                  aria-hidden="true"
                                >
                                  {key === 'Cmd' ? '\u2318' : key === 'Shift' ? '\u21E7' : key}
                                </kbd>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Bottom fade */}
            <div
              className={`absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-2 to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
                showBottomFade ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            />
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-3 border-t border-overlay/[0.06]"
            style={{ background: 'rgba(0, 0, 0, 0.2)' }}
          >
            <div className="flex items-center gap-4 text-[10px] text-ink-subtle">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded-md bg-overlay/[0.04] border border-overlay/[0.06] font-medium">{'\u2191'}</kbd>
                <kbd className="px-1.5 py-0.5 rounded-md bg-overlay/[0.04] border border-overlay/[0.06] font-medium">{'\u2193'}</kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded-md bg-overlay/[0.04] border border-overlay/[0.06] font-medium">{'\u21B5'}</kbd>
                <span>select</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Terminal size={12} className="text-accent" />
              <span className="text-[10px] text-ink-subtle">Command Palette</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Hook for Cmd+P keyboard shortcut
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  }
}
