import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import HomeScreen from './components/HomeScreen'
import TerminalWrapper, { type TerminalWrapperHandle } from './components/terminal/TerminalWrapper'
import SkillsManager from './components/skills/SkillsManager'
import HistoryBrowser from './components/history/HistoryBrowser'
import AnalyticsScreen from './components/analytics/AnalyticsScreen'
import SettingsPanel from './components/settings/SettingsPanel'
import SplashScreen from './components/SplashScreen'
import WelcomeScreen from './components/WelcomeScreen'
import { ToastProvider } from './components/common/Toast'
import { useAppStore } from './store'
import { SuperAgentModal, SuperAgentStatusBar } from './components/superagent'
import { useSuperAgent } from './hooks/useSuperAgent'
import { useOrchestrator } from './hooks/useOrchestrator'
import { OrchestratorModal, OrchestratorStatusPanel } from './components/orchestrator'
import HiveManager from './components/hives/HiveManager'
import MemoryPanelNatural from './components/memory/MemoryPanelNatural'
import BackgroundAgentsPanel from './components/agents/BackgroundAgentsPanel'
import RepoVisualization from './components/repo/RepoVisualization'
import TeamsPanel from './components/teams/TeamsPanel'
import ChatView from './components/chat/ChatView'

type Screen = 'home' | 'terminal' | 'skills' | 'history' | 'analytics' | 'hive'
type ViewMode = 'terminal' | 'chat'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [screen, setScreen] = useState<Screen>('home')
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null)
  const [claudeCliInstalled, setClaudeCliInstalled] = useState<boolean | null>(null)
  const [codexCliInstalled, setCodexCliInstalled] = useState<boolean | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [terminalMounted, setTerminalMounted] = useState(false)
  const [superAgentModalOpen, setSuperAgentModalOpen] = useState(false)
  const [orchestratorModalOpen, setOrchestratorModalOpen] = useState(false)
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false)
  const [backgroundAgentsPanelOpen, setBackgroundAgentsPanelOpen] = useState(false)
  const [repoVisualizationOpen, setRepoVisualizationOpen] = useState(false)
  const [teamsPanelOpen, setTeamsPanelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('terminal')
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [allTerminalIds, setAllTerminalIds] = useState<Record<string, { tabId: string; panelId: string }>>({})
  const pendingSuperAgentOpen = useRef(false) // Flag to open modal when terminal is ready
  const terminalHandleRef = useRef<TerminalWrapperHandle | null>(null)
  const { cwd, setCwd } = useAppStore()
  const { isRunning: superAgentRunning, stopSuperAgent, processOutput: superAgentProcess } = useSuperAgent()
  const {
    isRunning: orchestratorRunning,
    stopOrchestrator,
    processOutput: orchestratorProcess,
    nudgeAll: orchestratorNudge
  } = useOrchestrator()

  // Route terminal data to the right processor
  const handleTerminalData = useCallback((data: string, terminalId: string) => {
    if (orchestratorRunning) {
      orchestratorProcess(data, terminalId)
    } else {
      superAgentProcess(data, terminalId)
    }
  }, [orchestratorRunning, orchestratorProcess, superAgentProcess])

  // Initialize — also detect surviving PTYs from sleep/wake
  useEffect(() => {
    // Check both CLI providers' install status
    window.api.checkCliInstalled('claude').then(setClaudeCliInstalled).catch(() => setClaudeCliInstalled(false))
    window.api.checkCliInstalled('codex').then(setCodexCliInstalled).catch(() => setCodexCliInstalled(false))

    // Also set the legacy cliInstalled based on default provider
    window.api.loadSettings().then((settings) => {
      const provider = settings?.cliProvider || 'claude'
      window.api.checkCliInstalled(provider).then(setCliInstalled)
    }).catch(() => {
      window.api.checkClaudeInstalled().then(setCliInstalled)
    })
    window.api.getCwd().then(setCwd)

    // Check for surviving PTY sessions (e.g. after sleep/wake)
    window.api.getTerminals().then((terminals) => {
      if (terminals && terminals.length > 0) {
        console.log('[App] Found surviving PTYs after wake:', terminals.length)
        // Skip splash/welcome and go straight to terminal
        setShowSplash(false)
        setShowWelcome(false)
        setTerminalMounted(true)
        setScreen('terminal')
      }
    }).catch(() => {})
  }, [setCwd])

  // Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Track terminal session state for close confirmation
  useEffect(() => {
    window.api.setTerminalSessionActive(terminalMounted && !!activeTerminalId)
  }, [terminalMounted, activeTerminalId])

  // Navigation
  const navigateTo = useCallback((newScreen: Screen) => {
    console.log('Navigating to:', newScreen)
    setScreen(newScreen)
    if (newScreen === 'terminal') {
      setTerminalMounted(true)
    }
  }, [])

  const handleStartSession = useCallback(() => {
    console.log('Starting session with cwd:', cwd)
    navigateTo('terminal')
  }, [navigateTo, cwd])

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setCwd(folder)
      await window.api.setCwd(folder)
    }
  }, [setCwd])

  const handleNavigate = useCallback((screenName: string) => {
    if (['home', 'terminal', 'skills', 'history', 'analytics', 'hive'].includes(screenName)) {
      navigateTo(screenName as Screen)
    }
  }, [navigateTo])

  // Show splash screen on first load
  if (showSplash) {
    return <SplashScreen onComplete={() => {
      setShowSplash(false)
      setShowWelcome(true)
    }} />
  }

  return (
    <ToastProvider>
      <div className="flex h-full flex-col bg-[#0d0d0d]">
        <Header
          cwd={cwd}
          onSelectFolder={handleSelectFolder}
          onHome={() => navigateTo('home')}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCommandPalette={() => {}}
          screen={screen}
          onNavigate={handleNavigate}
          onOpenPreview={(url) => setPreviewUrl(url)}
          onOpenSuperAgent={() => setSuperAgentModalOpen(true)}
          onOpenOrchestrator={() => setOrchestratorModalOpen(true)}
          onOpenMemory={() => setMemoryPanelOpen(true)}
          onOpenBackgroundAgents={() => setBackgroundAgentsPanelOpen(true)}
          onOpenRepoVisualization={() => setRepoVisualizationOpen(true)}
          onOpenTeams={() => setTeamsPanelOpen(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - only on terminal screen in terminal mode, collapsible */}
          {screen === 'terminal' && viewMode === 'terminal' && (
            <div className={`relative flex-shrink-0 transition-all duration-200 ease-in-out ${sidebarOpen ? 'w-60' : 'w-0'}`}>
              <div className={`h-full overflow-hidden ${sidebarOpen ? 'w-60' : 'w-0'}`}>
                <Sidebar
                  cwd={cwd}
                  onSelectFolder={handleSelectFolder}
                  onPreviewFile={(path) => setPreviewUrl(path)}
                  onSendToChat={(path) => {
                    if (activeTerminalId) {
                      const quotedPath = path.includes(' ') ? `"${path}"` : path
                      window.api.terminalSendText(`Here's a file: ${quotedPath}\n`, activeTerminalId)
                    }
                  }}
                />
              </div>
              {/* Toggle handle */}
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className={`absolute top-1/2 -translate-y-1/2 z-10 w-4 h-10 flex items-center justify-center rounded-r bg-[#1a1a1c] border border-l-0 border-white/[0.06] text-gray-500 hover:text-white hover:bg-[#252528] transition-colors ${sidebarOpen ? '-right-4' : 'right-[-16px]'}`}
                title={sidebarOpen ? 'Hide Sidebar (Cmd+B)' : 'Show Sidebar (Cmd+B)'}
              >
                <ChevronRight size={12} className={`transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

          {/* Main content */}
          <main className={`flex-1 overflow-hidden ${screen === 'terminal' ? 'flex' : ''}`}>
            {screen === 'home' && (
              <HomeScreen
                cwd={cwd}
                claudeInstalled={cliInstalled}
                claudeCliInstalled={claudeCliInstalled}
                codexCliInstalled={codexCliInstalled}
                onStartSession={handleStartSession}
                onSelectFolder={handleSelectFolder}
                onOpenSkills={() => navigateTo('skills')}
                onOpenHistory={() => navigateTo('history')}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenAnalytics={() => navigateTo('analytics')}
                onOpenSuperAgent={() => {
                  // Start a terminal session first
                  navigateTo('terminal')
                  // If we already have a terminal ID, open modal now
                  if (activeTerminalId) {
                    setSuperAgentModalOpen(true)
                  } else {
                    // Otherwise, flag to open when terminal is ready
                    pendingSuperAgentOpen.current = true
                  }
                }}
                onOpenHive={() => navigateTo('hive')}
                onOpenMemory={() => setMemoryPanelOpen(true)}
                onOpenTeams={() => setTeamsPanelOpen(true)}
                onStartChat={() => {
                  setViewMode('chat')
                  navigateTo('terminal')
                }}
              />
            )}

            {/* Chat View */}
            {screen === 'terminal' && viewMode === 'chat' && (
              <ChatView cwd={cwd} />
            )}

            {/* Terminal - always render once mounted, hide when not active to preserve session */}
            {terminalMounted && (
              <div className={`${screen === 'terminal' && viewMode === 'terminal' ? 'contents' : 'hidden'}`}>
                <TerminalWrapper
                  onTerminalData={handleTerminalData}
                  onTerminalIdChange={(terminalId) => {
                    setActiveTerminalId(terminalId)
                    // Check if we were waiting to open Super Agent modal
                    if (terminalId && pendingSuperAgentOpen.current) {
                      pendingSuperAgentOpen.current = false
                      setSuperAgentModalOpen(true)
                    }
                  }}
                  onAllTerminalIdsChange={setAllTerminalIds}
                  onHandleReady={(handle) => { terminalHandleRef.current = handle }}
                  previewUrl={previewUrl}
                  onClosePreview={() => setPreviewUrl(null)}
                  onOpenPreview={(url) => setPreviewUrl(url)}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen(prev => !prev)}
                />
              </div>
            )}

            {screen === 'skills' && (
              <SkillsManager onBack={() => navigateTo('home')} />
            )}

            {screen === 'history' && (
              <HistoryBrowser
                onBack={() => navigateTo('home')}
                onResumeSession={(conversation) => {
                  setCwd(conversation.projectFolder)
                  window.api.setCwd(conversation.projectFolder)
                  navigateTo('terminal')
                }}
              />
            )}

            {screen === 'analytics' && (
              <AnalyticsScreen onBack={() => navigateTo('home')} />
            )}

            {screen === 'hive' && (
              <HiveManager onBack={() => navigateTo('home')} />
            )}

            {/* Super Agent Status Panel - integrated into layout */}
            {superAgentRunning && screen === 'terminal' && (
              <SuperAgentStatusBar onStop={stopSuperAgent} />
            )}

            {/* Orchestrator Status Panel - integrated into layout */}
            {orchestratorRunning && screen === 'terminal' && (
              <OrchestratorStatusPanel onStop={stopOrchestrator} />
            )}
          </main>
        </div>

        {/* Settings Panel */}
        <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Super Agent Modal */}
        <SuperAgentModal
          isOpen={superAgentModalOpen}
          onClose={() => setSuperAgentModalOpen(false)}
          terminalId={activeTerminalId || ''}
          onStart={() => setSuperAgentModalOpen(false)}
        />

        {/* Orchestrator Modal */}
        <OrchestratorModal
          isOpen={orchestratorModalOpen}
          onClose={() => setOrchestratorModalOpen(false)}
          terminalMapping={allTerminalIds}
          onStart={() => setOrchestratorModalOpen(false)}
          onCreateGrid={() => terminalHandleRef.current?.createGrid()}
        />

        {/* Memory Panel */}
        <MemoryPanelNatural
          projectPath={cwd}
          isOpen={memoryPanelOpen}
          onClose={() => setMemoryPanelOpen(false)}
        />

        {/* Background Agents Panel */}
        <BackgroundAgentsPanel
          isOpen={backgroundAgentsPanelOpen}
          onClose={() => setBackgroundAgentsPanelOpen(false)}
        />

        {/* Teams Panel */}
        <TeamsPanel
          isOpen={teamsPanelOpen}
          onClose={() => setTeamsPanelOpen(false)}
          activeTerminalId={activeTerminalId}
        />

        {/* Repository Visualization */}
        <RepoVisualization
          isOpen={repoVisualizationOpen}
          onClose={() => setRepoVisualizationOpen(false)}
          projectPath={cwd}
        />

        {/* Welcome/Updates Screen */}
        {showWelcome && (
          <WelcomeScreen onComplete={() => setShowWelcome(false)} />
        )}
      </div>
    </ToastProvider>
  )
}

export default App
