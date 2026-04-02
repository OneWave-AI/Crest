import { CLI_PROVIDERS, CLAUDE_PATTERNS } from '../../shared/providers'
import type { SafetyLevel, CLIProvider } from '../../shared/types'

// Memoized ANSI stripping -- avoids re-processing the same output repeatedly
const stripAnsiCache = new Map<string, string>()
const STRIP_CACHE_MAX = 64

// Comprehensive ANSI/terminal escape stripping
export function stripAnsi(input: string): string {
  // Check cache for recently stripped strings
  const cached = stripAnsiCache.get(input)
  if (cached !== undefined) return cached

  let s = input
  // CSI sequences (including private modes like \x1b[?25h)
  s = s.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
  // OSC sequences: \x1b]...BEL or \x1b]...\x1b\\
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  // Single-char escapes: \x1b followed by one char (e.g. \x1b7, \x1b8, \x1bM, \x1b(B)
  s = s.replace(/\x1b[()#][A-Za-z0-9]/g, '')
  s = s.replace(/\x1b[78DEHM=>Nco]/g, '')
  // Stray BEL and ST control chars
  s = s.replace(/[\x07]/g, '')
  s = s.replace(/\x1b\\/g, '')
  // Carriage return overwrites: content\rReplacement → keep only Replacement
  s = s.replace(/^([^\n]*)\r(?!\n)/gm, (_match, _overwritten) => '')
  // Any remaining lone ESC sequences
  s = s.replace(/\x1b/g, '')

  // Maintain bounded cache
  if (stripAnsiCache.size >= STRIP_CACHE_MAX) {
    const firstKey = stripAnsiCache.keys().next().value
    if (firstKey !== undefined) stripAnsiCache.delete(firstKey)
  }
  stripAnsiCache.set(input, s)
  return s
}

// Legacy export for compatibility
export const ANSI_REGEX = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][A-Za-z0-9]|\x1b[78DEHM=>Nco]|[\x07]|\x1b\\/g

// ─── Claude Code State Parsing ─────────────────────────────────────────

export interface ClaudeCodeState {
  contextPercent: number | null       // 0-100, null if unknown
  activeModel: string | null          // e.g. "opus", "sonnet", "haiku"
  isPlanMode: boolean
  isStreaming: boolean
  lastToolCall: string | null         // e.g. "Read(src/main.ts)"
  costSoFar: string | null            // e.g. "$0.42"
  hasError: boolean
  errorMessage: string | null
  contextWarning: boolean             // true when context > 85%
}

/**
 * Parse Claude Code-specific state from terminal output.
 * This gives the UI rich awareness of what Claude is doing.
 */
export function parseClaudeCodeState(cleanOutput: string): ClaudeCodeState {
  const last50 = cleanOutput.split('\n').slice(-50).join('\n')
  const last20 = cleanOutput.split('\n').slice(-20).join('\n')

  // Context window usage
  let contextPercent: number | null = null
  const ctxMatch = last50.match(CLAUDE_PATTERNS.contextUsage) || last50.match(CLAUDE_PATTERNS.contextUsageAlt)
  if (ctxMatch) contextPercent = parseInt(ctxMatch[1])

  // Active model
  let activeModel: string | null = null
  const modelMatch = last50.match(CLAUDE_PATTERNS.activeModel)
  if (modelMatch) {
    const raw = (modelMatch[1] || modelMatch[0]).toLowerCase()
    if (raw.includes('opus')) activeModel = 'opus'
    else if (raw.includes('sonnet')) activeModel = 'sonnet'
    else if (raw.includes('haiku')) activeModel = 'haiku'
    else activeModel = raw
  }

  // Plan mode
  const isPlanMode = CLAUDE_PATTERNS.planMode.test(last20) && !CLAUDE_PATTERNS.planModeOff.test(last20)

  // Streaming (Claude outputting response)
  const isStreaming = CLAUDE_PATTERNS.streaming.test(last20)

  // Last tool call
  let lastToolCall: string | null = null
  const toolPatterns = [
    CLAUDE_PATTERNS.toolCallRead, CLAUDE_PATTERNS.toolCallWrite,
    CLAUDE_PATTERNS.toolCallEdit, CLAUDE_PATTERNS.toolCallBash,
    CLAUDE_PATTERNS.toolCallAgent, CLAUDE_PATTERNS.toolCallGlob,
    CLAUDE_PATTERNS.toolCallGrep, CLAUDE_PATTERNS.toolCallSkill,
  ]
  for (const p of toolPatterns) {
    const m = last20.match(p)
    if (m) { lastToolCall = m[0]; break }
  }

  // Cost
  let costSoFar: string | null = null
  const costMatch = last50.match(CLAUDE_PATTERNS.costInfo)
  if (costMatch) {
    const dollarMatch = costMatch[0].match(/\$[\d.]+/)
    if (dollarMatch) costSoFar = dollarMatch[0]
  }

  // Error state
  const hasError = CLAUDE_PATTERNS.claudeError.test(last20)
  let errorMessage: string | null = null
  if (hasError) {
    const errLine = last20.split('\n').find(l => CLAUDE_PATTERNS.claudeError.test(l))
    if (errLine) errorMessage = errLine.trim().slice(0, 200)
  }

  // Context warning
  const contextWarning = contextPercent !== null ? contextPercent >= 85 : CLAUDE_PATTERNS.contextHigh.test(last50)

  return { contextPercent, activeModel, isPlanMode, isStreaming, lastToolCall, costSoFar, hasError, errorMessage, contextWarning }
}

// System prompt for the Super Agent / Orchestrator LLM
export const SYSTEM_PROMPT = `You are an autonomous agent controlling Claude Code (or another CLI coding assistant) via terminal. Your job is to keep it working on the task until it's PERFECT.

MODE: {MODE}
ORIGINAL TASK: {TASK}

{TAKEOVER_CONTEXT}

=== UNDERSTANDING CLAUDE CODE ===

Claude Code is a terminal-based AI coding tool. Key behaviors:
- It uses tools like Read(), Write(), Edit(), Bash(), Glob(), Grep(), Agent() shown in output
- Streaming output uses box-drawing chars: ⎿ ├ │ ╰ (means Claude is generating - WAIT)
- Permission prompts show "Allow" / "Deny" / "Skip" - approve with "y" unless dangerous
- The prompt char ❯ means Claude is ready for input
- Slash commands: /compact (free up context), /clear (reset), /model (switch model), /cost (show spend)
- Plan mode (shift+tab in real Claude) toggles between planning and executing
- Context window warnings mean you should send /compact to free up space

=== DECISION RULES (in priority order) ===

1. CLI IS WORKING - If you see ANY of these, respond "WAIT":
   - Spinner characters (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
   - "..." at end of line
   - Tool calls: Read(, Write(, Edit(, Bash(, Glob(, Grep(, Agent(, Skill(
   - Box-drawing output: ⎿ ├ │ (Claude streaming a response)
   - "Thinking..." or "Searching..." or "Reading..."

2. CONTEXT WINDOW HIGH (85%+) - If you see context usage > 85%:
   → respond: /compact
   → This frees up context so Claude can keep working

3. ERROR STATE - If you see "API error", "rate limit", "overloaded", "timeout":
   → Wait 10 seconds, then retry the last request
   → If persistent, try: /model sonnet (switch to faster model)

4. YES/NO PROMPT - If you see "(y/n)" or "[Y/n]" or "Allow?" or permission prompt:
   → respond: y (unless it involves rm -rf, force push, drop database, etc.)

5. QUESTION - If the CLI asks a question (ends with ?):
   → Give a specific, helpful answer that advances the task

6. OPTIONS - If the CLI shows numbered options [1] [2] [3]:
   → Pick the best number for the task

7. CLI FINISHED OR ASKING "anything else?" - KEEP ITERATING:
   → Suggest a specific improvement, enhancement, or polish
   → NEVER say "DONE" - always find something to improve

8. WAITING FOR INPUT (❯ prompt visible):
   → If task is just starting: guide on first steps
   → If task is in progress: suggest next feature or improvement
   → NEVER say "DONE" - keep pushing for perfection

=== CRITICAL RULES ===
- Output ONLY the EXACT text to type into the terminal - nothing else!
- NEVER say "You should type:" or "Run this command:" - just output the actual text
- NEVER say "Suggest adding..." - instead say "Add..." as a direct instruction
- If the CLI is working, respond exactly "WAIT"
- NEVER respond "DONE" - always suggest improvements until time runs out
- Never repeat the exact same message or semantically similar suggestions twice
- Be SPECIFIC with improvements - don't just say "add error handling" repeatedly
- Vary your suggestions: try different aspects like UX, performance, accessibility, animations, tests
- If Claude seems stuck or confused, try rephrasing the task differently
- If context is running low, use /compact before sending more instructions`

// Detect Claude's current status from pre-cleaned output using provider patterns
export type ClaudeStatus = 'working' | 'waiting' | 'streaming' | 'error' | 'unknown'

export function detectClaudeStatus(cleanOutput: string, cliProvider: CLIProvider): ClaudeStatus {
  const config = CLI_PROVIDERS[cliProvider]
  const allLines = cleanOutput.split('\n')
  const last15 = allLines.slice(-15).join('\n')
  const last10 = allLines.slice(-10).join('\n')

  // Claude-specific: check for error states first (highest priority)
  if (cliProvider === 'claude' && CLAUDE_PATTERNS.claudeError.test(last10)) {
    // Only if the error is in the very recent output (last 5 lines)
    const last5 = allLines.slice(-5).join('\n')
    if (CLAUDE_PATTERNS.claudeError.test(last5)) return 'error'
  }

  // Check working patterns against last 15 lines
  for (const pattern of config.workingPatterns) {
    if (pattern.test(last15)) return 'working'
  }

  // Claude-specific: detect active streaming (Claude outputting a response)
  if (cliProvider === 'claude' && CLAUDE_PATTERNS.streaming.test(last10)) {
    // Only count as streaming if no prompt char visible (still generating)
    if (!config.promptChar.test(last10)) return 'streaming'
  }

  // Check waiting patterns against last 15 lines
  for (const pattern of config.waitingPatterns) {
    if (pattern.test(last15)) return 'waiting'
  }
  // Check prompt char against last 10 lines only to avoid false matches from earlier content
  if (config.promptChar.test(last10)) return 'waiting'
  return 'unknown'
}

// Fast-path result with optional question context
export interface FastPathResult {
  response: string
  question?: string
}

// Dangerous commands to block in safe mode
export const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+--force/i,
  /git\s+push\s+--force/i,
  /git\s+push\s+-f/i,
  /drop\s+database/i,
  /truncate\s+table/i,
  /delete\s+from.*where.*1\s*=\s*1/i,
  /format\s+c:/i,
  /mkfs/i,
  /dd\s+if=/i
]

