// Shared types between main and renderer

export interface Terminal {
  id: string
  name: string
  cols: number
  rows: number
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
  size?: number
  modified?: number
}

export interface FileStats {
  size: number
  modified: number
  created: number
  isDirectory: boolean
}

export interface FileOperationResult {
  success: boolean
  error?: string
  path?: string
  newPath?: string
}

export interface Skill {
  id: string
  name: string
  description: string
  path: string
}

export interface Agent {
  id: string
  name: string
  description: string
  path: string
  model?: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  enabled: boolean
}

// Hive (Agent Swarm) types
export interface Hive {
  id: string
  name: string
  icon: string
  description: string
  prompt: string
  category: 'audit' | 'action' | 'design' | 'custom'
  color: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface HiveOperationResult {
  success: boolean
  error?: string
  hive?: Hive
}

export interface SkillMetadata {
  categories?: string[]
  lastUsed?: number
  createdAt?: number
  order?: number
}

export interface ConversationMessage {
  type: 'human' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

export interface ConversationStats {
  messageCount: number
  humanMessages: number
  assistantMessages: number
  duration: number // in milliseconds
  estimatedTokens?: number
  fileSize: number // in bytes
}

export interface Conversation {
  id: string
  projectFolder: string
  timestamp: number
  preview?: string
  pinned?: boolean
  stats?: ConversationStats
  messages?: ConversationMessage[]
}

export interface ConversationExportOptions {
  includeStats?: boolean
  includeTimestamps?: boolean
}

// Analytics types
export interface ProjectStats {
  folder: string
  name: string
  totalSessions: number
  totalTimeMinutes: number
  totalTokens: number
  lastActive: number
  messageCount: number
}

// Detailed Usage Statistics
export interface UsageEntry {
  date: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  totalTokens: number
  cost: number
  sessions: number
}

export interface DetailedUsageStats {
  daily: UsageEntry[]
  byModel: {
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    sessions: number
  }[]
  totals: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
    totalTokens: number
    cost: number
    sessions: number
  }
  predictions: {
    dailyAverage: number
    weeklyProjection: number
    monthlyProjection: number
    costPerSession: number
  }
}

export interface AnalyticsData {
  // Overview
  totalSessions: number
  totalTimeMinutes: number
  totalTokens: number
  totalProjects: number

  // Time periods
  sessions7Days: number
  sessions30Days: number
  time7Days: number
  time30Days: number

  // Breakdowns
  projectStats: ProjectStats[]
  dailyActivity: { date: string; sessions: number; minutes: number }[]

  // Trends
  avgSessionLength: number
  mostActiveDay: string
  peakHour: number
}

export interface Settings {
  theme: string
  fontSize: number
  fontFamily: string
  cwd?: string
}

export interface CustomTheme {
  id: string
  name: string
  background: string
  foreground: string
  accent: string
  cursor: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
}

// CLI Provider types
export type CLIProvider = 'claude' | 'codex'

export interface CLIModelInfo {
  id: string
  name: string
  desc: string
  color: string
  bg: string
}

export interface CLIProviderConfig {
  id: CLIProvider
  name: string
  binaryName: string
  installCommand: string
  installPackage: string
  checkPaths: (home: string) => string[]
  models: CLIModelInfo[]
  defaultModel: string
  modelCommand: string // e.g. "/model" for Claude, empty for Codex (uses --model at launch)
  hasPlanMode: boolean
  configDir: string
  promptChar: RegExp
  workingPatterns: RegExp[]
  waitingPatterns: RegExp[]
}

export interface AppSettings {
  // Appearance
  theme: string
  customThemes: CustomTheme[]
  windowOpacity: number

  // Terminal
  fontSize: number
  fontFamily: string
  lineHeight: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  bellSound: boolean
  scrollbackBuffer: number

  // Tab behavior
  confirmBeforeClose: boolean
  showTabCloseButton: boolean

  // Updates
  autoUpdate: boolean

  // API
  claudeApiKey: string

  // CLI Provider
  cliProvider: CLIProvider

  // Session Context
  sessionContextEnabled: boolean
  sessionContextDays: number
}

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseUrl?: string
  releaseNotes?: string
  error?: string
}

export interface GitStatus {
  branch: string
  dirty: boolean
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
}

export interface GitResult {
  success: boolean
  message: string
}

