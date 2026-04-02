import type { CLIProvider, CLIProviderConfig } from './types'

// Claude Code-specific patterns for parsing structured terminal output
export const CLAUDE_PATTERNS = {
  // Context window usage: "Context: 45.2k/200k tokens (23%)" or "87% context used"
  contextUsage: /(?:Context|context)[\s:]+[\d.]+[km]?\s*\/\s*[\d.]+[km]?\s*(?:tokens?\s*)?\((\d+)%\)/i,
  contextUsageAlt: /(\d+)%\s*(?:context|of context)\s*(?:used|remaining)/i,
  // Active model detection: "Model: claude-opus-4-6" or "Opus 4.6 (1M context)"
  activeModel: /(?:Model|model)[\s:]+(\S+)|(?:Opus|Sonnet|Haiku)\s+[\d.]+\s*\([^)]*\)/i,
  // Plan mode indicators
  planMode: /Plan mode|plan mode|📋\s*Plan|Planned steps/i,
  planModeOff: /Work mode|Exited plan mode/i,
  // Tool calls with file paths -- more specific than generic tool detection
  toolCallRead: /Read\(([^)]+)\)/,
  toolCallWrite: /Write\(([^)]+)\)/,
  toolCallEdit: /Edit\(([^)]+)\)/,
  toolCallBash: /Bash\(([^)]*)\)/,
  toolCallAgent: /Agent\(([^)]*)\)/,
  toolCallGlob: /Glob\(([^)]*)\)/,
  toolCallGrep: /Grep\(([^)]*)\)/,
  toolCallWebFetch: /WebFetch\(([^)]*)\)/,
  toolCallWebSearch: /WebSearch\(([^)]*)\)/,
  toolCallSkill: /Skill\(([^)]*)\)/,
  // Slash commands
  slashCommand: /^\/(?:model|compact|clear|help|memory|config|cost|doctor|login|logout|status|review|pr|commit|init|bug|mcp|vim|fast|permissions|terminal-setup|listen|ide)\b/m,
  // Cost tracking: "$0.42 cost" or "Cost: $1.23"
  costInfo: /\$[\d.]+\s*(?:cost|spent)|Cost[\s:]+\$[\d.]+/i,
  // Session info
  sessionStart: /Claude Code v[\d.]+|▐▛███▜▌|Opus|Sonnet|Haiku/,
  // Error states
  claudeError: /(?:API error|rate limit|overloaded|connection refused|ECONNREFUSED|timeout|504|529|Error:|ValidationError)/i,
  // Compact mode suggestion
  contextHigh: /context.*(?:8[5-9]|9\d|100)%|running low on context/i,
  // Permission prompts specific to Claude
  permissionPrompt: /Allow|Deny|Skip|Trust this project|approve this action/i,
  // Streaming indicators (Claude outputs these while generating)
  streaming: /⎿|├|│|╰|─/,
  // Task/todo indicators
  taskUpdate: /TaskCreate|TaskUpdate|TaskGet|TaskList|✅|☐|☑/,
}

export const CLI_PROVIDERS: Record<CLIProvider, CLIProviderConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    binaryName: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    installPackage: '@anthropic-ai/claude-code',
    checkPaths: (home) => [
      `${home}/.npm-global/bin/claude`,
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      `${home}/.local/bin/claude`
    ],
    models: [
      { id: 'opus', name: 'Opus 4.6', desc: 'Most intelligent', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      { id: 'sonnet', name: 'Sonnet 4.6', desc: 'Speed + intelligence', color: 'text-[#cc785c]', bg: 'bg-[#cc785c]/10' },
      { id: 'haiku', name: 'Haiku 4.5', desc: 'Fastest', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
    ],
    defaultModel: 'sonnet',
    modelCommand: '/model',
    hasPlanMode: true,
    configDir: '.claude',
    promptChar: /❯[\s\x00-\x1f]*$/m,
    workingPatterns: [
      /\.\.\.\s*$/m,
      /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/m,
      /^\s*(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\b/im,
      /\[(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\]/i,
      /Tool:|Read\(|Write\(|Edit\(|Bash\(|Task\(|Glob\(|Grep\(|WebFetch\(|WebSearch\(|Agent\(|Skill\(/i,
      /✓.*modules? transformed/i,
      // Claude-specific streaming output structure
      /⎿\s|├\s|│\s/,
      // Claude thinking/tool execution
      /Thinking\.\.\.|Searching\.\.\.|Reading\.\.\./i,
    ],
    waitingPatterns: [
      /❯[\s\x00-\x1f]*$/m,
      />\s*$/m,
      /\(y\/n\)\s*$/im,
      /\[Y\/n\]\s*$/im,
      /\[y\/N\]\s*$/im,
      /What would you like|How can I help|anything else|Do you want to/i,
      /Press Enter to continue/i,
      /\? \(Y\/n\)/i,
      /✓ built in \d+/i,
      // Claude-specific permission prompts
      /Allow|Deny|Skip/,
      /Trust this project/i,
    ]
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    binaryName: 'codex',
    installCommand: 'npm install -g @openai/codex',
    installPackage: '@openai/codex',
    checkPaths: (home) => [
      `${home}/.npm-global/bin/codex`,
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
      `${home}/.local/bin/codex`
    ],
    models: [
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', desc: 'Most capable', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
      { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Spark', desc: 'Fast real-time', color: 'text-[#cc785c]', bg: 'bg-[#cc785c]/10' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', desc: 'Previous gen', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Max', desc: 'Long-horizon', color: 'text-blue-400', bg: 'bg-blue-500/10' }
    ],
    defaultModel: 'gpt-5.3-codex',
    modelCommand: '/model',
    hasPlanMode: false,
    configDir: '.codex',
    promptChar: />\s*$/m,
    workingPatterns: [
      /\.\.\.\s*$/m,
      /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/m,
      /^\s*(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\b/im,
      /\[(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\]/i,
    ],
    waitingPatterns: [
      />\s*$/m,
      /\(y\/n\)\s*$/im,
      /\[Y\/n\]\s*$/im,
      /\[y\/N\]\s*$/im,
      /What would you like|How can I help|anything else|Do you want to/i,
      /Press Enter to continue/i
    ]
  }
}

export function getProviderConfig(provider: CLIProvider): CLIProviderConfig {
  return CLI_PROVIDERS[provider]
}