// Fast-path patterns that can be answered without an LLM call
export function fastPathResponse(
  cleanOutput: string, taskSent: boolean, task: string,
  safetyLevel: SafetyLevel, cliProvider: CLIProvider
): FastPathResult | null {
  const config = CLI_PROVIDERS[cliProvider]
  const lastLines = cleanOutput.split('\n').slice(-10).join('\n')

  // 1. Spinner/working indicators -> WAIT (no send)
  if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(lastLines)) return { response: 'WAIT' }

  // 2. Claude-specific: streaming output (⎿ ├ │) means response in progress -> WAIT
  if (cliProvider === 'claude' && CLAUDE_PATTERNS.streaming.test(lastLines)) {
    if (!config.promptChar.test(lastLines)) return { response: 'WAIT' }
  }

  // 3. Claude-specific: tool execution in progress -> WAIT
  if (cliProvider === 'claude') {
    const toolMatch = lastLines.match(/(?:Read|Write|Edit|Bash|Glob|Grep|Agent|Skill|WebFetch|WebSearch)\([^)]*\)/)
    if (toolMatch && !config.promptChar.test(lastLines)) return { response: 'WAIT' }
  }

  // 4. Yes/no prompts -> check safety before auto-approving
  if (/\(y\/n\)|\[Y\/n\]|\[y\/N\]|Allow\?|Proceed\?|Continue\?/i.test(lastLines)) {
    const lines = lastLines.split('\n').filter(l => l.trim())
    const idx = lines.findIndex(l => /\(y\/n\)|Allow\?|Proceed\?|Continue\?|\[Y\/n\]|\[y\/N\]/i.test(l))
    const question = lines.slice(Math.max(0, idx - 1), idx + 1).join(' ').trim()

    if (safetyLevel === 'safe' && DANGEROUS_PATTERNS.some(p => p.test(question))) {
      return null // fall through to LLM
    }
    return { response: 'y', question }
  }

  // 5. Claude-specific: permission Allow/Deny prompt
  if (cliProvider === 'claude' && /Allow|Deny|Skip/.test(lastLines)) {
    const last5 = cleanOutput.split('\n').slice(-5).join('\n')
    if (/Allow/.test(last5)) {
      // Check if it's a dangerous operation
      if (safetyLevel === 'safe' && DANGEROUS_PATTERNS.some(p => p.test(last5))) {
        return null
      }
      return { response: 'y', question: 'Claude permission prompt' }
    }
  }

  // 6. Trust prompt
  if (/trust this project/i.test(lastLines)) return { response: 'y', question: 'Trust this project?' }

  // 7. Claude-specific: context window warning -> auto-compact
  if (cliProvider === 'claude' && CLAUDE_PATTERNS.contextHigh.test(lastLines)) {
    if (config.promptChar.test(lastLines)) {
      return { response: '/compact', question: 'Context window running high' }
    }
  }

  // 8. Ready prompt + task not sent yet -> send the task
  if (config.promptChar.test(lastLines) && !taskSent) return { response: task }

  // 9. Questions that need creative answers -> fall through to LLM
  if (/anything else|how can i help|what would you like/i.test(lastLines)) return null

  return null
}