// MCP (Model Context Protocol) types
export interface MCPServer {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

export interface MCPOperationResult {
  success: boolean
  error?: string
}

export interface MCPConfigStatus {
  exists: boolean
  path: string
}

export interface MCPInitResult {
  success: boolean
  created: boolean
}

// Git file status for individual files
export type GitFileStatusType = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'staged' | 'conflict'

export interface GitFileStatusMap {
  [filePath: string]: GitFileStatusType
}

// IPC Channel types
export interface IpcApi {
  // Terminal
  createTerminal: (cols: number, rows: number) => Promise<string>
  stopTerminal: (terminalId: string) => Promise<void>
  terminalInput: (data: string, terminalId: string) => Promise<void>
  terminalResize: (cols: number, rows: number, terminalId: string) => Promise<void>
  getTerminals: () => Promise<Terminal[]>
  terminalSendText: (text: string, terminalId: string) => Promise<void>
  terminalGetBuffer: (terminalId: string, lines?: number) => Promise<string>
  terminalInterrupt: (terminalId: string) => Promise<void>
  terminalSendEscape: (terminalId: string) => Promise<void>
  terminalGetClaudeStatus: (terminalId: string) => Promise<{
    isClaudeRunning: boolean
    cliProvider: string | null
    lastActivityMs: number
    possibleCrash: boolean
  } | null>
  onTerminalData: (callback: (data: string, terminalId: string) => void) => (() => void) | void
  onTerminalExit: (callback: (code: number, terminalId: string) => void) => (() => void) | void

  // Files
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<{ path: string; name: string }[] | null>
  getCwd: () => Promise<string>
  setCwd: (path: string) => Promise<void>
  listDirectory: (path: string) => Promise<FileNode[]>
  listDirectoryFull: (path: string, showHidden: boolean) => Promise<FileNode[]>
  listFiles: () => Promise<FileNode[]>
  readFile: (path: string) => Promise<string>
  copyFiles: (paths: string[]) => Promise<string[]>
  openFileExternal: (path: string) => Promise<void>
  showInFinder: (path: string) => Promise<void>
  getFileStats: (path: string) => Promise<FileStats | null>
  renameFile: (oldPath: string, newName: string) => Promise<FileOperationResult>
  createFile: (parentPath: string, fileName: string) => Promise<FileOperationResult>
  createFolder: (parentPath: string, folderName: string) => Promise<FileOperationResult>
  deleteFile: (path: string) => Promise<FileOperationResult>
  moveFile: (sourcePath: string, targetDir: string) => Promise<FileOperationResult>
  fileExists: (path: string) => Promise<boolean>
  watchFile: (path: string) => Promise<boolean>
  unwatchFile: (path: string) => Promise<boolean>
  onFileChanged: (callback: (filePath: string) => void) => void

  // Skills & Agents
  listSkills: () => Promise<Skill[]>
  listAgents: () => Promise<Agent[]>
  listPlugins: () => Promise<Plugin[]>
  createSkill: (id: string, name: string, desc: string) => Promise<void>
  createAgent: (id: string, name: string, desc: string) => Promise<void>
  deleteSkill: (skillId: string) => Promise<void>
  deleteAgent: (agentId: string) => Promise<void>
  readSkillContent: (path: string) => Promise<string>
  saveSkillContent: (path: string, content: string) => Promise<void>
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>
  installStarterKit: () => Promise<{ success: boolean; skillsInstalled: number; agentsInstalled: number }>
  checkStarterKit: () => Promise<{ hasSkills: boolean; hasAgents: boolean }>
  duplicateSkill: (skillId: string) => Promise<{ success: boolean; newId: string }>
  duplicateAgent: (agentId: string) => Promise<{ success: boolean; newId: string }>
  importSkill: (id: string, content: string) => Promise<{ success: boolean }>
  importAgent: (id: string, content: string) => Promise<{ success: boolean }>
  exportSkillOrAgent: (sourcePath: string, name: string, type: 'skill' | 'agent') => Promise<{ success: boolean; path?: string; error?: string }>
  getSkillMetadata: (id: string) => Promise<SkillMetadata>
  updateSkillMetadata: (id: string, updates: Partial<SkillMetadata>) => Promise<{ success: boolean }>
  getAllMetadata: () => Promise<Record<string, SkillMetadata>>
  saveAllMetadata: (metadata: Record<string, SkillMetadata>) => Promise<{ success: boolean }>
  updateLastUsed: (id: string) => Promise<{ success: boolean }>

