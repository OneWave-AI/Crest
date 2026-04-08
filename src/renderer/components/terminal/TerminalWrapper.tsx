import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  Terminal as TerminalIcon,
  GripVertical,
  SplitSquareVertical,
  Trash2,
  ArrowDownToLine,
  Copy,
  Clock,
  RotateCcw,
  ExternalLink,
  Globe,
  ChevronDown,
  PanelLeft,
  PanelRight,
  Smartphone,
  Monitor,
  Upload,
  FileUp,
  Image,
  FileText,
  Folder,
  Square,
  Zap,
  Hash,
  Brain,
  Hammer,
  Database,
  LayoutGrid,
  ListOrdered
} from 'lucide-react'

import Terminal, { TerminalRef } from './Terminal'
import PreviewBar from './PreviewBar'
import PlanPanel, { PlanItem } from './PlanPanel'
import TaskTimeline, { TimelineAction, ActionType, ActionStatus } from './TaskTimeline'
import VoiceInput from './VoiceInput'
import { HybridChatView } from './HybridChatView'
import { useAppStore } from '../../store'
import { CLI_PROVIDERS } from '../../../shared/providers'
import type { CLIProvider } from '../../../shared/types'

interface Tab {
  id: string
  name: string
  type: 'terminal' | 'browser'
  url?: string
  active: boolean
  cliProvider?: import('../../../shared/types').CLIProvider
}

interface Panel {
  id: string
  tabs: Tab[]
  activeTabId: string
}

export interface TerminalWrapperHandle {
  createGrid: () => void
  addTerminalTab: (panelId: string) => void
  addTerminalPanel: () => void
}