// Check if command is dangerous
export function isDangerous(command: string, level: SafetyLevel): boolean {
  if (level === 'yolo') return false
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
}

// Lightweight stats parser - returns partial stats object
export function parseStats(cleanOutput: string): Record<string, number> {
  const stats: Record<string, number> = {}
  const writes = cleanOutput.match(/(?:Write|Edit)\([^)]+\)/gi)
  if (writes) stats.filesWritten = writes.length
  const reads = cleanOutput.match(/Read\([^)]+\)/gi)
  if (reads) stats.filesRead = reads.length
  const passed = cleanOutput.match(/(\d+)\s+(?:tests?\s+)?passed/i)
  if (passed) stats.testsPassed = parseInt(passed[1])
  const failed = cleanOutput.match(/(\d+)\s+(?:tests?\s+)?failed/i)
  if (failed) stats.testsFailed = parseInt(failed[1])
  const errors = cleanOutput.match(/(?:Error|error|ERROR):/g)
  if (errors) stats.errorsEncountered = errors.length
  // Claude-specific tool counts
  const bashCalls = cleanOutput.match(/Bash\([^)]*\)/gi)
  if (bashCalls) stats.bashCommands = bashCalls.length
  const globCalls = cleanOutput.match(/Glob\([^)]*\)/gi)
  if (globCalls) stats.globSearches = globCalls.length
  const grepCalls = cleanOutput.match(/Grep\([^)]*\)/gi)
  if (grepCalls) stats.grepSearches = grepCalls.length
  const agentCalls = cleanOutput.match(/Agent\([^)]*\)/gi)
  if (agentCalls) stats.subAgentsSpawned = agentCalls.length
  // Total tool calls
  stats.totalToolCalls = (stats.filesWritten || 0) + (stats.filesRead || 0) +
    (stats.bashCommands || 0) + (stats.globSearches || 0) +
    (stats.grepSearches || 0) + (stats.subAgentsSpawned || 0)
  return stats
}