  // Conversations
  listConversations: () => Promise<Conversation[]>
  getConversationPreview: (id: string, projectFolder: string) => Promise<string>
  getConversationDetails: (id: string, projectFolder: string) => Promise<Conversation | null>
  getConversationMessages: (id: string, projectFolder: string, limit?: number) => Promise<ConversationMessage[]>
  deleteConversation: (id: string, projectFolder: string) => Promise<{ success: boolean; error?: string }>
  exportConversation: (id: string, projectFolder: string, options?: ConversationExportOptions) => Promise<{ success: boolean; path?: string; error?: string }>
  pinConversation: (id: string, projectFolder: string, pinned: boolean) => Promise<{ success: boolean; error?: string }>
  searchConversations: (query: string) => Promise<Conversation[]>
  getCurrentSessionTodos: (projectFolder: string) => Promise<Array<{ id: string; content: string; status: string; activeForm?: string; createdAt: Date }>>
  getDetailedUsageStats: (days?: number) => Promise<DetailedUsageStats>

  // Claude CLI (legacy, defaults to current provider)
  checkClaudeInstalled: () => Promise<boolean>
  installClaude: () => Promise<void>
  onInstallProgress: (callback: (data: { stage: string; progress: number }) => void) => void

  // CLI Provider (generic)
  checkCliInstalled: (provider: CLIProvider) => Promise<boolean>
  installCli: (provider: CLIProvider) => Promise<void>

  // Git
  gitStatus: () => Promise<GitStatus | null>
  gitCommit: (message: string) => Promise<GitResult>
  gitPush: () => Promise<GitResult>
  gitPull: () => Promise<GitResult>
  gitFileStatus: () => Promise<GitFileStatusMap>

  // System
  getHomeDir: () => Promise<string>
  openUrlExternal: (url: string) => Promise<void>

  // Settings
  loadSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>
  resetSettings: () => Promise<AppSettings>
  exportSettings: () => Promise<{ success: boolean; path?: string }>
  importSettings: () => Promise<{ success: boolean; settings?: AppSettings; error?: string }>
  clearAllData: () => Promise<{ success: boolean; error?: string }>
  checkForUpdates: () => Promise<UpdateInfo>
  setWindowOpacity: (opacity: number) => Promise<{ success: boolean }>
  getAppVersion: () => Promise<string>
  saveCustomTheme: (theme: CustomTheme) => Promise<{ success: boolean; themes: CustomTheme[] }>
  deleteCustomTheme: (themeId: string) => Promise<{ success: boolean; themes: CustomTheme[] }>

  // MCP (Model Context Protocol)
  mcpList: () => Promise<MCPServer[]>
  mcpGet: (name: string) => Promise<MCPServer | null>
  mcpAdd: (name: string, command: string, args: string[], env: Record<string, string>) => Promise<MCPOperationResult>
  mcpUpdate: (name: string, command: string, args: string[], env: Record<string, string>) => Promise<MCPOperationResult>
  mcpRemove: (name: string) => Promise<MCPOperationResult>
  mcpToggle: (name: string, enabled: boolean) => Promise<MCPOperationResult>
  mcpCheckConfig: () => Promise<MCPConfigStatus>
  mcpInitConfig: () => Promise<MCPInitResult>

  // Super Agent
  callLLMApi: (request: LLMApiRequest) => Promise<LLMApiResponse>
  loadSuperAgentConfig: () => Promise<SuperAgentConfig>
  saveSuperAgentConfig: (config: Partial<SuperAgentConfig>) => Promise<{ success: boolean }>
  saveSuperAgentSession: (session: SuperAgentSession) => Promise<{ success: boolean }>
  listSuperAgentSessions: () => Promise<SuperAgentSession[]>
  deleteSuperAgentSession: (sessionId: string) => Promise<{ success: boolean }>

  // Hives (Agent Swarms)
  listHives: () => Promise<Hive[]>
  getHive: (id: string) => Promise<Hive | null>
  createHive: (hive: Omit<Hive, 'id' | 'createdAt' | 'updatedAt'>) => Promise<HiveOperationResult>
  updateHive: (id: string, updates: Partial<Hive>) => Promise<HiveOperationResult>
  deleteHive: (id: string) => Promise<HiveOperationResult>
  resetHives: () => Promise<HiveOperationResult>