interface TerminalWrapperProps {
  onTerminalData?: (data: string, terminalId: string) => void
  onTerminalIdChange?: (terminalId: string | null) => void
  onAllTerminalIdsChange?: (mapping: Record<string, { tabId: string; panelId: string }>) => void
  onHandleReady?: (handle: TerminalWrapperHandle) => void
  previewUrl?: string | null
  onClosePreview?: () => void
  onOpenPreview?: (url: string) => void
  // Plan props
  showPlanPanel?: boolean
  onClosePlanPanel?: () => void
  onPlanItemsChange?: (items: PlanItem[]) => void
  // Sidebar
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Format duration
const formatDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export default function TerminalWrapper({
  onTerminalData,
  onTerminalIdChange,
  onAllTerminalIdsChange,
  onHandleReady,
  previewUrl,
  onClosePreview,
  onOpenPreview,
  showPlanPanel = false,
  onClosePlanPanel,
  onPlanItemsChange,
  sidebarOpen,
  onToggleSidebar
}: TerminalWrapperProps) {
  // Multi-panel state - initial tab uses store's default provider
  const defaultProvider = useAppStore((state) => state.cliProvider) || 'claude'
  const [panels, setPanels] = useState<Panel[]>([
    {
      id: 'left',
      tabs: [{ id: '1', name: CLI_PROVIDERS[defaultProvider].name, type: 'terminal', active: true, cliProvider: defaultProvider }],
      activeTabId: '1'
    }
  ])

  const [layoutMode, setLayoutMode] = useState<'default' | 'grid'>('default')

  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 })

  // Plus menu state
  const [showPlusMenu, setShowPlusMenu] = useState<string | null>(null) // panel id
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Viewport mode for browser tabs (mobile/desktop)
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop')

  // File upload drag state
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [showUploadMenu, setShowUploadMenu] = useState(false)
  const uploadMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Task timeline state
  const [timelineActions, setTimelineActions] = useState<TimelineAction[]>([])
  const [showTimeline, setShowTimeline] = useState(false)
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const currentActionRef = useRef<string | null>(null)

  // Claude status
  const [claudeStatus, setClaudeStatus] = useState<'working' | 'waiting' | 'idle'>('idle')
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const statusBufferRef = useRef<string>('')

  // Hybrid chat view toggle (per-panel)
  const [chatViewPanels, setChatViewPanels] = useState<Set<string>>(new Set())
  const toggleChatView = useCallback((panelId: string) => {
    setChatViewPanels(prev => {
      const next = new Set(prev)
      if (next.has(panelId)) next.delete(panelId)
      else next.add(panelId)
      return next
    })
  }, [])

  // Plan/Work mode toggle
  const [claudeMode, setClaudeMode] = useState<'plan' | 'work'>('work')

  // Context usage tracking (for Claude CLI context window)
  const [contextUsage, setContextUsage] = useState<{ current: number; max: number; percent: number } | null>(null)

  // Detected localhost URL for preview
  const [detectedLocalhostUrl, setDetectedLocalhostUrl] = useState<string | null>(null)

  // Detected HTML file for auto-preview
  const [detectedHtmlFile, setDetectedHtmlFile] = useState<string | null>(null)
  const lastDetectedFileRef = useRef<string | null>(null)
  const dismissedHtmlFilesRef = useRef<Set<string>>(new Set())
  const lastHtmlDetectionTimeRef = useRef<number>(0)

  // --- Layout persistence for sleep/wake restore ---
  const LAYOUT_KEY = 'crest-terminal-layout'

  // Track terminal IDs per tab for persistence
  const terminalIdMapRef = useRef<Record<string, string>>({}) // tabId -> terminalId

  // Save layout to localStorage whenever panels change
  const saveLayout = useCallback((currentPanels: Panel[]) => {
    try {
      const layout = currentPanels.map((panel) => ({
        id: panel.id,
        activeTabId: panel.activeTabId,
        tabs: panel.tabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          type: tab.type,
          cliProvider: tab.cliProvider,
          terminalId: terminalIdMapRef.current[tab.id] || null,
        })),
      }))
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {}
  }, [])

  // Try to restore layout from localStorage on mount
  const [restoredLayout] = useState<Array<{
    id: string
    activeTabId: string
    tabs: Array<{ id: string; name: string; type: string; cliProvider?: string; terminalId?: string | null }>
  }> | null>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY)
      if (!saved) return null
      return JSON.parse(saved)
    } catch {
      return null
    }
  })

  // On mount, check for surviving PTYs and restore layout
  useEffect(() => {
    if (!restoredLayout) return

    window.api.getTerminals().then((survivingIds: string[]) => {
      if (!survivingIds || survivingIds.length === 0) return

      const survivingSet = new Set(survivingIds)
      // Check if any saved tabs match surviving PTYs
      const hasMatch = restoredLayout.some((panel) =>
        panel.tabs.some((tab) => tab.terminalId && survivingSet.has(tab.terminalId))
      )
      if (!hasMatch) return

      console.log('[TerminalWrapper] Restoring layout with', survivingIds.length, 'surviving PTYs')

      const restoredPanels: Panel[] = restoredLayout.map((savedPanel) => ({
        id: savedPanel.id,
        activeTabId: savedPanel.activeTabId,
        tabs: savedPanel.tabs
          .filter((tab) => tab.type === 'terminal' && tab.terminalId && survivingSet.has(tab.terminalId!))
          .map((tab) => {
            // Populate the terminalIdMap so Terminal gets the existing ID
            if (tab.terminalId) {
              terminalIdMapRef.current[tab.id] = tab.terminalId
            }
            return {
              id: tab.id,
              name: tab.name,
              type: 'terminal' as const,
              active: tab.id === savedPanel.activeTabId,
              cliProvider: (tab.cliProvider || 'claude') as CLIProvider,
            }
          }),
      })).filter((panel) => panel.tabs.length > 0)

      if (restoredPanels.length > 0) {
        // Ensure each panel has a valid activeTabId
        for (const panel of restoredPanels) {
          if (!panel.tabs.find((t) => t.id === panel.activeTabId)) {
            panel.activeTabId = panel.tabs[0].id
          }
        }
        setPanels(restoredPanels)
      }
    }).catch(() => {})
  }, []) // Run once on mount

  // Save layout whenever panels change
  useEffect(() => {
    saveLayout(panels)
  }, [panels, saveLayout])

  // Drag state
  const [draggedTab, setDraggedTab] = useState<{ tabId: string; panelId: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ panelId: string; position: 'tab' | 'left' | 'right' } | null>(null)

  // Session duration
  const [sessionStart] = useState(Date.now())
  const [sessionDuration, setSessionDuration] = useState(0)

  // Memory usage
  const [memoryUsage, setMemoryUsage] = useState(0)

  // CLI Provider from global store (used as default for new tabs)
  const cliProvider = useAppStore((state) => state.cliProvider)

  // Token and cost tracking
  const [tokenCount, setTokenCount] = useState(0)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [currentModel, setCurrentModel] = useState(CLI_PROVIDERS[cliProvider || 'claude'].defaultModel)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  // Plan items state (showPlanPanel comes from props)
  const [planItems, setPlanItems] = useState<PlanItem[]>([])

  // Get cwd from store for todo polling
  const cwd = useAppStore((state) => state.cwd)

  // Poll for todos from JSONL file when plan panel is open
  const lastTodosRef = useRef<string>('')
  useEffect(() => {
    if (!showPlanPanel || !cwd) return

    let isActive = true

    const pollTodos = async () => {
      if (!isActive) return

      try {
        const todos = await window.api.getCurrentSessionTodos(cwd)

        // Create a fingerprint for comparison (includes activeForm for real-time updates)
        const newFingerprint = JSON.stringify(todos.map(t => ({
          content: t.content,
          status: t.status,
          activeForm: t.activeForm
        })))

        // Only update if something actually changed
        if (newFingerprint !== lastTodosRef.current) {
          lastTodosRef.current = newFingerprint

          if (todos && todos.length > 0) {
            setPlanItems(todos.map(t => ({
              id: t.id,
              content: t.content,
              status: t.status as 'pending' | 'in_progress' | 'completed',
              activeForm: t.activeForm,
              createdAt: new Date(t.createdAt)
            })))
          }
          // Note: Don't clear plan items if empty - keep showing until new session starts
        }
      } catch (err) {
        // Silently ignore errors - JSONL might not exist yet
      }
    }

    // Poll immediately and then every 2 seconds
    pollTodos()
    const interval = setInterval(pollTodos, 2000)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [showPlanPanel, cwd])

  // Terminal refs - keyed by tab id
  const terminalRefs = useRef<Map<string, TerminalRef>>(new Map())

  // Debounce ref
  const lastOpenedUrlRef = useRef<{ url: string; time: number } | null>(null)

  // Get active tab from first panel (for backwards compat)
  const activePanel = panels[0]
  const activeTab = activePanel?.tabs.find(t => t.id === activePanel.activeTabId)

  // Derive provider config from the active tab's provider (per-tab model)
  const activeTabProvider = activeTab?.cliProvider || cliProvider || 'claude'
  const providerConfig = CLI_PROVIDERS[activeTabProvider]

  // Get active terminal ID
  const activeTerminalId = activeTab?.type === 'terminal'
    ? terminalRefs.current.get(activeTab.id)?.getTerminalId() || null
    : null

  // Reset per-tab state when switching to a tab with a different provider
  useEffect(() => {
    setCurrentModel(providerConfig.defaultModel)
    // Reset status detection buffer so old provider's patterns don't linger
    statusBufferRef.current = ''
    setClaudeStatus('idle')
  }, [activeTabProvider])

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(null)
      }
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false)
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Update session duration
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - sessionStart) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionStart])

  // Update memory usage
  useEffect(() => {
    const updateMemory = () => {
      if ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory) {
        setMemoryUsage((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize)
      }
    }
    updateMemory()
    const interval = setInterval(updateMemory, 5000)
    return () => clearInterval(interval)
  }, [])

  // Cleanup status timeout
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  // Notify parent of plan items changes
  useEffect(() => {
    onPlanItemsChange?.(planItems)
  }, [planItems, onPlanItemsChange])

  // Add tab to panel
  const addTab = useCallback((panelId: string, type: 'terminal' | 'browser', provider?: CLIProvider) => {
    setShowPlusMenu(null)
    const tabProvider = provider || cliProvider || 'claude'
    const providerName = CLI_PROVIDERS[tabProvider].name

    setPanels(prev => prev.map(panel => {
      if (panel.id !== panelId) return panel

      const termCount = panel.tabs.filter(t => t.type === 'terminal' && t.cliProvider === tabProvider).length + 1
      const newTab: Tab = {
        id: Date.now().toString(),
        name: type === 'terminal' ? `${providerName} ${termCount}` : 'New Tab',
        type,
        url: type === 'browser' ? '' : undefined,
        active: true,
        cliProvider: type === 'terminal' ? tabProvider : undefined
      }

      return {
        ...panel,
        tabs: panel.tabs.map(t => ({ ...t, active: false })).concat(newTab),
        activeTabId: newTab.id
      }
    }))
  }, [cliProvider])

  // Add second panel
  const addPanel = useCallback((type: 'terminal' | 'browser', provider?: CLIProvider) => {
    if (layoutMode === 'default' && panels.length >= 2) return
    const tabProvider = provider || cliProvider || 'claude'

    const newTab: Tab = {
      id: Date.now().toString(),
      name: type === 'terminal' ? `${CLI_PROVIDERS[tabProvider].name} 1` : 'New Tab',
      type,
      url: type === 'browser' ? '' : undefined,
      active: true,
      cliProvider: type === 'terminal' ? tabProvider : undefined
    }

    setPanels(prev => [...prev, {
      id: 'right',
      tabs: [newTab],
      activeTabId: newTab.id
    }])
    setShowPlusMenu(null)
  }, [panels.length, layoutMode, cliProvider])

  // Create 3x2 grid layout with 6 terminal panels
  const createGridLayout = useCallback(() => {
    const now = Date.now()
    const gridProvider = cliProvider || 'claude'
    const gridPanels: Panel[] = Array.from({ length: 6 }, (_, i) => ({
      id: `grid-${i}`,
      tabs: [{
        id: `${now}-${i}`,
        name: `${CLI_PROVIDERS[gridProvider].name} ${i + 1}`,
        type: 'terminal' as const,
        active: true,
        cliProvider: gridProvider
      }],
      activeTabId: `${now}-${i}`
    }))
    setPanels(gridPanels)
    setLayoutMode('grid')
    setShowPlusMenu(null)
  }, [cliProvider])

  // Exit grid layout back to single panel
  const exitGridLayout = useCallback(() => {
    setPanels(prev => {
      if (prev.length === 0) {
        const fallbackId = Date.now().toString()
        const fallbackProvider = cliProvider || 'claude'
        return [{
          id: 'left',
          tabs: [{ id: fallbackId, name: CLI_PROVIDERS[fallbackProvider].name, type: 'terminal' as const, active: true, cliProvider: fallbackProvider }],
          activeTabId: fallbackId
        }]
      }
      return [{ ...prev[0], id: 'left' }]
    })
    setLayoutMode('default')
  }, [cliProvider])

  // Expose handle for external control (e.g., Orchestrator)
  useEffect(() => {
    if (onHandleReady) {
      onHandleReady({
        createGrid: createGridLayout,
        addTerminalTab: (panelId: string) => addTab(panelId, 'terminal'),
        addTerminalPanel: () => addPanel('terminal')
      })
    }
  }, [onHandleReady, createGridLayout, addTab, addPanel])

  // Close tab
  const closeTab = useCallback((panelId: string, tabId: string) => {
    let shouldExitGrid = false

    setPanels(prev => {
      const panelIndex = prev.findIndex(p => p.id === panelId)
      if (panelIndex === -1) return prev

      const panel = prev[panelIndex]

      // If only one tab in only one panel, don't close
      if (panel.tabs.length === 1 && prev.length === 1) return prev

      // If only one tab but multiple panels, remove the panel
      if (panel.tabs.length === 1) {
        const remaining = prev.filter(p => p.id !== panelId)
        // Auto-exit grid mode when down to 1 panel
        if (remaining.length === 1 && layoutMode === 'grid') {
          shouldExitGrid = true
          return [{ ...remaining[0], id: 'left' }]
        }
        return remaining
      }

      // Remove tab and select another
      const newTabs = panel.tabs.filter(t => t.id !== tabId)
      const wasActive = panel.activeTabId === tabId
      const newActiveId = wasActive ? newTabs[newTabs.length - 1].id : panel.activeTabId

      return prev.map(p => {
        if (p.id !== panelId) return p
        return { ...p, tabs: newTabs, activeTabId: newActiveId }
      })
    })

    if (shouldExitGrid) {
      setLayoutMode('default')
    }
  }, [layoutMode])

  // Select tab
  const selectTab = useCallback((panelId: string, tabId: string) => {
    setPanels(prev => {
      const newPanels = prev.map(panel => {
        if (panel.id !== panelId) return panel
        return {
          ...panel,
          tabs: panel.tabs.map(t => ({ ...t, active: t.id === tabId })),
          activeTabId: tabId
        }
      })

      // Notify parent of terminal ID change when switching to a terminal tab in the left panel
      if (panelId === 'left') {
        const panel = newPanels.find(p => p.id === 'left')
        const tab = panel?.tabs.find(t => t.id === tabId)
        if (tab?.type === 'terminal') {
          const terminalRef = terminalRefs.current.get(tabId)
          const terminalId = terminalRef?.getTerminalId() || null
          // Use setTimeout to ensure state update completes first
          setTimeout(() => onTerminalIdChange?.(terminalId), 0)
        }
      }

      return newPanels
    })
  }, [onTerminalIdChange])

  // Drag handlers for tabs between panels
  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string, panelId: string) => {
    setDraggedTab({ tabId, panelId })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({ tabId, panelId }))

    // Create custom drag image
    const dragEl = e.currentTarget.cloneNode(true) as HTMLElement
    dragEl.style.opacity = '0.8'
    dragEl.style.transform = 'scale(1.05)'
    document.body.appendChild(dragEl)
    e.dataTransfer.setDragImage(dragEl, 50, 20)
    setTimeout(() => document.body.removeChild(dragEl), 0)
  }, [])

  const handleTabDragOver = useCallback((e: React.DragEvent, panelId: string, position: 'tab' | 'left' | 'right') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ panelId, position })
  }, [])

  const handleTabDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleTabDrop = useCallback((e: React.DragEvent, targetPanelId: string) => {
    e.preventDefault()
    if (!draggedTab) return

    const { tabId, panelId: sourcePanelId } = draggedTab

    // If dropping in same panel, just reorder
    if (sourcePanelId === targetPanelId) {
      setDraggedTab(null)
      setDropTarget(null)
      return
    }

    setPanels(prev => {
      // Find source panel and tab
      const sourcePanel = prev.find(p => p.id === sourcePanelId)
      if (!sourcePanel) return prev

      const tab = sourcePanel.tabs.find(t => t.id === tabId)
      if (!tab) return prev

      // If source panel only has one tab, remove the panel
      if (sourcePanel.tabs.length === 1) {
        return prev
          .filter(p => p.id !== sourcePanelId)
          .map(p => {
            if (p.id !== targetPanelId) return p
            return {
              ...p,
              tabs: [...p.tabs.map(t => ({ ...t, active: false })), { ...tab, active: true }],
              activeTabId: tab.id
            }
          })
      }

      // Otherwise move tab between panels
      return prev.map(p => {
        if (p.id === sourcePanelId) {
          const newTabs = p.tabs.filter(t => t.id !== tabId)
          const newActiveId = p.activeTabId === tabId ? newTabs[0]?.id : p.activeTabId
          return { ...p, tabs: newTabs, activeTabId: newActiveId || '' }
        }
        if (p.id === targetPanelId) {
          return {
            ...p,
            tabs: [...p.tabs.map(t => ({ ...t, active: false })), { ...tab, active: true }],
            activeTabId: tab.id
          }
        }
        return p
      })
    })

    setDraggedTab(null)
    setDropTarget(null)
  }, [draggedTab])

  const handlePanelDrop = useCallback((e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault()
    if (!draggedTab || (layoutMode === 'default' && panels.length >= 2)) {
      setDraggedTab(null)
      setDropTarget(null)
      return
    }

    const { tabId, panelId: sourcePanelId } = draggedTab

    setPanels(prev => {
      const sourcePanel = prev.find(p => p.id === sourcePanelId)
      if (!sourcePanel) return prev

      const tab = sourcePanel.tabs.find(t => t.id === tabId)
      if (!tab) return prev

      // Create new panel
      const newPanel: Panel = {
        id: side,
        tabs: [{ ...tab, active: true }],
        activeTabId: tab.id
      }

      // Remove tab from source
      if (sourcePanel.tabs.length === 1) {
        // Replace the source panel with new panel in correct position
        return side === 'left' ? [newPanel, ...prev.filter(p => p.id !== sourcePanelId)] : [...prev.filter(p => p.id !== sourcePanelId), newPanel]
      }

      const updatedSource = {
        ...sourcePanel,
        tabs: sourcePanel.tabs.filter(t => t.id !== tabId),
        activeTabId: sourcePanel.activeTabId === tabId ? sourcePanel.tabs.filter(t => t.id !== tabId)[0]?.id || '' : sourcePanel.activeTabId
      }

      return side === 'left'
        ? [newPanel, ...prev.map(p => p.id === sourcePanelId ? updatedSource : p)]
        : [...prev.map(p => p.id === sourcePanelId ? updatedSource : p), newPanel]
    })

    setDraggedTab(null)
    setDropTarget(null)
  }, [draggedTab, panels.length])

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null)
    setDropTarget(null)
  }, [])


  // Quick actions
  const handleClear = useCallback(() => {
    terminalRefs.current.forEach(ref => ref?.clear())
  }, [])

  const handleScrollToBottom = useCallback(() => {
    terminalRefs.current.forEach(ref => ref?.scrollToBottom())
  }, [])

  const handleCopyAll = useCallback(() => {
    const activeRef = terminalRefs.current.get(activeTab?.id || '')
    activeRef?.copyAll()
  }, [activeTab?.id])

  // Kill current process (send Ctrl+C)
  const handleKill = useCallback(() => {
    if (activeTerminalId) {
      window.api.terminalSendText('\x03', activeTerminalId) // Ctrl+C
    }
  }, [activeTerminalId])

  // Switch model (provider-aware)
  const handleModelChange = useCallback((model: string) => {
    setCurrentModel(model)
    setShowModelMenu(false)
    if (activeTerminalId && providerConfig.modelCommand) {
      window.api.terminalSendText(`${providerConfig.modelCommand} ${model}\n`, activeTerminalId)
    }
  }, [activeTerminalId, providerConfig.modelCommand])

  // Toggle Plan/Work mode - sends shift+tab to Claude CLI (only if provider supports it)
  const handleModeToggle = useCallback(() => {
    if (!providerConfig.hasPlanMode) return
    const newMode = claudeMode === 'plan' ? 'work' : 'plan'
    setClaudeMode(newMode)
    if (activeTerminalId) {
      window.api.terminalSendText('\x1b[Z', activeTerminalId) // Shift+Tab escape sequence
    }
  }, [activeTerminalId, claudeMode, providerConfig.hasPlanMode])

  // Screenshot terminal - copies terminal content to clipboard
  const handleScreenshot = useCallback(() => {
    const activeRef = terminalRefs.current.get(activeTab?.id || '')
    if (activeRef) {
      activeRef.copyAll()
    }
  }, [activeTab?.id])

  // Voice input handler - sends transcribed text to terminal
  const handleVoiceTranscript = useCallback((text: string) => {
    if (activeTerminalId && text.trim()) {
      // Send the transcribed text to the terminal
      window.api.terminalSendText(text.trim(), activeTerminalId)
    }
  }, [activeTerminalId])

  // Token and cost tracking from terminal output
  const trackTokensAndCost = useCallback((data: string) => {
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

    // Detect model from output (Claude usually shows model info)
    const modelMatch = cleanData.match(/claude-3[.-]?(opus|sonnet|haiku)/i) ||
                       cleanData.match(/model[:\s]+(opus|sonnet|haiku)/i)
    if (modelMatch) {
      setCurrentModel(modelMatch[1].toLowerCase() as 'opus' | 'sonnet' | 'haiku')
    }

    // Detect token counts from Claude output patterns
    // Claude Code shows: "Input tokens: X, Output tokens: Y" or similar
    const tokenMatch = cleanData.match(/(\d+[,.]?\d*)\s*(?:tokens?|tok)/gi)
    if (tokenMatch) {
      const tokens = tokenMatch.map(t => parseInt(t.replace(/[^\d]/g, '')) || 0)
      const totalNewTokens = tokens.reduce((a, b) => a + b, 0)
      if (totalNewTokens > 0 && totalNewTokens < 100000) {
        setTokenCount(prev => prev + totalNewTokens)

        // Estimate cost based on model
        // Approximate rates: Opus $15/1M in, $75/1M out | Sonnet $3/1M in, $15/1M out | Haiku $0.25/1M in, $1.25/1M out
        const rates: Record<string, number> = {
          opus: 0.000045, // ~$45/1M average
          sonnet: 0.000009, // ~$9/1M average
          haiku: 0.00000075 // ~$0.75/1M average
        }
        const rate = rates[currentModel] || rates.sonnet
        setEstimatedCost(prev => prev + (totalNewTokens * rate))
      }
    }

    // Also estimate tokens from text length (rough: ~4 chars per token)
    // Only if no explicit token count found
    if (!tokenMatch && cleanData.length > 100) {
      const estimatedTokens = Math.floor(cleanData.length / 4)
      // Only add significant chunks to avoid noise
      if (estimatedTokens > 50) {
        setTokenCount(prev => prev + Math.floor(estimatedTokens * 0.1)) // Conservative estimate
      }
    }
  }, [currentModel])

  // Detect context usage from Claude CLI output
  // Claude CLI shows context like: "45K / 128K tokens" or "35% context" or similar patterns
  const detectContextUsage = useCallback((data: string) => {
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

    // Pattern 1: "XK / YK tokens" or "X,XXX / Y,XXX tokens"
    const tokenRatioMatch = cleanData.match(/(\d+[,.]?\d*)\s*[Kk]?\s*\/\s*(\d+[,.]?\d*)\s*[Kk]?\s*(?:tokens?|tok)/i)
    if (tokenRatioMatch) {
      let current = parseFloat(tokenRatioMatch[1].replace(/,/g, ''))
      let max = parseFloat(tokenRatioMatch[2].replace(/,/g, ''))

      // Check if values have K suffix (thousands)
      if (tokenRatioMatch[1].toLowerCase().includes('k') || current < 500) {
        current = current * 1000
      }
      if (tokenRatioMatch[2].toLowerCase().includes('k') || max < 500) {
        max = max * 1000
      }

      const percent = Math.round((current / max) * 100)
      setContextUsage({ current, max, percent })
      return
    }

    // Pattern 2: "X% context" or "context: X%" or "X% used"
    const percentMatch = cleanData.match(/(\d+)\s*%\s*(?:context|used|usage)/i) ||
                         cleanData.match(/context[:\s]+(\d+)\s*%/i)
    if (percentMatch) {
      const percent = parseInt(percentMatch[1])
      // Estimate tokens based on typical 200K context window
      const max = 200000
      const current = Math.round((percent / 100) * max)
      setContextUsage({ current, max, percent })
      return
    }

    // Pattern 3: Claude Code status line patterns like "[context: 45K/128K]" or "Context window: 45000/128000"
    const statusLineMatch = cleanData.match(/context[:\s]*(\d+[,.]?\d*)\s*[Kk]?\s*[\/|of]\s*(\d+[,.]?\d*)\s*[Kk]?/i)
    if (statusLineMatch) {
      let current = parseFloat(statusLineMatch[1].replace(/,/g, ''))
      let max = parseFloat(statusLineMatch[2].replace(/,/g, ''))

      // Handle K notation
      if (current < 1000 && max < 1000) {
        current = current * 1000
        max = max * 1000
      }

      const percent = Math.round((current / max) * 100)
      setContextUsage({ current, max, percent })
    }
  }, [])

  // Parse plan items from Claude's TodoWrite output
  const parsePlanItems = useCallback((data: string) => {
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

    // Check for Claude Code's "Your todo list has changed" format
    // Format: "Your todo list has changed. ... [{"content":"...", "status":"...", "activeForm":"..."}]"
    const todoListMatch = cleanData.match(/todo list|TodoWrite|Todos have been modified/i)

    // Look for JSON array after the todo list indicator
    const jsonMatch = cleanData.match(/\[\s*\{[^[\]]*"content"[^[\]]*\}(?:\s*,\s*\{[^[\]]*"content"[^[\]]*\})*\s*\]/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].content) {
          const newItems: PlanItem[] = parsed.map((item: { content: string; status: string; activeForm?: string }, index: number) => ({
            id: `plan-json-${Date.now()}-${index}`,
            content: item.content || 'Unknown task',
            status: (item.status as 'pending' | 'in_progress' | 'completed') || 'pending',
            createdAt: new Date(),
            completedAt: item.status === 'completed' ? new Date() : undefined
          }))
          setPlanItems(newItems)
          return
        }
      } catch {
        // Not valid JSON, try alternative pattern
      }
    }

    // Alternative: Match simpler JSON format with curly braces
    // Pattern: {"content":"...", "status":"..."}
    const simpleJsonMatch = cleanData.match(/\[\{[^\]]+\}\]/)
    if (simpleJsonMatch) {
      try {
        const parsed = JSON.parse(simpleJsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].content) {
          const newItems: PlanItem[] = parsed.map((item: { content: string; status: string; activeForm?: string }, index: number) => ({
            id: `plan-json-${Date.now()}-${index}`,
            content: item.content || 'Unknown task',
            status: (item.status as 'pending' | 'in_progress' | 'completed') || 'pending',
            createdAt: new Date(),
            completedAt: item.status === 'completed' ? new Date() : undefined
          }))
          setPlanItems(newItems)
          return
        }
      } catch {
        // Continue with other patterns
      }
    }

    // Detect TodoWrite patterns:
    // - "✓ Task completed" or "✔ Task"
    // - "● Task in progress" or "○ Task pending"
    // - "- [x] Task" (markdown checkbox completed)
    // - "- [ ] Task" (markdown checkbox pending)
    // - "1. [completed] Task"
    // - "1. [in_progress] Task"
    // - "1. [pending] Task"

    // Numbered list with status: "1. [completed] Task"
    const numberedPattern = /^\s*\d+\.\s*\[(completed|in_progress|pending)\]\s*(.+)$/gm
    let match

    while ((match = numberedPattern.exec(cleanData)) !== null) {
      const status = match[1] as 'completed' | 'in_progress' | 'pending'
      const content = match[2].trim()

      setPlanItems(prev => {
        // Check if task exists
        const existingIndex = prev.findIndex(p => p.content === content)
        if (existingIndex !== -1) {
          // Update status
          const updated = [...prev]
          updated[existingIndex] = {
            ...updated[existingIndex],
            status,
            completedAt: status === 'completed' ? new Date() : undefined
          }
          return updated
        }

        // Add new task
        return [...prev, {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content,
          status,
          createdAt: new Date(),
          completedAt: status === 'completed' ? new Date() : undefined
        }]
      })
    }

    // Markdown checkboxes: "- [x] Task" or "- [ ] Task"
    const checkboxPattern = /^\s*-\s*\[(x| )\]\s*(.+)$/gm

    while ((match = checkboxPattern.exec(cleanData)) !== null) {
      const status = match[1] === 'x' ? 'completed' : 'pending'
      const content = match[2].trim()

      setPlanItems(prev => {
        const existingIndex = prev.findIndex(p => p.content === content)
        if (existingIndex !== -1) {
          const updated = [...prev]
          updated[existingIndex] = {
            ...updated[existingIndex],
            status,
            completedAt: status === 'completed' ? new Date() : undefined
          }
          return updated
        }

        return [...prev, {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content,
          status,
          createdAt: new Date()
        }]
      })
    }

    // Unicode checkmarks: "✓ Task" (completed) or "○ Task" (pending) or "● Task" (in progress)
    const completedPattern = /^\s*[✓✔]\s*(.+)$/gm
    const inProgressPattern = /^\s*●\s*(.+)$/gm
    const pendingPattern = /^\s*○\s*(.+)$/gm

    while ((match = completedPattern.exec(cleanData)) !== null) {
      const content = match[1].trim()
      setPlanItems(prev => {
        const existingIndex = prev.findIndex(p => p.content === content)
        if (existingIndex !== -1) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], status: 'completed', completedAt: new Date() }
          return updated
        }
        return [...prev, {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content,
          status: 'completed',
          createdAt: new Date(),
          completedAt: new Date()
        }]
      })
    }

    while ((match = inProgressPattern.exec(cleanData)) !== null) {
      const content = match[1].trim()
      setPlanItems(prev => {
        const existingIndex = prev.findIndex(p => p.content === content)
        if (existingIndex !== -1) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], status: 'in_progress' }
          return updated
        }
        return [...prev, {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content,
          status: 'in_progress',
          createdAt: new Date()
        }]
      })
    }

    while ((match = pendingPattern.exec(cleanData)) !== null) {
      const content = match[1].trim()
      setPlanItems(prev => {
        const existingIndex = prev.findIndex(p => p.content === content)
        if (existingIndex !== -1) return prev // Don't overwrite existing
        return [...prev, {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content,
          status: 'pending',
          createdAt: new Date()
        }]
      })
    }
  }, [])

  // Claude status detection - accumulate buffer for better detection
  const providerConfigRef = useRef(providerConfig)
  providerConfigRef.current = providerConfig
  const detectClaudeStatus = useCallback((data: string) => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)

    // Accumulate data in buffer (keep last 5000 chars)
    statusBufferRef.current = (statusBufferRef.current + data).slice(-5000)
    const cleanData = statusBufferRef.current.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    const lastLines = cleanData.split('\n').slice(-15).join('\n')

    // Use provider-specific patterns for detection (via ref to avoid stale closure)
    const config = providerConfigRef.current
    const workingPatterns = config.workingPatterns

    // Waiting patterns from provider config
    const waitingPatterns = [
      ...config.waitingPatterns,
      /✓ built in \d+/i                               // Build completed
    ]

    // Check working patterns first (higher priority)
    for (const pattern of workingPatterns) {
      if (pattern.test(lastLines)) {
        setClaudeStatus('working')
        // Longer timeout - give Claude time to work
        statusTimeoutRef.current = setTimeout(() => setClaudeStatus('waiting'), 5000)
        return
      }
    }

    // Check waiting patterns
    for (const pattern of waitingPatterns) {
      if (pattern.test(lastLines)) {
        setClaudeStatus('waiting')
        return
      }
    }

    // If we have recent output but no clear pattern, assume working
    // Only switch to waiting after a longer timeout
    if (data.trim().length > 0) {
      setClaudeStatus('working')
      statusTimeoutRef.current = setTimeout(() => setClaudeStatus('waiting'), 5000)
    }
  }, [])

  // HTML file detection - only for explicit file creation messages
  const detectHtmlFile = useCallback((data: string) => {
    // Debounce: don't detect more than once every 3 seconds
    const now = Date.now()
    if (now - lastHtmlDetectionTimeRef.current < 3000) return

    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

    // Only match explicit file creation patterns - NOT just any .html path
    const patterns = [
      /(?:created|wrote|saved|generated)\s+(?:file\s+)?["']?([^\s"']+\.html)["']?/i,
      /(?:file is ready at|file saved to|output saved to)\s+["']?([^\s"']+\.html)["']?/i,
      /Writing to:\s*["']?([^\s"']+\.html)["']?/i,
      /✓\s+(?:wrote|created)\s+["']?([^\s"']+\.html)["']?/i
    ]

    for (const pattern of patterns) {
      const match = cleanData.match(pattern)
      if (match && match[1]) {
        const filePath = match[1].startsWith('~') ? match[1].replace('~', '') : match[1]

        // Skip if same as last detection or already dismissed
        if (filePath === lastDetectedFileRef.current) return
        if (dismissedHtmlFilesRef.current.has(filePath)) return

        lastDetectedFileRef.current = filePath
        lastHtmlDetectionTimeRef.current = now
        setDetectedHtmlFile(filePath)
        return
      }
    }
  }, [])

  // Watch preview file
  useEffect(() => {
    if (!previewUrl) return
    const filePath = previewUrl.replace('file://', '')
    window.api.watchFile(filePath)
    window.api.onFileChanged((changedPath) => {
      if (changedPath === filePath) {
        const webview = document.getElementById('preview-iframe') as Electron.WebviewTag | null
        if (webview && 'reload' in webview) webview.reload()
      }
    })
    return () => { window.api.unwatchFile(filePath) }
  }, [previewUrl])

  // Preview handlers
  const handlePreviewHtmlFile = useCallback((filePath: string) => {
    // Add to dismissed set so it doesn't reappear
    dismissedHtmlFilesRef.current.add(filePath)
    setDetectedHtmlFile(null)
    if (onOpenPreview) onOpenPreview(filePath)
    else window.api.openFileExternal(filePath)
  }, [onOpenPreview])

  const handleDismissHtmlFile = useCallback(() => {
    // Add to dismissed set so it doesn't reappear
    if (detectedHtmlFile) {
      dismissedHtmlFilesRef.current.add(detectedHtmlFile)
    }
    setDetectedHtmlFile(null)
  }, [detectedHtmlFile])
  const handleLocalhostDetected = useCallback((url: string) => setDetectedLocalhostUrl(url), [])
  const handleDismissPreview = useCallback(() => setDetectedLocalhostUrl(null), [])

  const handleOpenPreview = useCallback((url: string) => {
    const now = Date.now()
    if (lastOpenedUrlRef.current && lastOpenedUrlRef.current.url === url && now - lastOpenedUrlRef.current.time < 2000) return
    lastOpenedUrlRef.current = { url, time: now }
    if (onOpenPreview) {
      onOpenPreview(url)
      setDetectedLocalhostUrl(null)
    } else {
      window.api.openUrlExternal(url)
    }
  }, [onOpenPreview])

  const handleOpenInBrowser = useCallback((url: string) => {
    const now = Date.now()
    if (lastOpenedUrlRef.current && lastOpenedUrlRef.current.url === url && now - lastOpenedUrlRef.current.time < 2000) return
    lastOpenedUrlRef.current = { url, time: now }
    window.api.openUrlExternal(url)
  }, [])

  // File upload handlers
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFile(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && activeTerminalId) {
      // Format file paths for Claude - wrap in quotes if spaces, join with newlines
      const filePaths = files.map(f => {
        const path = (f as File & { path?: string }).path || f.name
        return path.includes(' ') ? `"${path}"` : path
      }).join('\n')

      // Send to terminal with a helpful prefix
      const message = files.length === 1
        ? `Here's the file: ${filePaths}`
        : `Here are ${files.length} files:\n${filePaths}`

      window.api.terminalSendText(message, activeTerminalId)
    }
  }, [activeTerminalId])

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true)
    }
  }, [])

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only hide if leaving the container entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDraggingFile(false)
    }
  }, [])

  const handleFileSelect = useCallback(async (type: 'file' | 'folder' | 'image') => {
    if (!activeTerminalId) return
    setShowUploadMenu(false)

    try {
      let result: string | null = null

      if (type === 'folder') {
        result = await window.api.selectFolder()
      } else {
        // Use a hidden file input for file selection
        const input = fileInputRef.current
        if (input) {
          input.accept = type === 'image' ? 'image/*' : '*'
          input.click()
        }
        return
      }

      if (result) {
        const message = `Here's the ${type}: ${result.includes(' ') ? `"${result}"` : result}`
        window.api.terminalSendText(message, activeTerminalId)
      }
    } catch (err) {
      console.error('File selection failed:', err)
    }
  }, [activeTerminalId])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && activeTerminalId) {
      const filePaths = Array.from(files).map(f => {
        const path = (f as File & { path?: string }).path || f.name
        return path.includes(' ') ? `"${path}"` : path
      }).join('\n')

      const message = files.length === 1
        ? `Here's the file: ${filePaths}`
        : `Here are ${files.length} files:\n${filePaths}`

      window.api.terminalSendText(message, activeTerminalId)
    }
    // Reset input
    e.target.value = ''
  }, [activeTerminalId])

  // Timeline action tracking - with debouncing
  const lastActionRef = useRef<{ type: ActionType; title: string; time: number } | null>(null)
  const DEBOUNCE_MS = 1500

  const addTimelineAction = useCallback((
    type: ActionType,
    title: string,
    options?: {
      description?: string
      file?: string
      details?: string
      status?: ActionStatus
    }
  ) => {
    const now = Date.now()
    if (lastActionRef.current) {
      const { type: lastType, title: lastTitle, time: lastTime } = lastActionRef.current
      if (lastType === type && lastTitle === title && (now - lastTime) < DEBOUNCE_MS) {
        return null
      }
    }

    const id = `action-${now}-${Math.random().toString(36).slice(2, 7)}`
    const action: TimelineAction = {
      id,
      type,
      title,
      description: options?.description,
      file: options?.file,
      details: options?.details,
      timestamp: new Date(),
      status: options?.status || 'running'
    }
    setTimelineActions(prev => [...prev, action])
    currentActionRef.current = id
    lastActionRef.current = { type, title, time: now }
    return id
  }, [])

  const completeTimelineAction = useCallback((id: string, success: boolean = true, details?: string) => {
    setTimelineActions(prev => prev.map(action => {
      if (action.id !== id) return action
      return {
        ...action,
        status: success ? 'success' : 'error',
        duration: Date.now() - action.timestamp.getTime(),
        details: details || action.details
      }
    }))
    if (currentActionRef.current === id) {
      currentActionRef.current = null
    }
  }, [])

  const clearTimeline = useCallback(() => {
    setTimelineActions([])
    currentActionRef.current = null
  }, [])

  // Parse terminal output for Claude actions - enhanced with more patterns
  const parseClaudeAction = useCallback((data: string) => {
    const toolPatterns = [
      // Spinner-prefixed tool invocations
      { pattern: /⏳.*?(?:Read|Reading)\s+([^\s\n]+)/i, type: 'read' as ActionType, getTitle: (m: RegExpMatchArray) => `Reading ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /⏳.*?(?:Write|Writing)\s+([^\s\n]+)/i, type: 'write' as ActionType, getTitle: (m: RegExpMatchArray) => `Writing ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /⏳.*?(?:Edit|Editing)\s+([^\s\n]+)/i, type: 'edit' as ActionType, getTitle: (m: RegExpMatchArray) => `Editing ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /⏳.*?Bash\s*(?:\(([^)]*)\))?/i, type: 'bash' as ActionType, getTitle: (m: RegExpMatchArray) => m[1] ? `Running: ${m[1].slice(0, 40)}` : 'Running command' },
      { pattern: /⏳.*?(?:Glob|Grep)\s*(?:\(([^)]*)\))?/i, type: 'search' as ActionType, getTitle: (m: RegExpMatchArray) => m[1] ? `Searching: ${m[1].slice(0, 40)}` : 'Searching files' },
      { pattern: /⏳.*?(?:WebFetch|WebSearch)/i, type: 'browser' as ActionType, getTitle: () => 'Fetching web' },
      { pattern: /⏳.*?TodoWrite/i, type: 'tool' as ActionType, getTitle: () => 'Updating tasks' },
      { pattern: /⏳.*?Task\s*(?:\(([^)]*)\))?/i, type: 'tool' as ActionType, getTitle: (m: RegExpMatchArray) => m[1] ? `Agent: ${m[1].slice(0, 40)}` : 'Running agent' },
      { pattern: /⏳.*?(?:NotebookEdit|NotebookRead)/i, type: 'tool' as ActionType, getTitle: () => 'Editing notebook' },
      // Line-start tool names
      { pattern: /^(?:│\s*)?Read\s+(\/[^\s]+)/m, type: 'read' as ActionType, getTitle: (m: RegExpMatchArray) => `Reading ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /^(?:│\s*)?Write\s+(\/[^\s]+)/m, type: 'write' as ActionType, getTitle: (m: RegExpMatchArray) => `Writing ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /^(?:│\s*)?Edit\s+(\/[^\s]+)/m, type: 'edit' as ActionType, getTitle: (m: RegExpMatchArray) => `Editing ${m[1].split('/').pop()}`, getFile: (m: RegExpMatchArray) => m[1] },
      { pattern: /^(?:│\s*)?Bash\s*\(([^)]*)\)/m, type: 'bash' as ActionType, getTitle: (m: RegExpMatchArray) => `Running: ${m[1].slice(0, 50)}` },
      // Test results
      { pattern: /(\d+)\s+(?:tests?\s+)?passed/i, type: 'tool' as ActionType, getTitle: (m: RegExpMatchArray) => `${m[1]} tests passed`, getFile: undefined },
      { pattern: /(\d+)\s+(?:tests?\s+)?failed/i, type: 'tool' as ActionType, getTitle: (m: RegExpMatchArray) => `${m[1]} tests failed`, getFile: undefined },
      // Git operations
      { pattern: /^(?:│\s*)?(?:git\s+(?:commit|push|pull|merge|checkout|branch))\b/im, type: 'bash' as ActionType, getTitle: (m: RegExpMatchArray) => `Git: ${m[0].trim().slice(0, 40)}` },
      // npm/package operations
      { pattern: /(?:npm|yarn|pnpm|bun)\s+(?:install|build|run|test)\b/i, type: 'bash' as ActionType, getTitle: (m: RegExpMatchArray) => m[0].trim().slice(0, 50) },
    ]

    const successPattern = /✓|✔|Done|Completed successfully|Successfully/
    const errorPattern = /✗|✘|Error:|Failed:|error\[/

    for (const { pattern, type, getTitle, getFile } of toolPatterns) {
      const match = data.match(pattern)
      if (match) {
        if (currentActionRef.current) {
          const isSuccess = successPattern.test(data)
          const isError = errorPattern.test(data)
          if (isSuccess || isError) {
            completeTimelineAction(currentActionRef.current, isSuccess)
          }
        }
        addTimelineAction(type, getTitle(match), {
          file: getFile?.(match)
        })
        return
      }
    }

    if (currentActionRef.current) {
      if (successPattern.test(data)) {
        completeTimelineAction(currentActionRef.current, true)
      } else if (errorPattern.test(data)) {
        completeTimelineAction(currentActionRef.current, false)
      }
    }
  }, [addTimelineAction, completeTimelineAction])

  // Update browser tab URL
  const updateBrowserUrl = useCallback((panelId: string, tabId: string, url: string) => {
    setPanels(prev => prev.map(panel => {
      if (panel.id !== panelId) return panel
      return {
        ...panel,
        tabs: panel.tabs.map(tab => {
          if (tab.id !== tabId) return tab
          const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
          return { ...tab, url, name: displayUrl || 'New Tab' }
        })
      }
    }))
  }, [])

  // Navigate browser
  const navigateBrowser = useCallback((panelId: string, tabId: string) => {
    const panel = panels.find(p => p.id === panelId)
    const tab = panel?.tabs.find(t => t.id === tabId)
    if (!tab?.url) return

    let url = tab.url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    updateBrowserUrl(panelId, tabId, url)
  }, [panels, updateBrowserUrl])

  // Render panel
  const renderPanel = (panel: Panel, isOnly: boolean) => {
    const currentTab = panel.tabs.find(t => t.id === panel.activeTabId)
    const isDropping = dropTarget?.panelId === panel.id
    const isGrid = layoutMode === 'grid'

    return (
      <div
        key={panel.id}
        className={`h-full flex flex-col bg-[#0d0d0d] ${isGrid ? '' : isOnly ? 'flex-1' : 'w-1/2'} ${isDropping ? 'ring-2 ring-[#cc785c]/50 ring-inset' : ''}`}
        onDragOver={(e) => handleTabDragOver(e, panel.id, 'tab')}
        onDragLeave={handleTabDragLeave}
        onDrop={(e) => handleTabDrop(e, panel.id)}
      >
        {/* Panel Tab Bar */}
        {isGrid ? (
          /* Compact grid mode header */
          <div className="flex items-center justify-between px-2 py-0.5 bg-[#111111] border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <TerminalIcon size={9} className={panel.tabs[0]?.cliProvider === 'codex' ? 'text-emerald-400' : 'text-[#cc785c]'} />
              <span className="text-[10px] font-medium text-gray-500">{panel.tabs[0]?.name || 'Terminal'}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={exitGridLayout}
                className="px-1.5 py-0.5 rounded text-[9px] font-medium text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
                title="Exit grid layout"
              >
                Exit
              </button>
              {panels.length > 1 && (
                <button
                  onClick={() => {
                    let shouldExit = false
                    setPanels(prev => {
                      const remaining = prev.filter(p => p.id !== panel.id)
                      if (remaining.length === 1) {
                        shouldExit = true
                        return [{ ...remaining[0], id: 'left' }]
                      }
                      return remaining
                    })
                    if (shouldExit) setLayoutMode('default')
                  }}
                  className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Close Panel"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Default mode header */
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#111111] border-b border-white/[0.06]">
          {/* Tabs container - scrollable */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {panel.tabs.map((tab) => {
              const isActive = tab.id === panel.activeTabId
              return (
              <button
                key={tab.id}
                onClick={() => selectTab(panel.id, tab.id)}
                draggable
                onDragStart={(e) => handleTabDragStart(e, tab.id, panel.id)}
                onDragEnd={handleDragEnd}
                className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 flex-shrink-0 ${
                  isActive
                    ? tab.cliProvider === 'codex'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-[#cc785c]/10 text-[#cc785c]'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                } ${draggedTab?.tabId === tab.id ? 'opacity-50 scale-95' : ''}`}
              >
                {/* Active tab accent */}
                {isActive && (
                  <div className={`absolute bottom-0 left-2 right-2 h-[2px] rounded-full ${
                    tab.cliProvider === 'codex' ? 'bg-emerald-400' : 'bg-[#cc785c]'
                  }`} />
                )}
                <GripVertical
                  size={10}
                  className="opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing transition-opacity"
                />
                {tab.type === 'terminal' ? (
                  <TerminalIcon size={12} />
                ) : (
                  <Globe size={12} />
                )}
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {panel.tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(panel.id, tab.id)
                    }}
                    className="p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-white transition-all"
                  >
                    <X size={10} />
                  </button>
                )}
              </button>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Plus Button with Menu */}
            <div className="relative" ref={showPlusMenu === panel.id ? plusMenuRef : null}>
              {/* Chat view toggle */}
              <button
                onClick={() => toggleChatView(panel.id)}
                className={`flex items-center px-2 py-1 rounded-md transition-all duration-150 ${
                  chatViewPanels.has(panel.id)
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
                }`}
                title={chatViewPanels.has(panel.id) ? 'Switch to Terminal' : 'Switch to Chat View'}
              >
                {chatViewPanels.has(panel.id) ? <TerminalIcon size={13} /> : <Hash size={13} />}
              </button>

              <button
                onClick={() => setShowPlusMenu(showPlusMenu === panel.id ? null : panel.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-150 ${
                  showPlusMenu === panel.id ? 'bg-white/[0.06] text-gray-300' : ''
                }`}
                title="Add Tab"
              >
                <Plus size={13} />
                <ChevronDown size={9} className={`transition-transform duration-150 ${showPlusMenu === panel.id ? 'rotate-180' : ''}`} />
              </button>

              {showPlusMenu === panel.id && (
                <div className="absolute top-full right-0 mt-1.5 w-48 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-1">
                    <button
                      onClick={() => addTab(panel.id, 'terminal', 'claude')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <TerminalIcon size={14} className="text-[#cc785c]" />
                      <span>Claude Code</span>
                    </button>
                    <button
                      onClick={() => addTab(panel.id, 'terminal', 'codex')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <TerminalIcon size={14} className="text-emerald-400" />
                      <span>Codex</span>
                    </button>
                    <button
                      onClick={() => addTab(panel.id, 'browser')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <Globe size={14} className="text-blue-400" />
                      <span>Browser</span>
                    </button>
                  </div>
                  {panels.length < 2 && (
                    <>
                      <div className="h-px bg-white/[0.06] mx-2" />
                      <div className="p-1">
                        <button
                          onClick={() => addPanel('terminal')}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                        >
                          <SplitSquareVertical size={14} className="text-gray-400" />
                          <span>Split Panel</span>
                        </button>
                        <button
                          onClick={createGridLayout}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                        >
                          <LayoutGrid size={14} className="text-gray-400" />
                          <span>Grid (3x2)</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Split/Grid buttons - compact icon-only */}
            {panels.length < 2 && (
              <>
                <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
                <button
                  onClick={() => addPanel('terminal')}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-150"
                  title="Split into two panels"
                >
                  <SplitSquareVertical size={13} />
                </button>
                <button
                  onClick={createGridLayout}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-150"
                  title="Grid layout (3x2)"
                >
                  <LayoutGrid size={13} />
                </button>
              </>
            )}

            {/* Panel close */}
            {panels.length > 1 && (
              <>
                <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
                <button
                  onClick={() => setPanels(prev => prev.filter(p => p.id !== panel.id))}
                  className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Close Panel"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        )}

        {/* Panel Content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Hybrid Chat View overlay -- sits on top of terminal when toggled */}
          {chatViewPanels.has(panel.id) && (() => {
            const activeTermTab = panel.tabs.find(t => t.id === panel.activeTabId && t.type === 'terminal')
            const activeTermRef = activeTermTab ? terminalRefs.current.get(activeTermTab.id) : null
            const activeTermId = activeTermRef?.getTerminalId() || null
            return activeTermId ? (
              <div className="absolute inset-0 z-20">
                <HybridChatView
                  terminalId={activeTermId}
                  claudeStatus={claudeStatus}
                  onSendMessage={(text) => {
                    window.api.terminalSendText(text, activeTermId)
                  }}
                />
              </div>
            ) : null
          })()}

          {/* Render ALL terminal tabs to preserve state - show/hide based on active */}
          {panel.tabs.filter(tab => tab.type === 'terminal').map(tab => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === panel.activeTabId ? 'z-10' : 'z-0 invisible'}`}
            >
              <Terminal
                ref={(ref) => {
                  if (ref) terminalRefs.current.set(tab.id, ref)
                }}
                cliProvider={tab.cliProvider}
                existingTerminalId={terminalIdMapRef.current[tab.id] || undefined}
                onResize={(cols, rows) => setTerminalSize({ cols, rows })}
                onLocalhostDetected={handleLocalhostDetected}
                onTerminalIdReady={(terminalId) => {
                  // Track terminal ID for layout persistence
                  terminalIdMapRef.current[tab.id] = terminalId
                  saveLayout(panels)
                  // Notify parent of active terminal for left panel
                  if (panel.id === 'left' && tab.id === panel.activeTabId) onTerminalIdChange?.(terminalId)
                  // Always notify all terminal IDs for orchestrator
                  if (onAllTerminalIdsChange) {
                    const mapping: Record<string, { tabId: string; panelId: string }> = {}
                    // Gather all known terminal IDs from refs
                    for (const p of panels) {
                      for (const t of p.tabs) {
                        if (t.type === 'terminal') {
                          const ref = terminalRefs.current.get(t.id)
                          const tid = ref?.getTerminalId()
                          if (tid) mapping[tid] = { tabId: t.id, panelId: p.id }
                        }
                      }
                    }
                    // Add the current one too
                    mapping[terminalId] = { tabId: tab.id, panelId: panel.id }
                    onAllTerminalIdsChange(mapping)
                  }
                }}
                onTerminalData={(data, terminalId) => {
                  // Always forward data for ALL terminals (orchestrator needs it)
                  onTerminalData?.(data, terminalId)
                  // Local UI detection only for active tab
                  if (tab.id === panel.activeTabId) {
                    detectClaudeStatus(data)
                    detectHtmlFile(data)
                    parseClaudeAction(data)
                    trackTokensAndCost(data)
                    parsePlanItems(data)
                    detectContextUsage(data)
                  }
                }}
              />
            </div>
          ))}
          {/* Browser tabs - only render when active */}
          {currentTab?.type === 'browser' ? (
            <div className="h-full flex flex-col">
              {/* URL Bar */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[#141414] border-b border-white/[0.06]">
                <button
                  onClick={() => {
                    const webview = document.getElementById(`browser-${currentTab.id}`) as Electron.WebviewTag | null
                    if (webview && 'goBack' in webview) webview.goBack()
                  }}
                  className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                >
                  <PanelLeft size={14} />
                </button>
                <button
                  onClick={() => {
                    const webview = document.getElementById(`browser-${currentTab.id}`) as Electron.WebviewTag | null
                    if (webview && 'goForward' in webview) webview.goForward()
                  }}
                  className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                >
                  <PanelRight size={14} />
                </button>
                <button
                  onClick={() => {
                    const webview = document.getElementById(`browser-${currentTab.id}`) as Electron.WebviewTag | null
                    if (webview && 'reload' in webview) webview.reload()
                  }}
                  className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-[#0d0d0d] rounded-lg border border-white/[0.06]">
                  <Globe size={12} className="text-gray-500" />
                  <input
                    type="text"
                    value={currentTab.url || ''}
                    onChange={(e) => updateBrowserUrl(panel.id, currentTab.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigateBrowser(panel.id, currentTab.id)
                    }}
                    placeholder="Enter URL..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                  />
                </div>
                {/* Viewport Toggle */}
                <div className="flex items-center gap-0.5 px-1 border-l border-white/10 ml-1">
                  <button
                    onClick={() => setViewportMode('mobile')}
                    className={`p-1 rounded transition-colors ${
                      viewportMode === 'mobile'
                        ? 'bg-[#cc785c]/20 text-[#cc785c]'
                        : 'hover:bg-white/5 text-gray-500 hover:text-white'
                    }`}
                    title="Mobile View (375px)"
                  >
                    <Smartphone size={14} />
                  </button>
                  <button
                    onClick={() => setViewportMode('desktop')}
                    className={`p-1 rounded transition-colors ${
                      viewportMode === 'desktop'
                        ? 'bg-[#cc785c]/20 text-[#cc785c]'
                        : 'hover:bg-white/5 text-gray-500 hover:text-white'
                    }`}
                    title="Desktop View (Full Width)"
                  >
                    <Monitor size={14} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (currentTab.url) window.api.openUrlExternal(currentTab.url)
                  }}
                  className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
                  title="Open in Browser"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
              {/* Browser Content */}
              <div className={`flex-1 flex items-start justify-center overflow-auto ${viewportMode === 'mobile' ? 'bg-[#1a1a1a] p-4' : ''}`}>
                {currentTab.url ? (
                  <div className={viewportMode === 'mobile'
                    ? 'w-[375px] h-[667px] rounded-2xl overflow-hidden shadow-2xl border-4 border-[#2a2a2a] bg-white'
                    : 'w-full h-full bg-white'
                  }>
                    <webview
                      id={`browser-${currentTab.id}`}
                      src={currentTab.url.startsWith('http') ? currentTab.url : `https://${currentTab.url}`}
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className={`flex items-center justify-center bg-[#0d0d0d] ${viewportMode === 'mobile' ? 'w-[375px] h-[667px] rounded-2xl border-4 border-[#2a2a2a]' : 'w-full h-full'}`}>
                    <div className="text-center">
                      <Globe size={48} className="mx-auto mb-4 text-gray-600" />
                      <p className="text-gray-500 text-sm">Enter a URL to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex-1 flex flex-col bg-[#0a0a0a] relative overflow-hidden"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {/* File Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center p-8 rounded-xl border-2 border-dashed border-[#cc785c]/60 bg-[#cc785c]/5">
            <FileUp size={40} className="mx-auto mb-3 text-[#cc785c]/80" />
            <p className="text-sm font-medium text-white mb-0.5">Drop files here</p>
            <p className="text-xs text-gray-500">Files will be sent to the active session</p>
          </div>
        </div>
      )}

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#cc785c]/20 to-transparent" />
        <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-radial from-[#cc785c]/[0.03] to-transparent" />
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-radial from-cyan-500/[0.03] to-transparent" />
      </div>


      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Panels Container */}
      <div className={`flex-1 min-h-0 relative ${layoutMode === 'grid' ? 'grid grid-cols-3 grid-rows-2 gap-px bg-[#1a1a1a]' : 'flex'}`}>
        {/* Drop zone indicators when dragging */}
        {draggedTab && panels.length < 2 && layoutMode === 'default' && (
          <>
            <div
              className={`absolute left-0 top-0 bottom-0 w-16 z-40 flex items-center justify-center transition-all ${dropTarget?.position === 'left' ? 'bg-[#cc785c]/20' : 'bg-transparent hover:bg-[#cc785c]/10'}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget({ panelId: 'new', position: 'left' }) }}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handlePanelDrop(e, 'left')}
            >
              <div className={`p-2 rounded-lg ${dropTarget?.position === 'left' ? 'bg-[#cc785c]/30' : ''}`}>
                <PanelLeft size={20} className="text-[#cc785c]" />
              </div>
            </div>
            <div
              className={`absolute right-0 top-0 bottom-0 w-16 z-40 flex items-center justify-center transition-all ${dropTarget?.position === 'right' ? 'bg-[#cc785c]/20' : 'bg-transparent hover:bg-[#cc785c]/10'}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget({ panelId: 'new', position: 'right' }) }}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handlePanelDrop(e, 'right')}
            >
              <div className={`p-2 rounded-lg ${dropTarget?.position === 'right' ? 'bg-[#cc785c]/30' : ''}`}>
                <PanelRight size={20} className="text-[#cc785c]" />
              </div>
            </div>
          </>
        )}

        {/* Render panels */}
        {layoutMode === 'grid' ? (
          panels.map((panel) => renderPanel(panel, false))
        ) : (
          panels.map((panel, index) => (
            <div key={panel.id} className="contents">
              {renderPanel(panel, panels.length === 1)}
              {index < panels.length - 1 && (
                <div className="w-px bg-white/[0.06] hover:bg-[#cc785c]/40 hover:w-1 cursor-col-resize transition-all" />
              )}
            </div>
          ))
        )}

        {/* Preview pane (for file/localhost previews) */}
        {previewUrl && (
          <>
            <div className="w-px bg-white/[0.06] hover:bg-[#cc785c]/40 hover:w-1 cursor-col-resize transition-all" />
            <div className="h-full w-1/2 bg-[#0d0d0d] flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 bg-[#141414] border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#cc785c] animate-pulse" />
                  <span className="text-xs text-gray-400">Preview</span>
                  <span className="text-[10px] text-gray-600 font-mono truncate max-w-[200px]">{previewUrl.split('/').pop()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const webview = document.getElementById('preview-iframe') as Electron.WebviewTag | null
                      if (webview && 'reload' in webview) webview.reload()
                    }}
                    className="p-1 rounded hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (previewUrl.startsWith('http')) window.api.openUrlExternal(previewUrl)
                      else window.api.openFileExternal(previewUrl)
                    }}
                    className="p-1 rounded hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors"
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button onClick={onClosePreview} className="p-1 rounded hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-white overflow-hidden">
                <webview
                  id="preview-iframe"
                  src={previewUrl.startsWith('http') ? previewUrl : `local-file://${previewUrl.replace(/^file:\/\//, '')}`}
                  className="w-full h-full"
                  // @ts-ignore - webPreferences is valid for webview
                  webpreferences="allowRunningInsecureContent=no"
                />
              </div>
            </div>
          </>
        )}

        {/* Preview bar for detected URLs */}
        <PreviewBar url={detectedLocalhostUrl} onDismiss={handleDismissPreview} onOpenPreview={handleOpenPreview} onOpenInBrowser={handleOpenInBrowser} />

        {/* HTML file detection bar */}
        {detectedHtmlFile && (
          <div className="absolute bottom-16 left-4 right-4 bg-[#1a1a1c] border border-[#cc785c]/30 rounded-xl shadow-xl z-40 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#cc785c]/20 rounded-lg">
                  <Monitor size={16} className="text-[#cc785c]" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">HTML file created</p>
                  <p className="text-xs text-gray-500 font-mono truncate max-w-[300px]">{detectedHtmlFile}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePreviewHtmlFile(detectedHtmlFile)}
                  className="px-3 py-1.5 bg-[#cc785c] hover:bg-[#b86a50] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink size={12} />
                  Preview
                </button>
                <button onClick={handleDismissHtmlFile} className="p-1.5 hover:bg-white/[0.06] rounded-lg text-gray-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Timeline Panel */}
        {showTimeline && (
          <TaskTimeline
            actions={timelineActions}
            onClear={clearTimeline}
            isCollapsed={timelineCollapsed}
            onToggleCollapse={() => {
              if (timelineCollapsed) {
                setTimelineCollapsed(false)
              } else {
                setShowTimeline(false)
              }
            }}
          />
        )}

        {/* Plan Panel */}
        {showPlanPanel && (
          <PlanPanel
            items={planItems}
            onClose={() => onClosePlanPanel?.()}
            onClear={() => setPlanItems([])}
          />
        )}
      </div>

      {/* Status Bar */}
      <footer className="relative flex items-center justify-between px-3 py-1.5 bg-[#0e0e0e] border-t border-white/[0.06]">
        {/* Left: Sidebar Toggle + Status + Model + Mode */}
        <div className="flex items-center gap-2">
          {/* Sidebar Toggle */}
          {onToggleSidebar && (
            <>
              <button
                onClick={onToggleSidebar}
                className={`p-1.5 rounded-md transition-all ${
                  sidebarOpen
                    ? 'bg-white/[0.08] text-gray-200'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
                }`}
                title={sidebarOpen ? 'Hide Sidebar (Cmd+B)' : 'Show Sidebar (Cmd+B)'}
              >
                <PanelLeft size={13} />
              </button>
              <div className="w-px h-3.5 bg-white/[0.06]" />
            </>
          )}

          {/* Status Indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
            claudeStatus === 'working' ? 'bg-green-500/10 text-green-400' :
            claudeStatus === 'waiting' ? 'bg-amber-500/10 text-amber-400' :
            'bg-white/[0.03] text-gray-500'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              claudeStatus === 'working' ? 'bg-green-400 animate-pulse' :
              claudeStatus === 'waiting' ? 'bg-amber-400' : 'bg-gray-600'
            }`} />
            <span className="text-[11px] font-medium">
              {claudeStatus === 'working' ? 'Working' : claudeStatus === 'waiting' ? 'Ready' : 'Idle'}
            </span>
          </div>

          <div className="w-px h-3.5 bg-white/[0.06]" />

          {/* Model Selector */}
          <div className="relative" ref={modelMenuRef}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                showModelMenu
                  ? 'bg-white/[0.08] text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`}
              title="Switch model"
            >
              <Zap size={11} className={activeTabProvider === 'codex' ? 'text-emerald-400' : 'text-[#cc785c]'} />
              <span className="text-[11px] font-medium">{currentModel}</span>
              <ChevronDown size={9} className={`transition-transform duration-150 ${showModelMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Model Dropdown */}
            {showModelMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-52 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-3 py-1.5 border-b border-white/[0.06]">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{providerConfig.name} Models</span>
                </div>
                <div className="p-1">
                  {providerConfig.models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      disabled={!providerConfig.modelCommand}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                        currentModel === model.id
                          ? `${model.bg} ${model.color}`
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                      } ${!providerConfig.modelCommand ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${currentModel === model.id ? model.color.replace('text-', 'bg-') : 'bg-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium">{model.name}</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{model.desc}</span>
                      </div>
                    </button>
                  ))}
                  {!providerConfig.modelCommand && (
                    <div className="px-2.5 py-1.5 text-[10px] text-gray-600">
                      Set via --model flag at launch
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Plan/Work Toggle */}
          {providerConfig.hasPlanMode && (
            <button
              onClick={handleModeToggle}
              disabled={!activeTerminalId}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                claudeMode === 'plan'
                  ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/15'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={`${claudeMode === 'plan' ? 'Plan' : 'Work'} mode (Shift+Tab)`}
            >
              {claudeMode === 'plan' ? <Brain size={11} /> : <Hammer size={11} />}
              <span className="text-[11px] font-medium capitalize">{claudeMode}</span>
            </button>
          )}

          <div className="w-px h-3.5 bg-white/[0.06]" />

          {/* Session Stats */}
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock size={10} />
            <span className="text-[10px] font-medium text-gray-400">{formatDuration(sessionDuration)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Hash size={10} />
            <span className="text-[10px] font-medium text-gray-400">{tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}K` : tokenCount} tok</span>
          </div>

          {/* Context Usage */}
          {contextUsage && (
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                contextUsage.percent >= 90
                  ? 'bg-red-500/10 text-red-400'
                  : contextUsage.percent >= 70
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-gray-500'
              }`}
              title={`Context: ${Math.round(contextUsage.current / 1000)}K / ${Math.round(contextUsage.max / 1000)}K tokens`}
            >
              <Database size={10} />
              <div className="w-16 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    contextUsage.percent >= 90 ? 'bg-red-400' :
                    contextUsage.percent >= 70 ? 'bg-amber-400' : 'bg-gray-500'
                  }`}
                  style={{ width: `${Math.min(100, contextUsage.percent)}%` }}
                />
              </div>
              <span className="text-[9px] font-medium">{contextUsage.percent}%</span>
            </div>
          )}
        </div>

        {/* Center: Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              if (showTimeline) {
                setShowTimeline(false)
                setTimelineCollapsed(false)
              } else {
                setShowTimeline(true)
              }
            }}
            className={`p-1.5 rounded-md transition-all relative ${
              showTimeline
                ? 'bg-[#cc785c]/15 text-[#cc785c]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
            }`}
            title="Activity Timeline"
          >
            <ListOrdered size={13} />
            {timelineActions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#cc785c] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                {timelineActions.length > 99 ? '+' : timelineActions.length}
              </span>
            )}
          </button>

          <VoiceInput
            onTranscript={handleVoiceTranscript}
            disabled={!activeTerminalId}
          />

          {/* Upload */}
          <div className="relative" ref={uploadMenuRef}>
            <button
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              disabled={!activeTerminalId}
              className={`p-1.5 rounded-md transition-all ${
                showUploadMenu
                  ? 'bg-[#cc785c]/15 text-[#cc785c]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
              title="Upload files"
            >
              <Upload size={13} />
            </button>

            {showUploadMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-44 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="p-1">
                  <button
                    onClick={() => handleFileSelect('file')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <FileText size={13} className="text-gray-500" />
                    <span>File</span>
                  </button>
                  <button
                    onClick={() => handleFileSelect('image')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <Image size={13} className="text-gray-500" />
                    <span>Image</span>
                  </button>
                  <button
                    onClick={() => handleFileSelect('folder')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-gray-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <Folder size={13} className="text-gray-500" />
                    <span>Folder</span>
                  </button>
                </div>
                <div className="px-2.5 py-1.5 border-t border-white/[0.06] text-[9px] text-gray-600">
                  Or drag & drop anywhere
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />

          <button
            onClick={handleKill}
            disabled={!activeTerminalId || claudeStatus === 'idle'}
            className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            title="Stop (Ctrl+C)"
          >
            <Square size={12} className="fill-current" />
          </button>

          <button
            onClick={handleClear}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
            title="Clear (Cmd+K)"
          >
            <Trash2 size={13} />
          </button>

          <button
            onClick={handleCopyAll}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
            title="Copy All"
          >
            <Copy size={13} />
          </button>

          <button
            onClick={handleScrollToBottom}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
            title="Scroll to Bottom"
          >
            <ArrowDownToLine size={13} />
          </button>
        </div>

        {/* Right: Terminal Size */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 font-mono">{terminalSize.cols}x{terminalSize.rows}</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500 text-[10px] font-mono border border-white/[0.06]">Cmd+K</kbd>
        </div>
      </footer>

      <style>{`
        @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.2s ease-out; }
      `}</style>
    </div>
  )
}
