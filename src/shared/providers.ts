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
    // Codex has native OSS-provider support (--oss --local-provider ollama).
    // `codex-local` also forces model_reasoning_effort=none, because qwen3-coder
    // 400s on thinking requests.
    supportsLocal: true,
    localCommand: 'codex-local',
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
    // Kimi needs an isolated KIMI_CODE_HOME for local runs: thinking is a global
    // setting and must be off for local models. `kimi-local` regenerates that
    // config per run so cloud Kimi in ~/.kimi-code is never modified.
    supportsLocal: true,
    localCommand: 'kimi-local',
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
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    binaryName: 'gemini',
    installCommand: 'npm install -g @google/gemini-cli',
    installPackage: '@google/gemini-cli',
    checkPaths: (home) => [
      `${home}/.npm-global/bin/gemini`,
      '/usr/local/bin/gemini',
      '/opt/homebrew/bin/gemini',
      `${home}/.local/bin/gemini`
    ],
    models: [
      // These ids must stay inside the CLI's own VALID_GEMINI_MODELS allowlist
      // (gemini-cli-core/dist/src/config/models.js) -- anything else is
      // rejected. Note the Gemini 3 ids carry a mandatory -preview suffix.
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', desc: 'Most capable', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Fast', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Previous gen', color: 'text-[#cc785c]', bg: 'bg-[#cc785c]/10' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Cheapest', color: 'text-amber-400', bg: 'bg-amber-500/10' }
    ],
    // The CLI's own DEFAULT_GEMINI_MODEL as of 0.23.0. Gemini 3 ids are
    // recognised but gated on account access, so defaulting to them would fail
    // for some users at launch rather than in the picker.
    defaultModel: 'gemini-2.5-pro',
    // Gemini's /model takes no argument -- it opens a picker dialog -- so the
    // in-session switcher stays disabled rather than typing a broken command.
    modelCommand: '',
    hasPlanMode: false,
    // No local runtime: Gemini CLI has no OSS-provider flag and no
    // Anthropic/OpenAI-compatible base-url override, so there is nothing for a
    // `gemini-local` wrapper to set. Cloud only until that changes upstream.
    // Gemini is the first provider to exercise localUnavailableReason -- without
    // it the disabled toggle renders an empty explanation.
    supportsLocal: false,
    localUnavailableReason: 'Gemini CLI has no local-model option -- it always talks to Google.',
    configDir: '.gemini',
    // Gemini's Ink input renders a literal '> ' (ui/components/InputPrompt.js).
    promptChar: />\s*$/m,
    workingPatterns: [
      /\.\.\.\s*$/m,
      // Model streaming uses ink-spinner 'dots' (the default in
      // GeminiRespondingSpinner), i.e. the braille frames.
      /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/m,
      // A tool mid-execution renders the 'toggle' spinner or the static
      // TOOL_STATUS.EXECUTING glyph -- both from this pair (ui/constants.js).
      // Deliberately NOT matching tool *names*: Gemini renders them as
      // "ReadFile some/path" with no parens, and a finished call's name stays
      // on screen, so keying off the name would pin the terminal to "working"
      // forever after the first tool call.
      /[⊶⊷]/m,
      /^\s*(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\b/im,
      /\[(?:thinking|analyzing|searching|reading|writing|running|executing|loading|processing|building|compiling|installing|fetching|creating|updating|downloading)\]/i
    ],
    waitingPatterns: [
      />\s*$/m,
      /\(y\/n\)\s*$/im,
      /\[Y\/n\]\s*$/im,
      /\[y\/N\]\s*$/im,
      /What would you like|How can I help|anything else|Do you want to/i,
      /Press Enter to continue/i,
      // Real labels from ui/components/messages/ToolConfirmationMessage.js.
      // "Do you want to proceed?" is already caught by the generic line above.
      /Allow once|Allow for this session|Allow for all future sessions/i,
      /Allow tool for (?:this session|all future sessions)/i,
      /Allow all server tools for this session/i,
      /No, suggest changes/i
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
  return localModel ? `CREST_LOCAL_MODEL=${localModel} ${command}` : command
}
