# Changelog

All notable changes to Crest are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Local mode works on a fresh install.** The `<agent>-local` launchers were
  shell functions in one developer's `~/.zshrc`, so everywhere else picking
  Local was "command not found". Crest now writes them to `~/.crest/bin` on
  every launch (plain POSIX sh, no python), calls them by absolute path, quotes
  the model name, and honours `OLLAMA_HOST`. Local is disabled on Windows.

### Added
- **Themes.** Four: Crest (the existing black), Slate (cool dark), Ember
  (warm dark) and Paper (light). Pick one under Settings -> Appearance; it is
  separate from the terminal theme, so the terminal can be Dracula while the
  window around it is Paper. Switching is a single attribute write on the
  document root -- no component knows a theme exists.
- A token layer behind those themes: `--c-surface-*`, `--c-ink-*` and
  `--c-overlay` channel variables in `globals.css`, surfaced as Tailwind
  colours. A theme is a block of variable overrides and nothing else.
- Self-update against GitHub Releases (`electron-updater`). Crest ships
  unsigned, and macOS refuses an in-place swap of an unsigned bundle, so the
  updater currently detects the release and opens the download page rather
  than pretending to install; the real download/install path is behind one
  flag, ready for when signing lands.
- `src/shared/pricing.ts` -- current per-model rates with a confidence signal
  on every lookup (`exact`, `tier`, `unknown`).
- `sand`, a full 100-900 accent ramp in `tailwind.config.js`.

### Fixed
- **The app's most-used text colour failed WCAG AA.** `text-gray-500` carried
  body text at 503 sites and measured 4.02:1 against the panel ground, under
  the 4.5:1 floor; the next rung down was 2.57:1. The ink ladder now clears AA
  for body text and AA-large for de-emphasised text, and the light theme
  tracks the dark one within 0.01 at every rung.
- **Opus sessions were costed at 3x.** The pricing resolver mapped any model
  containing "opus" to Opus 4 rates ($15/$75); Opus 5, 4.8, 4.7, 4.6 and 4.5
  all bill $5/$25. Anything that was neither Opus nor Haiku fell through to
  Sonnet 4 ($3/$15) regardless of what ran. Model ids now resolve by longest
  prefix, so dated snapshots match, and an unrecognised future model falls
  back to the *current* generation's tier instead of three-year-old rates.

### Changed
- Every colour in the renderer now resolves through a token. What was 699
  arbitrary hex classes, 743 `white/[0.0x]` tints, 331 `white/N` tints and
  1,148 hardcoded Tailwind greys is zero of each. The 76 remaining
  `text-white` all sit on filled saturated chips, where white is correct in
  every theme.