  // Teams
  teamsList: () => Promise<TeamSummary[]>
  teamsGetConfig: (name: string) => Promise<TeamConfig | null>
  teamsGetTasks: (name: string) => Promise<TeamTask[]>
  teamsDelete: (name: string) => Promise<{ success: boolean; error?: string }>

  // Window Controls
  windowClose: () => Promise<void>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>

  // Terminal Session State
  setTerminalSessionActive: (active: boolean) => void

  // Background Agents
  backgroundAgentList: () => Promise<BackgroundAgentTask[]>
  backgroundAgentAdd: (task: { name: string; prompt: string; projectPath: string; priority?: 'low' | 'normal' | 'high' }) => Promise<BackgroundAgentTask>
  backgroundAgentRemove: (taskId: string) => Promise<{ success: boolean }>
  backgroundAgentCancel: (taskId: string) => Promise<{ success: boolean }>
  backgroundAgentStartQueue: () => Promise<{ success: boolean }>
  backgroundAgentPauseQueue: () => Promise<{ success: boolean }>
  backgroundAgentQueueStatus: () => Promise<BackgroundAgentQueueStatus>
  backgroundAgentSetMaxConcurrent: (max: number) => Promise<{ success: boolean }>
  backgroundAgentGetOutput: (taskId: string) => Promise<string[]>
  backgroundAgentClearCompleted: () => Promise<{ success: boolean }>
  backgroundAgentRetry: (taskId: string) => Promise<{ success: boolean }>
  backgroundAgentReorder: (taskId: string, newIndex: number) => Promise<{ success: boolean }>
  backgroundAgentSetPriority: (taskId: string, priority: 'low' | 'normal' | 'high') => Promise<{ success: boolean }>
  onBackgroundAgentUpdate: (callback: (task: BackgroundAgentTask) => void) => (() => void) | void
  onBackgroundAgentOutput: (callback: (data: { taskId: string; data: string }) => void) => (() => void) | void

  // Repository Visualization
  repoAnalyze: (basePath: string) => Promise<RepoAnalysis>
  repoGetFileContent: (filePath: string) => Promise<string>

  // Memory (CLAUDE.md based system)
  memoryList: (projectPath: string) => Promise<MemoryListResult>
  memoryGetRaw: (projectPath: string, type: 'main' | 'local' | 'user') => Promise<string>
  memorySaveRaw: (projectPath: string, type: 'main' | 'local' | 'user', content: string) => Promise<{ success: boolean }>
  memoryAdd: (projectPath: string, item: MemoryAddItem) => Promise<{ success: boolean }>
  memoryInit: (projectPath: string) => Promise<{ success: boolean; path: string }>
  memoryCheck: (projectPath: string) => Promise<MemoryCheckResult>
  memoryOpenEditor: (projectPath: string, type: 'main' | 'local' | 'user') => Promise<{ success: boolean; path: string }>
  memoryStats: (projectPath: string) => Promise<MemoryStats>
  memoryDelete: (projectPath: string, type: 'main' | 'local' | 'rules') => Promise<{ success: boolean }>
  // Session Context
  generateSessionContext: (projectPath: string, days?: number) => Promise<string>
  writeSessionContext: (projectPath: string, content: string) => Promise<{ success: boolean }>

  // Legacy methods (backward compatibility)
  memoryGetContext: (projectPath: string) => Promise<string>
  memorySetGlobalContext: (projectPath: string, context: string) => Promise<{ success: boolean }>
  memoryGetGlobalContext: (projectPath: string) => Promise<string>
  memoryClear: (projectPath: string) => Promise<{ success: boolean }>
  memoryListProjects: () => Promise<{ projectPath: string; hasMemory: boolean }[]>