// Parse LLM decision text, extracting actual command from meta-patterns
export function parseLLMDecision(rawDecision: string): string {
  let trimmed = rawDecision.trim()

  // Try parsing as JSON structured output first
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed.action === 'string') {
      if (parsed.action === 'wait') return 'WAIT'
      if (parsed.action === 'done') return 'DONE'
      if (parsed.action === 'send' && typeof parsed.text === 'string') return parsed.text
    }
  } catch {
    // Not JSON - fall back to raw text parsing
    const metaPatterns = [
      /^You should (?:type|say|respond|enter|input):\s*["']?(.+?)["']?$/is,
      /^(?:Type|Say|Respond|Enter|Send):\s*["']?(.+?)["']?$/is,
      /^Run (?:this )?(?:command|script)?:?\s*["']?(.+?)["']?$/is,
      /^Suggest(?:ion)?:?\s*["']?(.+?)["']?$/is,
    ]
    for (const pattern of metaPatterns) {
      const match = trimmed.match(pattern)
      if (match && match[1]) {
        trimmed = match[1].trim()
        break
      }
    }
    if (trimmed.toLowerCase().startsWith('suggest adding ')) {
      trimmed = 'Add ' + trimmed.slice(15)
    } else if (trimmed.toLowerCase().startsWith('suggest ')) {
      trimmed = trimmed.slice(8)
    }
  }

  return trimmed
}

// Detect when a task is actually complete (Claude asking "anything else?" after doing work)
export function detectTaskCompletion(cleanOutput: string, cliProvider: CLIProvider): boolean {
  const lastLines = cleanOutput.split('\n').slice(-20).join('\n')

  // Claude says task is complete
  if (/(?:anything else|is there anything|how can i help|what.*would you like)/i.test(lastLines)) {
    // Only if there are signs of actual work done
    if (/(?:created|wrote|updated|fixed|implemented|added|built|completed)/i.test(cleanOutput.slice(-3000))) {
      return true
    }
  }

  // Claude-specific: prompt visible + task summary indicators
  if (cliProvider === 'claude') {
    const config = CLI_PROVIDERS[cliProvider]
    // Prompt char visible + completion phrases in recent output
    if (config.promptChar.test(lastLines)) {
      const recent = cleanOutput.split('\n').slice(-30).join('\n')
      // Claude often ends with a summary of what was done
      if (/(?:I've |I have |Here's what I |Changes made|Summary of changes|All done|Successfully)/i.test(recent)) {
        // Verify actual tool usage happened (not just talking about it)
        if (/(?:Write|Edit|Bash|Read)\([^)]+\)/i.test(cleanOutput.slice(-5000))) {
          return true
        }
      }
    }
  }

  return false
}

// Conversation-aware output summarization - preserves conversation thread and recent state
export function summarizeTerminalOutput(cleanOutput: string, maxChars: number = 6000): string {
  if (cleanOutput.length <= maxChars) return cleanOutput

  const lines = cleanOutput.split('\n')

  // Keep first 5 lines for initial context, last 60 lines for recent state (most critical)
  const head = lines.slice(0, 5).join('\n')
  const tail = lines.slice(-60).join('\n')

  // From the middle, keep conversation turns and important events
  const middleLines = lines.slice(5, -60)
  const conversationPattern = /^(?:❯|>|\$|---\s*AGENT SENT:|Human:|Assistant:|claude|You:|Error|error|warning|failed|success|✓|✗)/i
  const importantPatterns = /(?:error|warning|created|wrote|updated|failed|success|test|passed|TODO|FIXME)/i
  const importantMiddle = middleLines
    .filter(l => conversationPattern.test(l.trim()) || importantPatterns.test(l))
    .slice(-30) // Cap at 30 important lines
    .join('\n')

  const budget = maxChars - head.length - tail.length - 100 // 100 for separators
  const middleTruncated = importantMiddle.slice(0, Math.max(0, budget))

  return `${head}\n\n--- [${middleLines.length} lines summarized, showing conversation turns & key events] ---\n${middleTruncated}\n\n--- [Recent output] ---\n${tail}`
}

// Semantic duplicate detection
export function isSemanticallyDuplicate(newResponse: string, recentSuggestions: string[]): boolean {
  if (newResponse.length <= 5) return false
  const newWords = new Set(newResponse.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  for (const prev of recentSuggestions) {
    const prevWords = new Set(prev.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const overlap = [...newWords].filter(w => prevWords.has(w)).length
    const similarity = overlap / Math.max(newWords.size, prevWords.size)
    if (similarity > 0.7) return true
  }
  return false
}
