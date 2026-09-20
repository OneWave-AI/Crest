# Crest V3 — Build Plan

**Goal:** close the gap to Hive (MIT, `github.com/morapelker/hive`, clone at `/tmp/hive-src`), repaint the app, and ship V3.

Current: v2.5.0, 51k lines TS/TSX, 18 IPC modules, 126 source files.
Target: v3.0.0.

---

## Phase 0 — Clean the decks (1 day)

Nothing new. Just stop bleeding.

### 0.1 Land the in-flight work
24 modified files sit uncommitted on `main`, including an untracked `src/renderer/components/rail/` (AgentRail + useAcpRail + useChatRail) and a deleted `AcpPlanPanel.tsx`. That's a whole feature half-landed on the default branch.

- Branch it: `git checkout -b feat/agent-rail`, commit, PR, merge.
- `index.js` at repo root is untracked junk — delete or gitignore.

### 0.2 Purge purple
`--accent-purple: #a855f7` is defined in `globals.css` and referenced across 20+ components. Against house rules.

Worst offenders: `HistoryBrowser.tsx` (19), `SettingsPanel.tsx` (16), `SkillsManager.tsx` (15), `MemoryPanelNatural.tsx` (15), `MemoryPanel.tsx` (15), `SuperAgentSettings.tsx` (11), `AnalyticsScreen.tsx` (9), `Toolbelt.tsx` (8).

Replace with the second accent chosen in Phase 1.1. One pass, mechanical.

### 0.3 Purge emoji
Shipped emoji in `hives.ts` (swarm prompts), `HiveManager.tsx`, `Header.tsx`, `Toolbelt.tsx`, `providers.ts`, `errorLogger.ts`. Swap to Lucide icons (already a dependency).

### 0.4 Fix the pricing table
`conversations.ts:839` `MODEL_PRICING` knows only Claude 3.5 / 4 era models. No Opus 5, Sonnet 5, Haiku 4.5, Fable 5.1. Every cost number in the Analytics dashboard is currently wrong for anything you actually run.

Fix: replace the hardcoded map with a `pricing.ts` module keyed on real model ids, and default-case to Sonnet pricing with a visible "unknown model" flag instead of silently guessing.

### 0.5 Auto-update
Crest has no `electron-updater`. Every release is a cold DMG download. Add `electron-updater` + `app-update.yml` + a GitHub Releases feed. Hive's `src/main/services/updater.ts` and `updater-events.ts` are a 200-line drop-in.

**Done when:** clean `git status`, zero purple, zero emoji, correct costs, app self-updates.

---

## Phase 1 — Fresh paint (3–4 days)

Crest looks like V1 with Tailwind on top. `tailwind.config.js` has exactly two color scales and one font. Everything else is inline hex scattered through components.

### 1.1 Real design system
Build `src/renderer/styles/tokens.css` as the single source of truth:

- **Ground:** near-black surfaces already work (`#1a1a1a` / `#242424` / `#2a2a2a`). Keep the ladder, name it properly (`surface-0` … `surface-3`).
- **Primary accent:** keep the terracotta `#cc785c` — it's distinctive and it isn't anyone else's.
- **Second accent:** replace purple. Pick one: warm sand `#c2a87e` (ties to OneWave) or a cool slate-blue for state/info. One accent as a rule, second only for state.
- **Type:** Inter is fine but everyone uses it. Consider Geist (what Hive ships) or keep Inter and earn distinction through scale and weight instead. JetBrains Mono stays for terminal.
- Flat editorial, not glass/glow/gradient-border. Solid fills, 2px corners, hierarchy from type not from shadows.

Push all of it into `tailwind.config.js` so components stop carrying inline hex.

### 1.2 Themes
Hive ships 10 themes (6 dark, 4 light) and follows system. Crest is dark-only, one theme.
Steal the shape from `hive-src/src/renderer/src/lib/themes/`. Ship 3 dark + 1 light at minimum. Tokens from 1.1 make this nearly free.

### 1.3 Re-lay the main surfaces
In priority order, because these are what a new user sees:
1. `HomeScreen.tsx` — the action grid is the first impression
2. `layout/Header.tsx` + `layout/Sidebar.tsx` — the frame everything lives in
3. `analytics/AnalyticsScreen.tsx` (1250 lines) — the screenshot that sells the app
4. `settings/SettingsPanel.tsx` — currently a purple-speckled wall of toggles

### 1.4 Motion pass
`animations.css` has the keyframes; usage is inconsistent. Establish: motion on interaction only, never on load (load-entrance motion strands at keyframe 0 in hidden tabs and screenshots). Framer Motion is already in deps — use it for layout transitions, CSS for micro-interactions.

**Done when:** new screenshots for the README that look like a 2026 product.

---

## Phase 2 — Foundation (1.5 weeks)

The architectural steals. Do these before the flashy features — everything downstream gets more reliable.

### 2.1 Claude Code hook server
**Steal:** `hive-src/src/main/services/claude-hook-server.ts`, `cli-hook-hold-core.ts`, `cli-hook-transport-router.ts`, `claude-cli-plan-auto-approve.ts`

Today Crest infers agent state from what the user typed (`terminal.ts:104` sets `isClaudeRunning` when it sees the command) and polls a todo file every 2s (`TerminalWrapper.tsx:354`). Hive registers real Claude Code hooks and *holds* the CLI at permission boundaries, so approvals, plan mode, and tool calls arrive as structured events.

This is the keystone. Discord approval, kanban auto-advance, and accurate status all depend on it.

New: `src/main/services/hookServer.ts`, `src/main/ipc/hooks.ts`.

