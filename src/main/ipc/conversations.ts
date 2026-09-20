import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { Conversation, ConversationMessage, ConversationStats, ConversationExportOptions } from '../../shared/types'
import { calculateCost } from '../../shared/pricing'

const CLAUDE_DIR = join(homedir(), '.claude')
const PINNED_FILE = join(CLAUDE_DIR, 'pinned-conversations.json')
const ACTIVE_TIME_IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

interface PinnedConversations {
  [key: string]: boolean // key is `${projectDir}:${id}` where projectDir is the raw directory name
}

async function loadPinnedConversations(): Promise<PinnedConversations> {
  try {
    const content = await fs.readFile(PINNED_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function savePinnedConversations(pinned: PinnedConversations): Promise<void> {
  await fs.writeFile(PINNED_FILE, JSON.stringify(pinned, null, 2), 'utf-8')
}

// Convert project folder path to Claude's directory naming convention
// /Users/you/project-name -> -Users-you-project-name
function pathToProjectDir(projectFolder: string): string {
  // If it already looks like a raw directory name (starts with -), return as-is
  if (projectFolder.startsWith('-')) {
    return projectFolder
  }
  return projectFolder.replace(/\//g, '-')
}

// Get the pinned key for a conversation
// Uses raw directory name to ensure consistency
function getPinnedKey(id: string, projectDir: string): string {
  // Normalize to raw directory format
  const normalizedDir = projectDir.startsWith('-') ? projectDir : pathToProjectDir(projectDir)
  return `${normalizedDir}:${id}`
}

async function getConversationFilePath(id: string, projectFolder: string): Promise<string> {
  const projectDir = pathToProjectDir(projectFolder)
  const directPath = join(CLAUDE_DIR, 'projects', projectDir, `${id}.jsonl`)

  // Check if the file exists at the expected path
  try {
    await fs.access(directPath)
    return directPath
  } catch {
    // If not found, search for it across all project directories
    // This handles the ambiguity when projectFolder is a cwd path
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const projectDirs = await fs.readdir(projectsDir).catch(() => [])

    for (const dir of projectDirs) {
      const filePath = join(projectsDir, dir, `${id}.jsonl`)
      try {
        await fs.access(filePath)
        return filePath
      } catch {
        continue
      }
    }

    // Fall back to original path (will throw error when accessed)
    return directPath
  }
}

interface ParsedConversation {
  messages: ConversationMessage[]
  stats: ConversationStats
  preview: string
  cwd?: string // The working directory from the conversation
}

async function parseConversationFile(filePath: string): Promise<ParsedConversation> {
  const fileStat = await fs.stat(filePath)

  // Handle empty files
  if (fileStat.size === 0) {
    return {
      messages: [],
      stats: {
        messageCount: 0,
        humanMessages: 0,
        assistantMessages: 0,
        duration: 0,
        estimatedTokens: 0,
        fileSize: 0
      },
      preview: ''
    }
  }

  const content = await fs.readFile(filePath, 'utf-8')
  const lines = content.split('\n').filter((line) => line.trim())

  const messages: ConversationMessage[] = []
  let humanMessages = 0
  let assistantMessages = 0
  const timestamps: number[] = []
  let preview = ''
  let summaryPreview = ''
  let estimatedTokens = 0
  let cwd: string | undefined

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      const timestamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : undefined

      if (timestamp && !isNaN(timestamp)) {
        timestamps.push(timestamp)
      }

      // Extract cwd from the first message that has it
      if (!cwd && parsed.cwd) {
        cwd = parsed.cwd
      }

      // Handle summary lines - can be used for preview
      if (parsed.type === 'summary' && parsed.summary && !summaryPreview) {
        summaryPreview = parsed.summary.slice(0, 150)
        continue
      }

      let messageType: 'human' | 'assistant' | 'system' = 'system'
      let messageContent = ''

      // Claude Code uses 'user' type for human messages (not 'human')
      if ((parsed.type === 'user' || parsed.type === 'human') && parsed.message?.content) {
        messageType = 'human'
        messageContent = typeof parsed.message.content === 'string'
          ? parsed.message.content
          : JSON.stringify(parsed.message.content)
        humanMessages++
        if (!preview) {
          preview = messageContent.slice(0, 150)
        }
      } else if (parsed.type === 'assistant' && parsed.message?.content) {
        messageType = 'assistant'
        if (Array.isArray(parsed.message.content)) {
          // Extract text blocks, skip thinking blocks
          messageContent = parsed.message.content
            .filter((block: { type: string }) => block.type === 'text')
            .map((block: { text: string }) => block.text)
            .join('\n')
        } else {
          messageContent = String(parsed.message.content)
        }
        // Only count assistant messages that have actual text content
        if (messageContent.trim()) {
          assistantMessages++
        }
      }

      if (messageContent.trim()) {
        // Rough token estimate: ~4 chars per token
        estimatedTokens += Math.ceil(messageContent.length / 4)
        messages.push({ type: messageType, content: messageContent, timestamp })
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  // Sum only gaps between consecutive messages that are under the idle threshold
  let duration = 0
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1]
    if (gap >= 0 && gap <= ACTIVE_TIME_IDLE_THRESHOLD_MS) {
      duration += gap
    }
  }

  // Use summary as preview if no user message preview available
  const finalPreview = preview || summaryPreview

  return {
    messages,
    stats: {
      messageCount: messages.length,
      humanMessages,
      assistantMessages,
      duration,
      estimatedTokens,
      fileSize: fileStat.size
    },
    preview: finalPreview,
    cwd
  }
}

export function registerConversationHandlers(): void {
  ipcMain.handle('list-conversations', async (): Promise<Conversation[]> => {
    const conversations: Conversation[] = []
    const pinnedConversations = await loadPinnedConversations()

    try {
      const projectsDir = join(CLAUDE_DIR, 'projects')
      const projectDirs = await fs.readdir(projectsDir).catch(() => [])

      for (const projectDir of projectDirs) {
        const projectPath = join(projectsDir, projectDir)
        const stat = await fs.stat(projectPath).catch(() => null)

        if (stat?.isDirectory()) {
          const files = await fs.readdir(projectPath).catch(() => [])
          // Only get JSONL files that look like UUIDs (main conversation files)
          // Skip agent-*.jsonl files which are subagent logs
          const jsonlFiles = files.filter((f) =>
            f.endsWith('.jsonl') && !f.startsWith('agent-')
          )

          for (const file of jsonlFiles) {
            const filePath = join(projectPath, file)
            const fileStat = await fs.stat(filePath).catch(() => null)

            if (fileStat) {
              const id = file.replace('.jsonl', '')
              // Use raw projectDir for pinned key to ensure consistency
              const pinnedKey = `${projectDir}:${id}`

              let preview = ''
              let stats: ConversationStats | undefined
              let projectFolder = projectDir // Default to raw directory name

              try {
                const parsed = await parseConversationFile(filePath)
                preview = parsed.preview
                stats = parsed.stats
                // Use the actual cwd from the conversation if available
                if (parsed.cwd) {
                  projectFolder = parsed.cwd
                }
              } catch {
                // Ignore parse errors
              }

              conversations.push({
                id,
                projectFolder,
                timestamp: fileStat.mtimeMs,
                preview: preview || undefined,
                pinned: pinnedConversations[pinnedKey] || false,
                stats
              })
            }
          }
        }
      }

      // Sort: pinned first, then by timestamp descending
      conversations.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.timestamp - a.timestamp
      })
    } catch (err) {
      console.error('Failed to list conversations:', err)
    }

    return conversations
  })

  ipcMain.handle(
    'get-conversation-preview',
    async (_, id: string, projectFolder: string): Promise<string> => {
      try {
        const filePath = await getConversationFilePath(id, projectFolder)
        const parsed = await parseConversationFile(filePath)
        return parsed.preview
      } catch {
        return ''
      }
    }
  )

  ipcMain.handle(
    'get-conversation-details',
    async (_, id: string, projectFolder: string): Promise<Conversation | null> => {
      try {
        const filePath = await getConversationFilePath(id, projectFolder)
        const fileStat = await fs.stat(filePath)
        const parsed = await parseConversationFile(filePath)
        const pinnedConversations = await loadPinnedConversations()
        const pinnedKey = getPinnedKey(id, projectFolder)

        return {
          id,
          projectFolder: parsed.cwd || projectFolder,
          timestamp: fileStat.mtimeMs,
          preview: parsed.preview,
          pinned: pinnedConversations[pinnedKey] || false,
          stats: parsed.stats
        }
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'get-conversation-messages',
    async (_, id: string, projectFolder: string, limit?: number): Promise<ConversationMessage[]> => {
      try {
        const filePath = await getConversationFilePath(id, projectFolder)
        const parsed = await parseConversationFile(filePath)
        return limit ? parsed.messages.slice(0, limit) : parsed.messages
      } catch {
        return []
      }
    }
  )

  ipcMain.handle(
    'delete-conversation',
    async (
      _,
      id: string,
      projectFolder: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const filePath = await getConversationFilePath(id, projectFolder)
        await fs.unlink(filePath)

        // Also remove from pinned if it was pinned
        const pinnedConversations = await loadPinnedConversations()
        const pinnedKey = getPinnedKey(id, projectFolder)
        if (pinnedConversations[pinnedKey]) {
          delete pinnedConversations[pinnedKey]
          await savePinnedConversations(pinnedConversations)
        }

        return { success: true }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete conversation'
        }
      }
    }
  )

  ipcMain.handle(
    'export-conversation',
    async (
      _,
      id: string,
      projectFolder: string,
      options?: ConversationExportOptions
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const filePath = await getConversationFilePath(id, projectFolder)
        const parsed = await parseConversationFile(filePath)
        const fileStat = await fs.stat(filePath)

        // Use cwd if available for better project display
        const displayProject = parsed.cwd || projectFolder

        // Build markdown content
        let markdown = `# Conversation Export\n\n`
        markdown += `**Project:** ${displayProject}\n`
        markdown += `**Date:** ${new Date(fileStat.mtimeMs).toLocaleString()}\n`
        markdown += `**Conversation ID:** ${id}\n\n`

        if (options?.includeStats && parsed.stats) {
          markdown += `## Statistics\n\n`
          markdown += `- **Total Messages:** ${parsed.stats.messageCount}\n`
          markdown += `- **Human Messages:** ${parsed.stats.humanMessages}\n`
          markdown += `- **Assistant Messages:** ${parsed.stats.assistantMessages}\n`
          markdown += `- **Duration:** ${formatDuration(parsed.stats.duration)}\n`
          if (parsed.stats.estimatedTokens) {
            markdown += `- **Estimated Tokens:** ~${parsed.stats.estimatedTokens.toLocaleString()}\n`
          }
          markdown += `- **File Size:** ${formatFileSize(parsed.stats.fileSize)}\n`
          markdown += `\n`
        }

        markdown += `---\n\n## Conversation\n\n`

        for (const message of parsed.messages) {
          const role = message.type === 'human' ? 'Human' : message.type === 'assistant' ? 'Assistant' : 'System'
          const timestamp = options?.includeTimestamps && message.timestamp
            ? ` (${new Date(message.timestamp).toLocaleString()})`
            : ''

          markdown += `### ${role}${timestamp}\n\n`
          markdown += `${message.content}\n\n`
        }

        // Show save dialog
        const result = await dialog.showSaveDialog({
          title: 'Export Conversation',
          defaultPath: join(homedir(), 'Downloads', `conversation-${id.slice(0, 8)}.md`),
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Export cancelled' }
        }

        await fs.writeFile(result.filePath, markdown, 'utf-8')

        // Open the folder containing the file
        shell.showItemInFolder(result.filePath)

        return { success: true, path: result.filePath }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to export conversation'
        }
      }
    }
  )

  ipcMain.handle(
    'pin-conversation',
    async (
      _,
      id: string,
      projectFolder: string,
      pinned: boolean
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const pinnedConversations = await loadPinnedConversations()
        const pinnedKey = getPinnedKey(id, projectFolder)

        if (pinned) {
          pinnedConversations[pinnedKey] = true
        } else {
          delete pinnedConversations[pinnedKey]
        }

        await savePinnedConversations(pinnedConversations)
        return { success: true }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to pin conversation'
        }
      }
    }
  )

  ipcMain.handle(
    'search-conversations',
    async (_, query: string): Promise<Conversation[]> => {
      const conversations: Conversation[] = []
      const pinnedConversations = await loadPinnedConversations()
      const searchQuery = query.toLowerCase()

      try {
        const projectsDir = join(CLAUDE_DIR, 'projects')
        const projectDirs = await fs.readdir(projectsDir).catch(() => [])

        for (const projectDir of projectDirs) {
          const projectPath = join(projectsDir, projectDir)
          const stat = await fs.stat(projectPath).catch(() => null)

          if (stat?.isDirectory()) {
            const files = await fs.readdir(projectPath).catch(() => [])
            // Only get JSONL files that look like UUIDs (main conversation files)
            // Skip agent-*.jsonl files which are subagent logs
            const jsonlFiles = files.filter((f) =>
              f.endsWith('.jsonl') && !f.startsWith('agent-')
            )

            for (const file of jsonlFiles) {
              const filePath = join(projectPath, file)
              const fileStat = await fs.stat(filePath).catch(() => null)

              if (fileStat && fileStat.size > 0) {
                const id = file.replace('.jsonl', '')
                const pinnedKey = `${projectDir}:${id}`

                try {
                  const content = await fs.readFile(filePath, 'utf-8')
                  const parsed = await parseConversationFile(filePath)

                  // Get the actual project folder from cwd or use directory name
                  const projectFolder = parsed.cwd || projectDir

                  // Check if query matches project folder, content, or summary
                  if (
                    projectFolder.toLowerCase().includes(searchQuery) ||
                    content.toLowerCase().includes(searchQuery)
                  ) {
                    conversations.push({
                      id,
                      projectFolder,
                      timestamp: fileStat.mtimeMs,
                      preview: parsed.preview || undefined,
                      pinned: pinnedConversations[pinnedKey] || false,
                      stats: parsed.stats
                    })
                  }
                } catch {
                  // Skip files that can't be read
                }
              }
            }
          }
        }

        // Sort: pinned first, then by timestamp descending
        conversations.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.timestamp - a.timestamp
        })
      } catch (err) {
        console.error('Failed to search conversations:', err)
      }

      return conversations
    }
  )

  // Generate session context markdown from recent conversations
  ipcMain.handle(
    'generate-session-context',
    async (_, projectPath: string, days: number = 7): Promise<string> => {
      try {
        if (!days || days <= 0 || isNaN(days)) days = 7

        const projectDir = pathToProjectDir(projectPath)
        const projectDirPath = join(CLAUDE_DIR, 'projects', projectDir)

        // Check if project directory exists
        try {
          await fs.access(projectDirPath)
        } catch {
          return ''
        }

        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        const files = await fs.readdir(projectDirPath).catch(() => [])
        const jsonlFiles = files.filter(
          (f) => f.endsWith('.jsonl') && !f.startsWith('agent-')
        )

        // Collect recent conversation entries
        const entries: { date: string; preview: string; timestamp: number }[] = []

        for (const file of jsonlFiles) {
          const filePath = join(projectDirPath, file)
          const fileStat = await fs.stat(filePath).catch(() => null)
          if (!fileStat || fileStat.size === 0 || fileStat.mtimeMs < cutoff) continue

          try {
            // Only read the first 32KB — we just need the first human messages
            const readSize = Math.min(fileStat.size, 32 * 1024)
            const fileHandle = await fs.open(filePath, 'r')
            let content: string
            try {
              const buffer = Buffer.alloc(readSize)
              await fileHandle.read(buffer, 0, readSize, 0)
              content = buffer.toString('utf-8')
            } finally {
              await fileHandle.close()
            }

            // If we read a partial file, drop the last potentially-truncated line
            const rawLines = content.split('\n')
            if (readSize < fileStat.size) rawLines.pop()
            const fileLines = rawLines.filter((l) => l.trim())

            // Extract first 1-2 human messages for topic
            let humanCount = 0
            let preview = ''
            let conversationTimestamp = 0

            for (const line of fileLines) {
              try {
                const parsed = JSON.parse(line)

                if (parsed.timestamp && !conversationTimestamp) {
                  const ts = new Date(parsed.timestamp).getTime()
                  if (!isNaN(ts)) conversationTimestamp = ts
                }

                if (
                  (parsed.type === 'user' || parsed.type === 'human') &&
                  parsed.message?.content
                ) {
                  let msg: string
                  if (typeof parsed.message.content === 'string') {
                    msg = parsed.message.content
                  } else if (Array.isArray(parsed.message.content)) {
                    // Extract text from content blocks (same format as assistant messages)
                    msg = parsed.message.content
                      .filter((b: { type: string }) => b.type === 'text')
                      .map((b: { text: string }) => b.text || '')
                      .join(' ')
                  } else {
                    msg = String(parsed.message.content)
                  }

                  const cleaned = msg.trim()
                  // Skip system/internal messages and non-useful previews
                  if (!cleaned || cleaned.startsWith('<') || cleaned.startsWith('[Request interrupted')) {
                    continue
                  }

                  if (humanCount === 0) {
                    // Collapse whitespace
                    let text = cleaned.replace(/\s+/g, ' ')

                    // Extract plan title if this is a plan-mode message
                    const planMatch = text.match(/^Implement the following plan:\s*#\s*(.+?)(?:\s*##|$)/)
                    if (planMatch) {
                      text = planMatch[1].trim()
                    }

                    // Truncate at word boundary
                    if (text.length > 100) {
                      text = text.slice(0, 100)
                      const lastSpace = text.lastIndexOf(' ')
                      if (lastSpace > 60) text = text.slice(0, lastSpace)
                      text += '...'
                    }
                    preview = text
                  }
                  humanCount++
                  if (humanCount >= 2) break
                }
              } catch {
                // Skip invalid JSON
              }
            }

            // Fall back to file mtime if no timestamp found in data
            const timestamp = conversationTimestamp || fileStat.mtimeMs

            if (preview) {
              const date = new Date(timestamp)
              const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })
              entries.push({ date: dateStr, preview, timestamp })
            }
          } catch {
            // Skip unreadable files
          }
        }

        if (entries.length === 0) return ''

        // Sort by timestamp descending, cap at 20
        entries.sort((a, b) => b.timestamp - a.timestamp)
        const capped = entries.slice(0, 20)

        // Group by date
        const grouped = new Map<string, string[]>()
        for (const entry of capped) {
          const existing = grouped.get(entry.date) || []
          existing.push(entry.preview)
          grouped.set(entry.date, existing)
        }

        // Build markdown
        const output = [
          '# Recent Session History',
          '',
          'This is auto-generated context about recent work in this project.',
          '',
          `## Last ${days} Days`,
          ''
        ]

        for (const [date, previews] of grouped) {
          for (const p of previews) {
            output.push(`- **${date}**: ${p}`)
          }
        }

        output.push('')
        return output.join('\n')
      } catch (err) {
        console.error('Failed to generate session context:', err)
        return ''
      }
    }
  )

  // Cache for todo polling optimization
  let lastTodoFileCheck: { path: string; mtime: number; todos: Array<{ id: string; content: string; status: string; activeForm?: string; createdAt: Date }> } | null = null

  // Get current session's todos from JSONL file
  ipcMain.handle(
    'get-current-session-todos',
    async (_, projectFolder: string): Promise<Array<{ id: string; content: string; status: string; activeForm?: string; createdAt: Date }>> => {
      try {
        const projectDir = pathToProjectDir(projectFolder)
        const projectPath = join(CLAUDE_DIR, 'projects', projectDir)

        // Check if project directory exists
        try {
          await fs.access(projectPath)
        } catch {
          return []
        }

        // Find the most recently modified JSONL file (excluding agent files)
        const files = await fs.readdir(projectPath).catch(() => [])
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

        if (jsonlFiles.length === 0) return []

        // Get file stats and find most recent
        const fileStats = await Promise.all(
          jsonlFiles.map(async (file) => {
            const filePath = join(projectPath, file)
            const stat = await fs.stat(filePath).catch(() => null)
            return { file, filePath, mtime: stat?.mtimeMs || 0 }
          })
        )

        const mostRecent = fileStats.sort((a, b) => b.mtime - a.mtime)[0]
        if (!mostRecent || mostRecent.mtime === 0) return []

        // Skip reading if file hasn't changed since last check
        if (lastTodoFileCheck &&
            lastTodoFileCheck.path === mostRecent.filePath &&
            lastTodoFileCheck.mtime === mostRecent.mtime) {
          return lastTodoFileCheck.todos
        }

        // For large files, only read the last 100KB (where recent todos likely are)
        const stat = await fs.stat(mostRecent.filePath)
        const fileSize = stat.size
        const readSize = Math.min(fileSize, 100 * 1024) // 100KB max
        const startPosition = Math.max(0, fileSize - readSize)

        // Read the tail of the file
        const fileHandle = await fs.open(mostRecent.filePath, 'r')
        const buffer = Buffer.alloc(readSize)
        await fileHandle.read(buffer, 0, readSize, startPosition)
        await fileHandle.close()

        const content = buffer.toString('utf-8')
        // If we started mid-file, skip the first partial line
        const lines = startPosition > 0
          ? content.split('\n').slice(1).filter(line => line.trim())
          : content.split('\n').filter(line => line.trim())

        // Search from the end for the most recent toolUseResult with newTodos
        let latestTodos: Array<{ content: string; status: string; activeForm?: string }> | null = null

        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i])
            if (parsed.toolUseResult?.newTodos && Array.isArray(parsed.toolUseResult.newTodos)) {
              latestTodos = parsed.toolUseResult.newTodos
              break
            }
          } catch {
            // Skip invalid JSON
          }
        }

        if (!latestTodos) {
          // Cache empty result too
          lastTodoFileCheck = { path: mostRecent.filePath, mtime: mostRecent.mtime, todos: [] }
          return []
        }

        // Format for the Plan panel - use stable IDs based on content
        const result = latestTodos.map((todo, index) => ({
          id: `todo-${index}-${(todo.content || '').slice(0, 20).replace(/\W/g, '')}`,
          content: todo.content || 'Unknown task',
          status: todo.status || 'pending',
          activeForm: todo.activeForm,
          createdAt: new Date()
        }))

        // Cache the result
        lastTodoFileCheck = { path: mostRecent.filePath, mtime: mostRecent.mtime, todos: result }

        return result
      } catch (err) {
        console.error('Failed to get current session todos:', err)
        return []
      }
    }
  )
}