- Retired purple (`#a855f7`) as the second accent -- it was defined in
  `globals.css` and reached 20+ components as loose Tailwind classes.
  Replaced by `sand` (#c2a87e), declared once in the Tailwind config.
- Crest no longer emits emoji in any string it produces -- swarm prompts,
  the Toolbelt skill request, and console severity markers are text now. The
  emoji remaining in `providers.ts` are regex literals matching the CLI's own
  output and are commented as such.

## [2.5.0] – 2026-08-05

### Added
- **Context rail in chat mode** — a right-hand rail showing the agent's task
  list, working folders (cwd, recents, git branch, files touched this session),
  connectors (MCP servers with inline toggles, installed skills), permission
  posture and a running log of decisions made. Collapsible with `Cmd+Shift+B`.
  The rail is presentational with a per-mode adapter, so ACP sessions render the
  same surface; it replaces the plan-only panel that ACP mode had.
- `terminal-get-buffer-delta` — an offset-based incremental read of a terminal's
  output that reports how much scrolled away unread.

### Fixed
- **Chat mode could not run gated tools at all.** No `--permission-mode` was
  passed, so the CLI refused every write and the in-chat Allow/Deny prompt could
  never resolve it: print mode emits no permission request, and the reply was
  written to a stdin that had already been closed. Permission is now chosen up
  front (`--permission-mode`, `--allowedTools`, `--disallowedTools`, `--add-dir`)
  and surfaced in the rail; the dead prompt is gone.
- **Every assistant reply rendered twice** — `--include-partial-messages` streams
  deltas *and* the completed message, and both were appended.
- **Failed tools looked successful.** `tool_result` events were not handled, so a
  refused write showed as a completed tool call. Rows now stay pending until
  their result arrives and report the refusal reason.
- Tool calls in one message overwrote each other in the rail's derived state, and
  batched flushes could revert appended messages — including the explanation of a
  blocked tool.
- `HybridChatView` stopped updating once a terminal exceeded its 50 KB ring
  buffer, because it diffed by buffer length.
- ACP: requests had no deadline (a silent agent hung "starting" forever),
  unbounded stdout buffering, a discarded partial line corrupting the *next*
  message, and `SIGTERM` never escalating to `SIGKILL` for a process that traps it.
- Chat stream events are delivered to the window that owns the session.

### Changed
- ACP bridges point at the maintained packages
  (`@agentclientprotocol/claude-agent-acp`, `@agentclientprotocol/codex-acp`);
  an already-installed older binary is still preferred over an `npx` download.

## [2.4.0] – 2026-07-29

### Added
- **Mixed-agent swarms** — the provider now travels with the terminal
  (`tab.cliProvider`), so an Orchestrator can supervise a swarm running Claude
  Code in one panel and Codex, Kimi or Gemini in the next. Busy-idle detection,
  fast-path approvals and completion detection each read the provider of the
  terminal they are supervising instead of one app-level default.
- **Gemini CLI** as a fourth CLI provider, verified against the installed
  CLI 0.23.0 — correct `-preview` model ids and TUI patterns matched to
  Gemini's actual `ToolInfo` rendering.
- **Local runtimes** for Codex (`--oss --local-provider ollama`) and Kimi
  (isolated `KIMI_CODE_HOME`, so cloud config in `~/.kimi-code` is untouched),
  plus an ACP agent view.
- **Preview pane** (`PreviewPane`) that closes the loop: console-message,
  `did-fail-load` and injected `onerror` / `unhandledrejection` capture, an
  error/warning counter with a console drawer, send-one-or-all errors to the
  running session, screenshot-to-session, and its own session partition.
- **Per-hunk diff review** (`DiffPanel`, from the git menu) with diff summary,
  per-file diffs, patch apply, and stage/unstage.
- **HyperFrames starter skills**, auto-installed on first launch — `hyperframes`
  (core composition), `hyperframes-cli`, `website-to-hyperframes`, and
  `hyperframes-media` (Kokoro TTS, Whisper captions, background removal).
- Dependabot config, `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.
- Crest launch video embedded on the website.

### Changed
- Every registered agent is now reachable from the new-tab menu, which renders
  from `CLI_PROVIDERS` instead of hardcoding Claude Code and Codex — Kimi and
  Gemini previously required changing the global default in Settings.
- Each provider carries its own accent classes, so tab chrome no longer paints
  every non-Codex agent in Claude's colour.
- `CLAUDE_LOCAL_MODEL` renamed to `CREST_LOCAL_MODEL`, now that it feeds more
  than one agent.
- Upgraded to Electron 42 for the latest upstream platform updates
- Bumped `electron-vite` to 5.x and `electron-builder` to 26.x to match
- Added a Content Security Policy on renderer responses
- Removed an unused spreadsheet dependency (`xlsx`)
- Cleaned up illustrative comments that referenced a local home path

## [2.3.1] – 2026-04-07

### Added
- Direct DMG downloads from the website (replaces ad-hoc hosting)
- Automated release workflow via GitHub Actions

### Fixed
- Sleep/wake restores terminal sessions instead of bouncing to the home screen
- Chat prompt is passed as a positional argument (resolves a stdin formatting regression)
- Chat permissions and streaming performance improvements
- CI build: install `setuptools` so `node-gyp` can compile `node-pty`

## [2.3.0]

### Added
- **Orchestrator agent** with five production improvements
- Activity timeline with live action tracking from terminal output
- Floating labels on the website screenshot showcase

### Changed
- **Renamed to Crest** (new wave-crest logo, rewritten landing page)
- Dashboard polished to a more refined aesthetic
- Landing page redesigned with new copy and an emerald accent
- Terminal wrapper UI cleaned up

### Fixed
- Chat mode: strip nested Claude env vars, drop verbose flag, better spawn error handling
- Super Agent terminal reading: comprehensive ANSI stripping and tighter detection
- Skill/agent detection works for new users and existing CLI users
- Memory leak that caused excessive RAM growth during long sessions
- Repository Visualization hanging on large codebases

## [2.2.0]

### Added
- Five major features: Voice input, Usage view, Memory UI, Prompt Queue, Repository Visualization
- Natural-language Memory UI
- Hive Management screen (now accessible from home)
- Screenshot gallery on the website
- Linux/Chromebook download buttons + setup instructions
- Analytics dashboard, plan panel

### Changed
- Website redesigned with sub-pages and a more premium UI
- macOS-only positioning (Windows/Linux mentions removed pending native builds)
- Project earlier carried the names *ClaudeCodeUI*, *ClaudeCode Arena*, and *Claude Code Unleashed* before settling on Crest. Older commits reflect those names.

### Fixed
- Analytics charts not populating due to a timezone mismatch
- Swarm prompts now produce consistent terminal input

## [2.1.0]

### Added
- Hive Management
- Improved file handling
- Side-by-side view for Super Agent history

[Unreleased]: https://github.com/OneWave-AI/Crest/compare/v2.4.0...HEAD
[2.4.0]: https://github.com/OneWave-AI/Crest/releases/tag/v2.4.0
[2.3.1]: https://github.com/OneWave-AI/Crest/releases/tag/v2.3.1
[2.3.0]: https://github.com/OneWave-AI/Crest/releases/tag/v2.3.0
[2.2.0]: https://github.com/OneWave-AI/Crest/releases/tag/v2.2.0