### 2.2 Transcript + subagent tracking
**Steal:** `claude-transcript-reader.ts`, `claude-session-watcher.ts`, `claude-cli-subagent-tracker.ts`

`conversations.ts` already reads `~/.claude/projects/*.jsonl` but explicitly **skips `agent-*.jsonl`** (lines 217, 472, 547, 715) — so every subagent Crest spawns via Hives/SuperAgent/Teams is invisible in its own history. For an app whose pitch is multi-agent swarms, that's the wrong file to skip.

Fix: parse subagent logs, build the session tree, surface it in `TaskTimeline.tsx` and `TeamsPanel.tsx`. Watch with chokidar instead of polling.

### 2.3 Git worktrees
**Steal:** `worktree-ops.ts` (28k), `worktree-watcher.ts`, `branch-watcher.ts`, `breed-names.ts`

Crest has no worktree support — `git.ts` mentions `--worktree` once, for `git restore`. Meanwhile the whole product is "run agents in parallel." Right now parallel agents share one working tree and can stomp each other.

Add: create/list/archive worktrees, one per agent session, memorable auto-names. This is the feature that makes the swarm pitch true instead of aspirational.

New: `src/main/ipc/worktrees.ts`, `src/renderer/components/worktrees/`.

**Done when:** two agents run on the same repo simultaneously and provably cannot touch each other's files.

---

## Phase 3 — Remote control (1 week)

The demo-able one. This is what makes people install it.

### 3.1 Discord bridge
**Steal:** `discord-service.ts` (48k), `discord-session-bridge.ts` (77k), `claude-cli-discord-bridge.ts`, `discord-pr-creator.ts`, `discord-push.ts`, `interactive-reply-router.ts`

Agent posts to a channel, you reply from your phone, approvals come back through the hook server from 2.1. Open PRs from Discord.

### 3.2 Telegram bridge
**Steal:** `telegram-forwarding-service.ts` (44k)
Same transport router, second surface. Cheap once Discord works.

### 3.3 Notifications + wake lock
**Steal:** `notification-service.ts`, `power-save-blocker.ts`, `sleep-now.ts`
Native notification on completion or when input is needed; keep the Mac awake through long runs. Small, high daily value.

**Done when:** you can start a task at the desk, leave, and finish it from your phone.

---

## Phase 4 — Workflow (1 week)

### 4.1 Markdown-backed Kanban
**Steal:** `kanban-backend.ts` (84k), `markdown-kanban-watcher.ts`, `kanban-markdown-paths.ts`, and read `hive-src/PRD_kanban-board.md` — it's a complete spec.

Drag a ticket to In Progress → worktree picker → session spawns with the ticket as context → auto-advances to Review on completion. Tickets persist as markdown in the repo, so they survive the app.

### 4.2 Multi-account OAuth
**Steal:** `oauth-anthropic.ts`, `oauth-openai.ts`, `oauth-pkce.ts`, `account-store-claude.ts`, `account-store-codex.ts`, `account-lock.ts`, `keychain.ts`

Sign in with several accounts, fail over on rate limit. Directly sellable to the team.

### 4.3 Real diffs
`git/DiffPanel.tsx` is homegrown. Add `diff2html` + Monaco diff (`@monaco-editor/react`). Hive's `src/renderer/src/components/diff/` is the reference.

### 4.4 Assorted small steals
- `setup-script-suggester.ts` — auto-detect how to run a project
- `pr-content-generator.ts` + `gitlab-cli.ts` + `git-forge-remote.ts` — better PR flow, GitLab support
- `deep-link-service.ts` — `crest://` URLs
- `language-detector.ts` / `project-icons.ts` — polish

---

## Phase 5 — Third-party (2–3 days)

- **[ccusage](https://github.com/ccusage/ccusage)** — battle-tested local cost parsing. Back `AnalyticsScreen.tsx` with it instead of maintaining our own pricing math (supersedes the 0.4 patch if we go all-in).
- **[OpenCode](https://opencode.ai)** — third runtime via `@opencode-ai/sdk`. Crest only references it in `shared/acp.ts`. Real support is a small wire-up and a README line that matters.
- **Ghostty** (`libghostty`) — native GPU terminal to replace xterm.js. Hive has it optional behind a node-gyp addon. Nice-to-have, not urgent.

---

## Phase 6 — The big refactor (optional, 1.5+ weeks)

Hive runs an Effect HTTP/RPC + WebSocket server on a free localhost port; the renderer is a plain web client and Electron IPC only handles window chrome. That's why they can ship `renderer-web` and a Dockerfile — the same app runs headless in a container and opens in a browser.

Crest is IPC-coupled end to end. Decoupling unlocks Crest-in-the-browser and Crest-on-mobile. Reference: `hive-src/PLAN_MIGRATE_IPC_TO_HTTP.md` — they wrote the migration plan down.

Don't start this until Phases 0–4 ship.

---

## Sequencing

| Phase | Effort | Ship |
|---|---|---|
| 0 — Clean decks | 1 day | immediately |
| 1 — Fresh paint | 3–4 days | v2.6 |
| 2 — Foundation | 1.5 weeks | v2.7 |
| 3 — Remote control | 1 week | **v3.0** |
| 4 — Workflow | 1 week | v3.1 |
| 5 — Third-party | 2–3 days | v3.1 |
| 6 — Server refactor | 1.5 weeks+ | v4.0 |

Roughly five weeks to v3.0 solo. Phases 0 and 1 are parallelizable against 2.

## Licensing

Hive is MIT © morapelker. Crest is MIT. Copying is permitted with attribution — add a `NOTICE` file crediting Hive for the lifted modules, and note it in `CHANGELOG.md`. Do it properly; the repo is public and people will diff it.
