import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, ConversationExportOptions, LLMApiRequest, SuperAgentConfig, SuperAgentSession, Hive, CLIProvider } from '../shared/types'

const api: IpcApi = {
  // Terminal
  createTerminal: (cols, rows) => ipcRenderer.invoke('create-terminal', cols, rows),
  stopTerminal: (terminalId) => ipcRenderer.invoke('stop-terminal', terminalId),
  terminalInput: (data, terminalId) => ipcRenderer.invoke('terminal-input', data, terminalId),
  terminalResize: (cols, rows, terminalId) =>
    ipcRenderer.invoke('terminal-resize', cols, rows, terminalId),
  getTerminals: () => ipcRenderer.invoke('get-terminals'),
  terminalSendText: (text, terminalId) => ipcRenderer.invoke('terminal-send-text', text, terminalId),
  terminalGetBuffer: (terminalId, lines) => ipcRenderer.invoke('terminal-get-buffer', terminalId, lines),
  terminalInterrupt: (terminalId) => ipcRenderer.invoke('terminal-interrupt', terminalId),
  terminalSendEscape: (terminalId) => ipcRenderer.invoke('terminal-send-escape', terminalId),
  terminalGetClaudeStatus: (terminalId) => ipcRenderer.invoke('terminal-get-claude-status', terminalId),
  onTerminalData: (callback) => {
    // Support multiple listeners - each terminal can register its own
    const handler = (_: Electron.IpcRendererEvent, data: string, terminalId: string) => callback(data, terminalId)
    ipcRenderer.on('terminal-data', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('terminal-data', handler)
  },
  onTerminalExit: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, code: number, terminalId: string) => callback(code, terminalId)
    ipcRenderer.on('terminal-exit', handler)
    return () => ipcRenderer.removeListener('terminal-exit', handler)
  },

  // Files
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  setCwd: (path) => ipcRenderer.invoke('set-cwd', path),
  listDirectory: (path) => ipcRenderer.invoke('list-directory', path),
  listDirectoryFull: (path, showHidden) => ipcRenderer.invoke('list-directory-full', path, showHidden),
  listFiles: () => ipcRenderer.invoke('list-files'),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  copyFiles: (paths) => ipcRenderer.invoke('copy-files', paths),
  openFileExternal: (path) => ipcRenderer.invoke('open-file-external', path),
  showInFinder: (path) => ipcRenderer.invoke('show-in-finder', path),
  getFileStats: (path) => ipcRenderer.invoke('get-file-stats', path),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),
  createFile: (parentPath, fileName) => ipcRenderer.invoke('create-file', parentPath, fileName),
  createFolder: (parentPath, folderName) => ipcRenderer.invoke('create-folder', parentPath, folderName),
  deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
  moveFile: (sourcePath, targetDir) => ipcRenderer.invoke('move-file', sourcePath, targetDir),
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),
  watchFile: (path) => ipcRenderer.invoke('watch-file', path),
  unwatchFile: (path) => ipcRenderer.invoke('unwatch-file', path),
  onFileChanged: (callback) => {
    ipcRenderer.removeAllListeners('file-changed')
    ipcRenderer.on('file-changed', (_, filePath) => callback(filePath))
  },

  // Skills & Agents
  listSkills: () => ipcRenderer.invoke('list-skills'),
  listAgents: () => ipcRenderer.invoke('list-agents'),
  listPlugins: () => ipcRenderer.invoke('list-plugins'),
  createSkill: (id, name, desc) => ipcRenderer.invoke('create-skill', id, name, desc),
  createAgent: (id, name, desc) => ipcRenderer.invoke('create-agent', id, name, desc),
  deleteSkill: (skillId) => ipcRenderer.invoke('delete-skill', skillId),
  deleteAgent: (agentId) => ipcRenderer.invoke('delete-agent', agentId),
  readSkillContent: (path) => ipcRenderer.invoke('read-skill-content', path),
  saveSkillContent: (path, content) => ipcRenderer.invoke('save-skill-content', path, content),
  togglePlugin: (pluginId, enabled) => ipcRenderer.invoke('toggle-plugin', pluginId, enabled),
  installStarterKit: () => ipcRenderer.invoke('install-starter-kit'),
  checkStarterKit: () => ipcRenderer.invoke('check-starter-kit'),
  duplicateSkill: (skillId) => ipcRenderer.invoke('duplicate-skill', skillId),
  duplicateAgent: (agentId) => ipcRenderer.invoke('duplicate-agent', agentId),
  importSkill: (id, content) => ipcRenderer.invoke('import-skill', id, content),
  importAgent: (id, content) => ipcRenderer.invoke('import-agent', id, content),
  exportSkillOrAgent: (sourcePath, name, type) => ipcRenderer.invoke('export-skill-or-agent', sourcePath, name, type),
  getSkillMetadata: (id) => ipcRenderer.invoke('get-skill-metadata', id),
  updateSkillMetadata: (id, updates) => ipcRenderer.invoke('update-skill-metadata', id, updates),
  getAllMetadata: () => ipcRenderer.invoke('get-all-metadata'),
  saveAllMetadata: (metadata) => ipcRenderer.invoke('save-all-metadata', metadata),
  updateLastUsed: (id) => ipcRenderer.invoke('update-last-used', id),

  // Conversations
  listConversations: () => ipcRenderer.invoke('list-conversations'),
  getConversationPreview: (id, projectFolder) =>
    ipcRenderer.invoke('get-conversation-preview', id, projectFolder),
  getConversationDetails: (id, projectFolder) =>
    ipcRenderer.invoke('get-conversation-details', id, projectFolder),
  getConversationMessages: (id, projectFolder, limit) =>
    ipcRenderer.invoke('get-conversation-messages', id, projectFolder, limit),
  deleteConversation: (id, projectFolder) =>
    ipcRenderer.invoke('delete-conversation', id, projectFolder),
  exportConversation: (id, projectFolder, options?: ConversationExportOptions) =>
    ipcRenderer.invoke('export-conversation', id, projectFolder, options),
  pinConversation: (id, projectFolder, pinned) =>
    ipcRenderer.invoke('pin-conversation', id, projectFolder, pinned),
  searchConversations: (query) => ipcRenderer.invoke('search-conversations', query),
  getCurrentSessionTodos: (projectFolder: string) =>
    ipcRenderer.invoke('get-current-session-todos', projectFolder),
  getDetailedUsageStats: (days?: number) =>
    ipcRenderer.invoke('get-detailed-usage-stats', days),

  // Claude CLI (legacy)
  checkClaudeInstalled: () => ipcRenderer.invoke('check-claude-installed'),
  installClaude: () => ipcRenderer.invoke('install-claude'),
  onInstallProgress: (callback) =>
    ipcRenderer.on('install-progress', (_, data) => callback(data)),

  // CLI Provider (generic)
  checkCliInstalled: (provider: CLIProvider) => ipcRenderer.invoke('check-cli-installed', provider),
  installCli: (provider: CLIProvider) => ipcRenderer.invoke('install-cli', provider),

  // Git
  gitStatus: () => ipcRenderer.invoke('git-status'),
  gitCommit: (message) => ipcRenderer.invoke('git-commit', message),
  gitPush: () => ipcRenderer.invoke('git-push'),
  gitPull: () => ipcRenderer.invoke('git-pull'),
  gitFileStatus: () => ipcRenderer.invoke('git-file-status'),

  // System
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  openUrlExternal: (url) => ipcRenderer.invoke('open-url-external', url),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  clearAllData: () => ipcRenderer.invoke('settings:clearAllData'),
  checkForUpdates: () => ipcRenderer.invoke('settings:checkForUpdates'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('settings:setWindowOpacity', opacity),
  getAppVersion: () => ipcRenderer.invoke('settings:getAppVersion'),
  saveCustomTheme: (theme) => ipcRenderer.invoke('settings:saveCustomTheme', theme),
  deleteCustomTheme: (themeId) => ipcRenderer.invoke('settings:deleteCustomTheme', themeId),

  // MCP (Model Context Protocol)
  mcpList: () => ipcRenderer.invoke('mcp-list'),
  mcpGet: (name) => ipcRenderer.invoke('mcp-get', name),
  mcpAdd: (name, command, args, env) => ipcRenderer.invoke('mcp-add', name, command, args, env),
  mcpUpdate: (name, command, args, env) => ipcRenderer.invoke('mcp-update', name, command, args, env),
  mcpRemove: (name) => ipcRenderer.invoke('mcp-remove', name),
  mcpToggle: (name, enabled) => ipcRenderer.invoke('mcp-toggle', name, enabled),
  mcpCheckConfig: () => ipcRenderer.invoke('mcp-check-config'),
  mcpInitConfig: () => ipcRenderer.invoke('mcp-init-config'),

  // Super Agent
  callLLMApi: (request: LLMApiRequest) => ipcRenderer.invoke('call-llm-api', request),
  loadSuperAgentConfig: () => ipcRenderer.invoke('load-superagent-config'),
  saveSuperAgentConfig: (config: Partial<SuperAgentConfig>) =>
    ipcRenderer.invoke('save-superagent-config', config),
  saveSuperAgentSession: (session: SuperAgentSession) =>
    ipcRenderer.invoke('save-superagent-session', session),
  listSuperAgentSessions: () => ipcRenderer.invoke('list-superagent-sessions'),
  deleteSuperAgentSession: (sessionId: string) =>
    ipcRenderer.invoke('delete-superagent-session', sessionId),

  // Hives (Agent Swarms)
  listHives: () => ipcRenderer.invoke('hive-list'),
  getHive: (id: string) => ipcRenderer.invoke('hive-get', id),
  createHive: (hive: Omit<Hive, 'id' | 'createdAt' | 'updatedAt'>) => ipcRenderer.invoke('hive-create', hive),
  updateHive: (id: string, updates: Partial<Hive>) => ipcRenderer.invoke('hive-update', id, updates),
  deleteHive: (id: string) => ipcRenderer.invoke('hive-delete', id),
  resetHives: () => ipcRenderer.invoke('hive-reset'),

  // Window Controls
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),

  // Terminal Session State
  setTerminalSessionActive: (active: boolean) => ipcRenderer.send('terminal-session-active', active),

  // Background Agents
  backgroundAgentList: () => ipcRenderer.invoke('background-agent-list'),
  backgroundAgentAdd: (task: { name: string; prompt: string; projectPath: string; priority?: 'low' | 'normal' | 'high' }) =>
    ipcRenderer.invoke('background-agent-add', task),
  backgroundAgentRemove: (taskId: string) => ipcRenderer.invoke('background-agent-remove', taskId),
  backgroundAgentCancel: (taskId: string) => ipcRenderer.invoke('background-agent-cancel', taskId),
  backgroundAgentStartQueue: () => ipcRenderer.invoke('background-agent-start-queue'),
  backgroundAgentPauseQueue: () => ipcRenderer.invoke('background-agent-pause-queue'),
  backgroundAgentQueueStatus: () => ipcRenderer.invoke('background-agent-queue-status'),
  backgroundAgentSetMaxConcurrent: (max: number) => ipcRenderer.invoke('background-agent-set-max-concurrent', max),
  backgroundAgentGetOutput: (taskId: string) => ipcRenderer.invoke('background-agent-get-output', taskId),
  backgroundAgentClearCompleted: () => ipcRenderer.invoke('background-agent-clear-completed'),
  backgroundAgentRetry: (taskId: string) => ipcRenderer.invoke('background-agent-retry', taskId),
  backgroundAgentReorder: (taskId: string, newIndex: number) => ipcRenderer.invoke('background-agent-reorder', taskId, newIndex),
  backgroundAgentSetPriority: (taskId: string, priority: 'low' | 'normal' | 'high') =>
    ipcRenderer.invoke('background-agent-set-priority', taskId, priority),
  onBackgroundAgentUpdate: (callback: (task: import('../shared/types').BackgroundAgentTask) => void) => {
    const handler = (_: Electron.IpcRendererEvent, task: import('../shared/types').BackgroundAgentTask) => callback(task)
    ipcRenderer.on('background-agent-update', handler)
    return () => ipcRenderer.removeListener('background-agent-update', handler)
  },
  onBackgroundAgentOutput: (callback: (data: { taskId: string; data: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { taskId: string; data: string }) => callback(data)
    ipcRenderer.on('background-agent-output', handler)
    return () => ipcRenderer.removeListener('background-agent-output', handler)
  },

  // Teams
  teamsList: () => ipcRenderer.invoke('teams-list'),
  teamsGetConfig: (name: string) => ipcRenderer.invoke('teams-get-config', name),
  teamsGetTasks: (name: string) => ipcRenderer.invoke('teams-get-tasks', name),
  teamsDelete: (name: string) => ipcRenderer.invoke('teams-delete', name),

  // Repository Visualization
  repoAnalyze: (basePath: string) => ipcRenderer.invoke('repo-analyze', basePath),
  repoGetFileContent: (filePath: string) => ipcRenderer.invoke('repo-get-file-content', filePath),

  // Memory (CLAUDE.md based system)
  memoryList: (projectPath: string) => ipcRenderer.invoke('memory-list', projectPath),
  memoryGetRaw: (projectPath: string, type: 'main' | 'local' | 'user') =>
    ipcRenderer.invoke('memory-get-raw', projectPath, type),
  memorySaveRaw: (projectPath: string, type: 'main' | 'local' | 'user', content: string) =>
    ipcRenderer.invoke('memory-save-raw', projectPath, type, content),
  memoryAdd: (projectPath: string, item: { category: string; content: string; target: string }) =>
    ipcRenderer.invoke('memory-add', projectPath, item),
  memoryInit: (projectPath: string) =>
    ipcRenderer.invoke('memory-init', projectPath),
  memoryCheck: (projectPath: string) =>
    ipcRenderer.invoke('memory-check', projectPath),
  memoryOpenEditor: (projectPath: string, type: 'main' | 'local' | 'user') =>
    ipcRenderer.invoke('memory-open-editor', projectPath, type),
  memoryStats: (projectPath: string) =>
    ipcRenderer.invoke('memory-stats', projectPath),
  memoryDelete: (projectPath: string, type: 'main' | 'local' | 'rules') =>
    ipcRenderer.invoke('memory-delete', projectPath, type),
  // Session Context
  generateSessionContext: (projectPath: string, days?: number) =>
    ipcRenderer.invoke('generate-session-context', projectPath, days),
  writeSessionContext: (projectPath: string, content: string) =>
    ipcRenderer.invoke('write-session-context', projectPath, content),

  // Chat Mode
  chatSendPrompt: (options: { sessionId: string; prompt: string; cwd: string; model?: string; resumeSessionId?: string }) =>
    ipcRenderer.invoke('chat:send-prompt', options),
  chatStop: (sessionId: string) => ipcRenderer.invoke('chat:stop', sessionId),
  chatPermissionResponse: (sessionId: string, toolUseId: string, allowed: boolean) =>
    ipcRenderer.invoke('chat:permission-response', sessionId, toolUseId, allowed),
  onChatStreamEvent: (callback: (sessionId: string, event: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string, event: any) => callback(sessionId, event)
    ipcRenderer.on('chat:stream-event', handler)
    return () => ipcRenderer.removeListener('chat:stream-event', handler)
  },

  // Legacy methods (backward compatibility)
  memoryGetContext: (projectPath: string) =>
    ipcRenderer.invoke('memory-get-context', projectPath),
  memorySetGlobalContext: (projectPath: string, context: string) =>
    ipcRenderer.invoke('memory-set-global-context', projectPath, context),
  memoryGetGlobalContext: (projectPath: string) =>
    ipcRenderer.invoke('memory-get-global-context', projectPath),
  memoryClear: (projectPath: string) =>
    ipcRenderer.invoke('memory-clear', projectPath),
  memoryListProjects: () =>
    ipcRenderer.invoke('memory-list-projects')
}

contextBridge.exposeInMainWorld('api', api)