// Usage Statistics Handler
interface UsageEntry {
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

interface DetailedUsageStats {
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

ipcMain.handle('get-detailed-usage-stats', async (_, days: number = 30): Promise<DetailedUsageStats> => {
  const usageByDate = new Map<string, UsageEntry>()
  const usageByModel = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number; cost: number; sessions: number }>()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    cost: 0,
    sessions: 0
  }

  try {
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const projectDirs = await fs.readdir(projectsDir).catch(() => [])

    for (const projectDir of projectDirs) {
      const projectPath = join(projectsDir, projectDir)
      const stat = await fs.stat(projectPath).catch(() => null)

      if (stat?.isDirectory()) {
        const files = await fs.readdir(projectPath).catch(() => [])
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

        for (const file of jsonlFiles) {
          const filePath = join(projectPath, file)
          const fileStat = await fs.stat(filePath).catch(() => null)

          if (!fileStat || fileStat.mtimeMs < cutoffDate.getTime()) continue

          try {
            const content = await fs.readFile(filePath, 'utf-8')
            const lines = content.split('\n').filter(line => line.trim())

            let sessionInputTokens = 0
            let sessionOutputTokens = 0
            let sessionCacheCreation = 0
            let sessionCacheRead = 0
            let sessionModel = 'claude-sonnet-4'
            let sessionDate = new Date(fileStat.mtimeMs).toISOString().split('T')[0]

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line)

                // Extract timestamp if available
                if (parsed.timestamp) {
                  const lineDate = new Date(parsed.timestamp)
                  if (lineDate >= cutoffDate) {
                    sessionDate = lineDate.toISOString().split('T')[0]
                  }
                }

                // Extract model info
                if (parsed.model) {
                  sessionModel = parsed.model
                }

                // Extract usage from various message formats
                // Format 1: usage field in assistant messages
                if (parsed.message?.usage) {
                  const usage = parsed.message.usage
                  sessionInputTokens += usage.input_tokens || 0
                  sessionOutputTokens += usage.output_tokens || 0
                  sessionCacheCreation += usage.cache_creation_input_tokens || 0
                  sessionCacheRead += usage.cache_read_input_tokens || 0
                }

                // Format 2: usage in result field
                if (parsed.result?.usage) {
                  const usage = parsed.result.usage
                  sessionInputTokens += usage.input_tokens || 0
                  sessionOutputTokens += usage.output_tokens || 0
                  sessionCacheCreation += usage.cache_creation_input_tokens || 0
                  sessionCacheRead += usage.cache_read_input_tokens || 0
                }

                // Format 3: costUSD direct field (convert back to estimate tokens)
                if (parsed.costUSD && !parsed.message?.usage && !parsed.result?.usage) {
                  // Rough estimate: $0.009 per 1K tokens average
                  const estimatedTokens = Math.round((parsed.costUSD / 0.009) * 1000)
                  sessionInputTokens += Math.round(estimatedTokens * 0.3)
                  sessionOutputTokens += Math.round(estimatedTokens * 0.7)
                }
              } catch {
                // Skip invalid JSON
              }
            }

            // Only count if we found token usage
            if (sessionInputTokens > 0 || sessionOutputTokens > 0) {
              const sessionCost = calculateCost(
                sessionInputTokens,
                sessionOutputTokens,
                sessionCacheCreation,
                sessionCacheRead,
                sessionModel
              )

              // Update daily totals
              const existing = usageByDate.get(sessionDate) || {
                date: sessionDate,
                model: sessionModel,
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationInputTokens: 0,
                cacheReadInputTokens: 0,
                totalTokens: 0,
                cost: 0,
                sessions: 0
              }
              existing.inputTokens += sessionInputTokens
              existing.outputTokens += sessionOutputTokens
              existing.cacheCreationInputTokens += sessionCacheCreation
              existing.cacheReadInputTokens += sessionCacheRead
              existing.totalTokens += sessionInputTokens + sessionOutputTokens
              existing.cost += sessionCost
              existing.sessions += 1
              usageByDate.set(sessionDate, existing)

              // Update model totals
              const modelKey = sessionModel.includes('opus') ? 'Opus' :
                             sessionModel.includes('haiku') ? 'Haiku' : 'Sonnet'
              const modelExisting = usageByModel.get(modelKey) || {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cost: 0,
                sessions: 0
              }
              modelExisting.inputTokens += sessionInputTokens
              modelExisting.outputTokens += sessionOutputTokens
              modelExisting.totalTokens += sessionInputTokens + sessionOutputTokens
              modelExisting.cost += sessionCost
              modelExisting.sessions += 1
              usageByModel.set(modelKey, modelExisting)

              // Update totals
              totals.inputTokens += sessionInputTokens
              totals.outputTokens += sessionOutputTokens
              totals.cacheCreationInputTokens += sessionCacheCreation
              totals.cacheReadInputTokens += sessionCacheRead
              totals.totalTokens += sessionInputTokens + sessionOutputTokens
              totals.cost += sessionCost
              totals.sessions += 1
            }
          } catch {
            // Skip files that can't be parsed
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to get usage stats:', err)
  }

  // Convert maps to sorted arrays
  const daily = Array.from(usageByDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  const byModel = Array.from(usageByModel.entries()).map(([model, data]) => ({
    model,
    ...data
  })).sort((a, b) => b.totalTokens - a.totalTokens)

  // Calculate predictions
  const activeDays = daily.length || 1
  const dailyAverage = totals.totalTokens / activeDays

  return {
    daily,
    byModel,
    totals,
    predictions: {
      dailyAverage: Math.round(dailyAverage),
      weeklyProjection: Math.round(dailyAverage * 7),
      monthlyProjection: Math.round(dailyAverage * 30),
      costPerSession: totals.sessions > 0 ? totals.cost / totals.sessions : 0
    }
  }
})

function formatDuration(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`
  } else if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m`
  } else {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.round((ms % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}
