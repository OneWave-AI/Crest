import type { CLIProvider, CLIProviderConfig, ModelRuntime } from './types'

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
    // ollama serves an Anthropic-compatible /v1/messages, so the real claude
    // binary drives a local model unmodified. `claude-local` (zsh function in
    // ~/.zshrc) sets ANTHROPIC_BASE_URL/MODEL and execs claude.
    supportsLocal: true,
    localCommand: 'claude-local',
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
    // Codex reaches local models through a [model_providers.*] block in
    // ~/.codex/config.toml rather than env vars. Not verified working yet, so
    // the toggle stays disabled instead of failing at launch.
    supportsLocal: false,
    localUnavailableReason: 'Codex needs a model_providers entry in ~/.codex/config.toml -- not configured yet',
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
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi Code',
    binaryName: 'kimi',
    // Kimi ships a native binary via its own installer, not npm. We do not pipe
    // an unverified URL into a shell, so the install action just points at the
    // docs; checkPaths finds an existing install.
    installCommand: 'echo "Install Kimi Code CLI from https://kimi.com/code"',
    installPackage: '',
    checkPaths: (home) => [
      `${home}/.kimi-code/bin/kimi`,
      '/usr/local/bin/kimi',
      '/opt/homebrew/bin/kimi',
      `${home}/.local/bin/kimi`
    ],
    models: [
      { id: 'kimi-code/k3', name: 'K3', desc: 'Default', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { id: 'kimi-code/k3-256k', name: 'K3 256k', desc: 'Long context', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
      { id: 'kimi-code/kimi-for-coding', name: 'K2.7 Coding', desc: 'Coding tuned', color: 'text-[#cc785c]', bg: 'bg-[#cc785c]/10' },
      { id: 'kimi-code/kimi-for-coding-highspeed', name: 'K2.7 Highspeed', desc: 'Fastest', color: 'text-amber-400', bg: 'bg-amber-500/10' }
    ],
    defaultModel: 'kimi-code/k3',
    // Kimi selects models with -m/--model at launch, not a slash command.
    modelCommand: '',
    hasPlanMode: true,
    // Local would need an extra [providers.ollama] + [models."..."] pair in
    // ~/.kimi-code/config.toml. The provider `type` enum is undocumented here,
    // so this stays off rather than shipping a combo that fails at launch.
    supportsLocal: false,
    localUnavailableReason: 'Kimi needs an ollama provider block in ~/.kimi-code/config.toml -- not configured yet',
    configDir: '.kimi-code',
    promptChar: />\s*$/m,
    // NOTE: tuned by eye against Kimi's TUI, not exhaustively verified. If
    // busy/idle detection misreads, these are the patterns to fix.
    workingPatterns: [
      /\.\.\.\s*$/m,
      /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/m,
      /^\s*(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\b/im,
      /\[(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\]/i
    ],
    waitingPatterns: [
      />\s*$/m,
      /❯[\s\x00-\x1f]*$/m,
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

/** True when this agent can actually be run against a local ollama model. */
export function supportsLocalRuntime(provider: CLIProvider): boolean {
  const config = CLI_PROVIDERS[provider]
  return config.supportsLocal && Boolean(config.localCommand)
}

/**
 * The single place the agent axis and the runtime axis combine into one shell
 * command. Terminals type this into a login shell, so `localCommand` may be a
 * shell function and the model is passed as a leading env assignment.
 *
 * Falls back to the API binary whenever local is requested but unsupported, so
 * a stale persisted setting can never launch a broken command.
 */
export function resolveLaunchCommand(
  provider: CLIProvider,
  runtime: ModelRuntime = 'api',
  localModel?: string
): string {
  const config = CLI_PROVIDERS[provider]
  if (runtime !== 'local' || !supportsLocalRuntime(provider)) return config.binaryName
  const command = config.localCommand as string
  return localModel ? `CLAUDE_LOCAL_MODEL=${localModel} ${command}` : command
}
