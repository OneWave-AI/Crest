import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Wrench, ChevronDown, AlertCircle, Search, Bot, Zap, X, Command, ArrowRight, Sparkles } from 'lucide-react'
import { useToast } from './Toast'
import type { Agent, Skill } from '../../../shared/types'

interface ToolbeltProps {
  activeTerminalId: string | null
}

type TabType = 'all' | 'agents' | 'skills'

export default function Toolbelt({ activeTerminalId }: ToolbeltProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  // Load agents and skills when dropdown opens
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [agentsList, skillsList] = await Promise.all([
        window.api.listAgents(),
        window.api.listSkills()
      ])
      setAgents(agentsList || [])
      setSkills(skillsList || [])
    } catch (error) {
      console.error('Failed to load agents/skills:', error)
      setAgents([])
      setSkills([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load data when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadData()
      setSearchQuery('')
      setSelectedIndex(0)
      // Focus search input after a brief delay
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen, loadData])

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

  // Filter items based on search and tab
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase()

    const filteredAgents = agents.filter(a =>
      (activeTab === 'all' || activeTab === 'agents') &&
      (a.name.toLowerCase().includes(query) || a.description?.toLowerCase().includes(query))
    ).map(a => ({ type: 'agent' as const, item: a }))

    const filteredSkills = skills.filter(s =>
      (activeTab === 'all' || activeTab === 'skills') &&
      (s.id.toLowerCase().includes(query) || s.name?.toLowerCase().includes(query) || s.description?.toLowerCase().includes(query))
    ).map(s => ({ type: 'skill' as const, item: s }))

    return [...filteredAgents, ...filteredSkills]
  }, [agents, skills, searchQuery, activeTab])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      switch (e.key) {
        case 'Escape':
          setIsOpen(false)
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            const { type, item } = filteredItems[selectedIndex]
            if (type === 'agent') {
              handleAgentClick(item as Agent)
            } else {
              handleSkillClick(item as Skill)
            }
          }
          break
        case 'Tab':
          e.preventDefault()
          setActiveTab(t => t === 'all' ? 'agents' : t === 'agents' ? 'skills' : 'all')
          setSelectedIndex(0)
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filteredItems])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery, activeTab])

  const handleAgentClick = async (agent: Agent) => {
    if (!activeTerminalId) {
      showToast('warning', 'No Active Session', 'Open a terminal session to use agents')
      return
    }

    setIsOpen(false)
    const text = `Use the ${agent.id} agent to `

    try {
      await window.api.terminalSendText(text, activeTerminalId)
      showToast('info', 'Agent Ready', `Complete your task after "${agent.name}"`)
    } catch (error) {
      console.error('Failed to send agent command:', error)
      showToast('error', 'Failed', 'Could not insert agent command')
    }
  }

  const handleSkillClick = async (skill: Skill) => {
    if (!activeTerminalId) {
      showToast('warning', 'No Active Session', 'Open a terminal session to use skills')
      return
    }

    setIsOpen(false)
    const text = `/${skill.id} `

    try {
      await window.api.terminalSendText(text, activeTerminalId)
      showToast('info', 'Skill Ready', `Press Enter to run "/${skill.id}"`)
    } catch (error) {
      console.error('Failed to send skill command:', error)
      showToast('error', 'Failed', 'Could not insert skill command')
    }
  }

  // Find Me a Skill - asks Claude to analyze work and recommend skills
  const handleFindSkill = async () => {
    if (!activeTerminalId) {
      showToast('warning', 'No Active Session', 'Open a terminal session first')
      return
    }

    setIsOpen(false)
    const prompt = `**Skill Recommendation Request**

Analyze our current work session and conversation context. Based on what we're working on, recommend the most relevant skills (slash commands) that could help.

**Instructions:**
1. Review our recent conversation and any code/files we've been working with
2. Identify the current task or challenge
3. List up to 5 skills that would be most useful right now
4. For each skill, explain briefly how it would help with our specific current task

Format your response as a numbered list with skill name and use case.`

    try {
      await window.api.terminalSendText(prompt, activeTerminalId)
      showToast('info', 'Analyzing...', 'Claude is finding relevant skills')
    } catch (error) {
      console.error('Failed to send find skill prompt:', error)
      showToast('error', 'Failed', 'Could not send prompt')
    }
  }

  const hasItems = agents.length > 0 || skills.length > 0
  const totalCount = agents.length + skills.length

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-xs ${
          isOpen
            ? 'bg-accent/20 border-accent/40 text-accent'
            : 'bg-overlay/5 border-overlay/10 text-ink-muted hover:bg-overlay/10 hover:text-ink-bright hover:border-overlay/20'
        }`}
        aria-label="Open toolbelt"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Agents & Skills (⌘T)"
      >
        <Wrench size={12} aria-hidden="true" />
        <span className="font-medium">Tools</span>
        {totalCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-overlay/10 text-[10px] font-medium">
            {totalCount}
          </span>
        )}
        <ChevronDown
          size={10}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-80 bg-surface-1/98 backdrop-blur-xl border border-overlay/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50 animate-fade-in-down"
          role="menu"
          aria-label="Toolbelt options"
        >
          {/* Search Header */}
          <div className="p-3 border-b border-overlay/[0.06]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-overlay/[0.04] border border-overlay/[0.06] rounded-lg text-sm text-ink-bright placeholder-ink-subtle focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-bright transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-2">
              {(['all', 'agents', 'skills'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setSelectedIndex(0) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    activeTab === tab
                      ? 'bg-accent/15 text-accent border border-accent/20'
                      : 'text-ink-subtle hover:text-ink hover:bg-overlay/[0.04]'
                  }`}
                >
                  {tab === 'agents' && <Bot size={11} />}
                  {tab === 'skills' && <Zap size={11} />}
                  {tab === 'all' && <Wrench size={11} />}
                  <span className="capitalize">{tab}</span>
                  <span className="text-[9px] opacity-60">
                    {tab === 'all' ? totalCount : tab === 'agents' ? agents.length : skills.length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Find Me a Skill - Featured Action */}
          <div className="px-3 py-2 border-b border-overlay/[0.06]">
            <button
              onClick={handleFindSkill}
              disabled={!activeTerminalId}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed group ${
                activeTerminalId
                  ? 'bg-gradient-to-r from-sand-500/15 to-pink-500/15 border border-sand-500/25 hover:from-sand-500/25 hover:to-pink-500/25 hover:border-sand-500/40'
                  : 'bg-overlay/[0.02] border border-overlay/[0.04]'
              }`}
            >
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br transition-all ${
                activeTerminalId
                  ? 'from-sand-500/30 to-pink-500/30 group-hover:from-sand-500/40 group-hover:to-pink-500/40'
                  : 'from-overlay/[0.04] to-overlay/[0.02]'
              }`}>
                <Sparkles size={16} className={activeTerminalId ? 'text-sand-300' : 'text-ink-faint'} />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-semibold ${activeTerminalId ? 'text-sand-200' : 'text-ink-subtle'}`}>
                  Find Me a Skill
                </span>
                <p className="text-[10px] text-ink-subtle mt-0.5">
                  Claude analyzes your work & suggests skills
                </p>
              </div>
              <ArrowRight size={14} className={`transition-all ${
                activeTerminalId ? 'text-sand-400 group-hover:translate-x-1' : 'text-ink-faint'
              }`} />
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="px-3 py-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-ink-subtle mt-3">Loading tools...</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !hasItems && (
            <div className="px-4 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-overlay/[0.04] flex items-center justify-center">
                <Wrench size={20} className="text-ink-faint" />
              </div>
              <p className="text-sm text-ink-muted font-medium">No tools available</p>
              <p className="text-xs text-ink-faint mt-1">
                Create agents or skills to see them here
              </p>
            </div>
          )}

          {/* No results */}
          {!isLoading && hasItems && filteredItems.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-ink-muted">No matches for "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-accent hover:underline mt-2"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Results List */}
          {!isLoading && filteredItems.length > 0 && (
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredItems.map(({ type, item }, index) => {
                const isAgent = type === 'agent'
                const agent = isAgent ? (item as Agent) : null
                const skill = !isAgent ? (item as Skill) : null
                const isSelected = index === selectedIndex

                return (
                  <button
                    key={`${type}-${isAgent ? agent?.id : skill?.id}`}
                    onClick={() => isAgent ? handleAgentClick(agent!) : handleSkillClick(skill!)}
                    disabled={!activeTerminalId}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed group ${
                      isSelected
                        ? 'bg-accent/10'
                        : 'hover:bg-overlay/[0.04]'
                    }`}
                    role="menuitem"
                  >
                    {/* Icon */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 ${
                      isAgent
                        ? `bg-sand-500/10 ${isSelected ? 'bg-sand-500/20' : ''}`
                        : `bg-accent/10 ${isSelected ? 'bg-accent/20' : ''}`
                    }`}>
                      {isAgent ? (
                        <Bot size={14} className="text-sand-400" />
                      ) : (
                        <Zap size={14} className="text-accent" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium truncate transition-colors ${
                          isSelected ? 'text-ink-bright' : 'text-ink'
                        }`}>
                          {isAgent ? agent?.name : `/${skill?.id}`}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isAgent
                            ? 'bg-sand-500/10 text-sand-400'
                            : 'bg-accent/10 text-accent'
                        }`}>
                          {isAgent ? 'Agent' : 'Skill'}
                        </span>
                      </div>
                      {(isAgent ? agent?.description : skill?.description) && (
                        <p className="text-[10px] text-ink-subtle truncate mt-0.5">
                          {isAgent ? agent?.description : skill?.description}
                        </p>
                      )}
                    </div>

                    {/* Arrow indicator */}
                    <ArrowRight
                      size={12}
                      className={`flex-shrink-0 transition-all ${
                        isSelected ? 'opacity-100 text-accent' : 'opacity-0'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 border-t border-overlay/[0.06] bg-overlay/[0.02]">
            {!activeTerminalId ? (
              <div className="flex items-center gap-2">
                <AlertCircle size={11} className="text-amber-500/80 flex-shrink-0" />
                <p className="text-[10px] text-amber-500/80">
                  Start a session to use tools
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[10px] text-ink-subtle">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-overlay/[0.06] text-ink-muted">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-overlay/[0.06] text-ink-muted">↵</kbd>
                    Select
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-overlay/[0.06] text-ink-muted">Tab</kbd>
                  Switch
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