  // Chat Mode
  chatSendPrompt: (options: { sessionId: string; prompt: string; cwd: string; model?: string; resumeSessionId?: string }) => Promise<void>
  chatStop: (sessionId: string) => Promise<boolean>
  onChatStreamEvent: (callback: (sessionId: string, event: any) => void) => () => void
}

// Memory types (CLAUDE.md based system)
export type MemoryCategory = 'architecture' | 'conventions' | 'commands' | 'preferences' | 'decisions' | 'context'
export type MemoryFileType = 'main' | 'local' | 'user' | 'rules'

export interface MemorySection {
  category: MemoryCategory
  title: string
  items: string[]
}

export interface MemoryListResult {
  main: MemorySection[]
  rules: Record<MemoryCategory, string[]>
  local: MemorySection[]
  user: MemorySection[]
}

export interface MemoryCheckResult {
  hasMain: boolean
  hasLocal: boolean
  hasUser: boolean
  hasRules: boolean
  mainPath: string | null
}

export interface MemoryStats {
  hasMemory: boolean
  mainSize: number
  localSize: number
  userSize: number
  rulesCount: number
}

export interface MemoryAddItem {
  category: MemoryCategory
  content: string
  target: MemoryFileType
}

// Legacy Memory types (for backward compatibility)
export interface MemoryItem {
  id: string
  projectPath: string
  type: 'context' | 'decision' | 'preference' | 'pattern' | 'note'
  content: string
  summary?: string
  importance: 'low' | 'medium' | 'high' | 'critical'
  tags: string[]
  createdAt: number
  updatedAt: number
  accessCount: number
  lastAccessed?: number
  source?: 'auto' | 'manual' | 'conversation'
  conversationId?: string
}

// Super Agent types
export type LLMProvider = 'groq' | 'openai'
export type SafetyLevel = 'safe' | 'moderate' | 'yolo'

export interface LLMApiRequest {
  provider: LLMProvider
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
}

export interface LLMApiResponse {
  success: boolean
  content?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface SuperAgentConfig {
  groqApiKey: string
  groqModel: string
  openaiApiKey: string
  openaiModel: string
  defaultProvider: LLMProvider
  idleTimeout: number // seconds before considering Claude idle
  maxDuration: number // max minutes for autonomous operation
  defaultSafetyLevel: SafetyLevel
}

export interface ActivityLogEntry {
  timestamp: number
  type: 'start' | 'input' | 'output' | 'decision' | 'fast-path' | 'permission' | 'complete' | 'error' | 'stop' | 'working' | 'waiting' | 'ready'
  message: string
  detail?: string
}

export interface SuperAgentSession {
  id: string
  task: string
  startTime: number
  endTime: number
  duration: number // in seconds
  status: 'completed' | 'stopped' | 'error'
  activityLog: ActivityLogEntry[]
  provider: LLMProvider
  projectFolder: string
}

// Orchestrator types
export interface OrchestratorSession extends SuperAgentSession {
  mode: 'split' | 'parallel'
  terminalCount: number
}

// Teams types
export interface TeamMember {
  agentId: string
  name: string
  agentType: string
  model?: string
  prompt?: string
  color?: string
  joinedAt: number
  cwd?: string
  backendType?: string
}

export interface TeamConfig {
  name: string
  description?: string
  createdAt: number
  leadAgentId?: string
  leadSessionId?: string
  members: TeamMember[]
}

export interface TeamTask {
  id: string
  subject: string
  description?: string
  activeForm?: string
  owner?: string
  status: 'pending' | 'in_progress' | 'completed'
  blocks?: string[]
  blockedBy?: string[]
}

export interface TeamSummary {
  name: string
  description?: string
  createdAt: number
  memberCount: number
  taskStats: { total: number; completed: number; inProgress: number; pending: number }
}

// Background Agent types
export interface BackgroundAgentTask {
  id: string
  name: string
  prompt: string
  projectPath: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  output: string[]
  error?: string
  priority: 'low' | 'normal' | 'high'
}

export interface BackgroundAgentQueueStatus {
  isRunning: boolean
  maxConcurrent: number
  totalTasks: number
  queuedTasks: number
  runningTasks: number
  completedTasks: number
  failedTasks: number
}

// Repository Visualization types
export interface RepoFileNode {
  name: string
  path: string
  relativePath: string
  type: 'file' | 'directory'
  size: number
  extension?: string
  category?: string
  children?: RepoFileNode[]
  lineCount?: number
}

export interface RepoStats {
  totalFiles: number
  totalDirectories: number
  totalSize: number
  totalLines: number
  filesByType: Record<string, { count: number; size: number; lines: number }>
  largestFiles: { path: string; size: number; lines: number }[]
  deepestPath: string
  maxDepth: number
}

export interface RepoAnalysis {
  tree: RepoFileNode
  stats: RepoStats
  dependencies: {
    name: string
    version: string
    type: 'dependency' | 'devDependency'
  }[]
  structure: {
    hasPackageJson: boolean
    hasTsConfig: boolean
    hasGitIgnore: boolean
    hasReadme: boolean
    hasSrc: boolean
    hasTests: boolean
    framework?: string
  }
}

declare global {
  interface Window {
    api: IpcApi
  }
}
