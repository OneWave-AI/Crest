/**
 * AgentRail — the right-hand context rail for an agent session.
 *
 * Four things the transcript can't show well: what the agent is working through
 * (tasks), where it is working (folders + files it has touched), what it can
 * reach (connectors), and what was decided along the way (permission posture,
 * blocked tools, switches). Fed by a per-mode adapter; see railTypes.ts.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  CaretDown, CaretRight, CheckCircle, Circle, CirclesThreePlus, FolderOpen, GitBranch,
  ListChecks, PencilSimple, Plugs, ShieldWarning, SpinnerGap, FileText,
  ArrowsClockwise, Prohibit, Gear,
} from '@phosphor-icons/react'
import type { MCPServer, Skill, GitStatus } from '@shared/types'
import { useAppStore } from '../../store'
import { useChatColors } from '../chat/chatTheme'
import type { RailData, RailDecision, RailFile, RailTask } from './railTypes'

type Colors = ReturnType<typeof useChatColors>

const MODE_BLURB: Record<string, string> = {
  acceptEdits: 'File edits run without asking. Risky commands still stop.',
  auto: 'The agent decides, within its own safety rules.',
  bypassPermissions: 'Nothing is gated. Only for throwaway directories.',
  manual: 'Every gated tool is refused — headless sessions cannot ask.',
  dontAsk: 'No prompts; allowed tools run, the rest are refused.',
  plan: 'Read-only. The agent plans but changes nothing.',
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function relativeTime(ts: number): string {
  const secs = Math.round((Date.now() - ts) / 1000)
  if (secs < 60) return `${Math.max(secs, 1)}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  return `${Math.round(secs / 3600)}h ago`
}

// --- Section chrome -------------------------------------------------------------

function Section({
  title, icon, count, colors, defaultOpen = true, action, children,
}: {
  title: string
  icon: React.ReactNode
  count?: number | string
  colors: Colors
  defaultOpen?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${colors.containerBorder}` }}>
      <div className="flex items-center gap-1.5 px-3 h-9">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <CaretDown
            size={10}
            className="flex-shrink-0 transition-transform"
            style={{ color: colors.textMuted, transform: open ? 'none' : 'rotate(-90deg)' }}
          />
          <span className="flex-shrink-0" style={{ color: colors.textTertiary }}>{icon}</span>
          <span
            className="text-[11px] font-medium uppercase tracking-wide truncate"
            style={{ color: colors.textSecondary }}
          >
            {title}
          </span>
          {count !== undefined && count !== 0 && (
            <span className="text-[10px] tabular-nums" style={{ color: colors.textMuted }}>{count}</span>
          )}
        </button>
        {action}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function Empty({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return <p className="text-[11px] leading-[1.5]" style={{ color: colors.textMuted }}>{children}</p>
}

// --- Tasks ----------------------------------------------------------------------

function TaskList({ tasks, colors }: { tasks: RailTask[]; colors: Colors }) {
  if (tasks.length === 0) {
    return <Empty colors={colors}>No task list yet. It appears when the agent plans its work.</Empty>
  }

  return (
    <ul className="space-y-1.5">
      {tasks.map((task, i) => {
        const done = task.status === 'completed'
        const active = task.status === 'in_progress'
        return (
          <li key={`${i}-${task.content}`} className="flex items-start gap-1.5">
            <span className="flex-shrink-0 mt-[2px]">
              {done ? (
                <CheckCircle size={12} weight="fill" style={{ color: colors.statusComplete }} />
              ) : active ? (
                <SpinnerGap size={12} className="animate-spin" style={{ color: colors.accent }} />
              ) : (
                <Circle size={12} style={{ color: colors.textMuted }} />
              )}
            </span>
            <span
              className="text-[11.5px] leading-[1.45]"
              style={{
                color: done ? colors.textMuted : active ? colors.textPrimary : colors.textSecondary,
                textDecoration: done ? 'line-through' : 'none',
              }}
            >
              {active && task.activeForm ? task.activeForm : task.content}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// --- Working folders ------------------------------------------------------------

function FoldersSection({ colors, files }: { colors: Colors; files: RailFile[] }) {
  const { cwd, setCwd } = useAppStore()
  const [recents, setRecents] = useState<string[]>([])
  const [git, setGit] = useState<GitStatus | null>(null)

  const loadRecents = useCallback(() => {
    window.api.listConversations()
      .then((conversations) => {
        const seen: string[] = []
        for (const c of conversations ?? []) {
          if (c.projectFolder && !seen.includes(c.projectFolder)) seen.push(c.projectFolder)
          if (seen.length >= 8) break
        }
        setRecents(seen)
      })
      .catch(() => setRecents([]))
  }, [])

  useEffect(() => { loadRecents() }, [loadRecents])

  useEffect(() => {
    window.api.gitStatus().then(setGit).catch(() => setGit(null))
  }, [cwd])

  const switchTo = useCallback(async (folder: string) => {
    setCwd(folder)
    await window.api.setCwd(folder)
  }, [setCwd])

  const pick = useCallback(async () => {
    const folder = await window.api.selectFolder()
    if (folder) await switchTo(folder)
  }, [switchTo])

  return (
    <>
      <button
        onClick={pick}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-1.5 text-left transition-colors"
        style={{ background: colors.surfacePrimary, border: `1px solid ${colors.toolBorder}` }}
        title={cwd}
      >
        <FolderOpen size={12} weight="fill" style={{ color: colors.accent }} className="flex-shrink-0" />
        <span className="text-[11.5px] truncate flex-1" style={{ color: colors.textPrimary }}>
          {basename(cwd) || 'Choose a folder'}
        </span>
      </button>

      {git?.branch && (
        <div className="flex items-center gap-1.5 px-2 mb-2">
          <GitBranch size={11} style={{ color: colors.textTertiary }} />
          <span className="text-[11px] truncate" style={{ color: colors.textTertiary }}>{git.branch}</span>
          {git.dirty && (
            <span className="text-[10px] tabular-nums" style={{ color: colors.accent }}>
              {git.staged + git.unstaged + git.untracked} changed
            </span>
          )}
        </div>
      )}

      {recents.filter((r) => r !== cwd).length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wide px-2 mb-1" style={{ color: colors.textMuted }}>
            Recent
          </p>
          {recents.filter((r) => r !== cwd).slice(0, 5).map((folder) => (
            <button
              key={folder}
              onClick={() => switchTo(folder)}
              className="w-full text-left px-2 py-1 rounded text-[11px] truncate transition-colors hover:opacity-100"
              style={{ color: colors.textTertiary }}
              title={folder}
            >
              {basename(folder)}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wide px-2 mb-1" style={{ color: colors.textMuted }}>
          Touched this session
        </p>
        {files.length === 0 ? (
          <Empty colors={colors}>Nothing yet.</Empty>
        ) : (
          <ul className="space-y-0.5">
            {files.slice(0, 12).map((file) => (
              <li key={file.path} className="flex items-center gap-1.5 px-2 py-[3px]" title={file.path}>
                {file.action === 'read' ? (
                  <FileText size={11} style={{ color: colors.textMuted }} className="flex-shrink-0" />
                ) : (
                  <PencilSimple size={11} style={{ color: colors.accent }} className="flex-shrink-0" />
                )}
                <span className="text-[11px] truncate flex-1" style={{ color: colors.textTertiary }}>
                  {basename(file.path)}
                </span>
                {file.count > 1 && (
                  <span className="text-[10px] tabular-nums" style={{ color: colors.textMuted }}>×{file.count}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

// --- Connectors ------------------------------------------------------------------

function ConnectorsSection({ colors, note }: { colors: Colors; note?: string }) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    window.api.mcpList().then((list) => setServers(list ?? [])).catch(() => setServers([]))
    window.api.listSkills().then((list) => setSkills(list ?? [])).catch(() => setSkills([]))
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = useCallback(async (server: MCPServer) => {
    setBusy(server.name)
    try {
      await window.api.mcpToggle(server.name, !server.enabled)
      load()
    } finally {
      setBusy(null)
    }
  }, [load])

  return (
    <>
      {note && (
        <p className="text-[10.5px] leading-[1.45] mb-2 px-2 py-1.5 rounded" style={{ color: colors.textMuted, background: colors.surfaceHover }}>
          {note}
        </p>
      )}

      {servers.length === 0 ? (
        <Empty colors={colors}>No MCP servers configured.</Empty>
      ) : (
        <ul className="space-y-0.5 mb-2">
          {servers.map((server) => (
            <li key={server.name} className="flex items-center gap-1.5">
              <button
                onClick={() => toggle(server)}
                disabled={busy === server.name}
                className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 rounded text-left transition-colors"
                title={`${server.command} ${server.args.join(' ')}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: server.enabled ? colors.statusComplete : colors.textMuted }}
                />
                <span
                  className="text-[11.5px] truncate flex-1"
                  style={{ color: server.enabled ? colors.textSecondary : colors.textMuted }}
                >
                  {server.name}
                </span>
                {busy === server.name && (
                  <ArrowsClockwise size={10} className="animate-spin" style={{ color: colors.textMuted }} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 px-2" style={{ color: colors.textMuted }}>
        <CirclesThreePlus size={11} />
        <span className="text-[11px]">{skills.length} skills installed</span>
      </div>
    </>
  )
}

// --- Permission posture -----------------------------------------------------------

function PermissionSection({
  permission, colors,
}: {
  permission: NonNullable<RailData['permission']>
  colors: Colors
}) {
  const drifted = permission.activeMode && permission.activeMode !== permission.mode
  return (
    <>
      <div className="flex flex-wrap gap-1 mb-2">
        {permission.options.map((option) => {
          const selected = option === permission.mode
          return (
            <button
              key={option}
              onClick={() => permission.onChange(option)}
              className="px-2 py-1 rounded-md text-[10.5px] font-medium transition-colors"
              style={{
                background: selected ? colors.accentSoft : colors.surfacePrimary,
                color: selected ? colors.accent : colors.textTertiary,
                border: `1px solid ${selected ? colors.accent : colors.toolBorder}`,
              }}
            >
              {option}
            </button>
          )
        })}
      </div>
      <p className="text-[10.5px] leading-[1.45]" style={{ color: colors.textMuted }}>
        {MODE_BLURB[permission.mode] ?? 'Permission posture for this session.'}
      </p>
      {drifted && (
        <p className="text-[10.5px] leading-[1.45] mt-1.5 flex items-start gap-1" style={{ color: colors.accent }}>
          <ShieldWarning size={11} className="flex-shrink-0 mt-[1px]" />
          <span>The running turn started in "{permission.activeMode}". The new mode applies to your next message.</span>
        </p>
      )}
    </>
  )
}

// --- Decisions --------------------------------------------------------------------

const DECISION_ICON: Record<RailDecision['kind'], React.ReactNode> = {
  blocked: <Prohibit size={11} />,
  mode: <ShieldWarning size={11} />,
  model: <Gear size={11} />,
  folder: <FolderOpen size={11} />,
  cancel: <Prohibit size={11} />,
  permission: <ShieldWarning size={11} />,
}

function DecisionLog({ decisions, colors }: { decisions: RailDecision[]; colors: Colors }) {
  if (decisions.length === 0) {
    return <Empty colors={colors}>Permission changes, blocked tools and cancels land here.</Empty>
  }

  const reveal = (anchorId?: string) => {
    if (!anchorId) return
    document.getElementById(`chat-msg-${anchorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <ul className="space-y-1">
      {[...decisions].reverse().slice(0, 40).map((decision) => {
        const isBlock = decision.kind === 'blocked'
        return (
          <li key={decision.id}>
            <button
              onClick={() => reveal(decision.anchorId)}
              disabled={!decision.anchorId}
              className="w-full text-left flex items-start gap-1.5 px-2 py-1 rounded transition-colors"
              style={{ background: isBlock ? colors.statusErrorBg : 'transparent' }}
            >
              <span
                className="flex-shrink-0 mt-[2px]"
                style={{ color: isBlock ? colors.statusError : colors.textMuted }}
              >
                {DECISION_ICON[decision.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[11px] leading-[1.4] truncate"
                  style={{ color: isBlock ? colors.statusError : colors.textSecondary }}
                >
                  {decision.label}
                </span>
                {decision.detail && (
                  <span className="block text-[10px] truncate" style={{ color: colors.textMuted }}>
                    {decision.detail}
                  </span>
                )}
              </span>
              <span className="text-[9.5px] flex-shrink-0 mt-[2px] tabular-nums" style={{ color: colors.textMuted }}>
                {relativeTime(decision.timestamp)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// --- Rail ---------------------------------------------------------------------------

export function AgentRail({
  data, connectorNote, onCollapse,
}: {
  data: RailData
  connectorNote?: string
  onCollapse?: () => void
}) {
  const colors = useChatColors()
  const openTasks = data.tasks.filter((t) => t.status !== 'completed').length

  return (
    <aside
      className="h-full flex flex-col overflow-hidden"
      style={{ background: colors.containerBg, borderLeft: `1px solid ${colors.containerBorder}` }}
    >
      <div
        className="flex items-center gap-1.5 px-3 h-9 flex-shrink-0"
        style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: data.busy ? colors.accent : colors.textMuted }}
        />
        <span className="text-[11px] font-medium truncate" style={{ color: colors.textSecondary }}>
          {data.agentLabel}
        </span>
        <span className="text-[10px] ml-auto" style={{ color: colors.textMuted }}>
          {data.busy ? 'working' : 'idle'}
        </span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="w-5 h-5 -mr-1 rounded flex items-center justify-center flex-shrink-0"
            style={{ color: colors.textMuted }}
            title="Hide context rail (Cmd+Shift+B)"
          >
            <CaretRight size={11} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <Section title="Tasks" icon={<ListChecks size={12} />} count={openTasks || undefined} colors={colors}>
          <TaskList tasks={data.tasks} colors={colors} />
        </Section>

        <Section title="Working folders" icon={<FolderOpen size={12} />} colors={colors}>
          <FoldersSection colors={colors} files={data.filesTouched} />
        </Section>

        <Section title="Connectors" icon={<Plugs size={12} />} colors={colors} defaultOpen={false}>
          <ConnectorsSection colors={colors} note={connectorNote} />
        </Section>

        {data.permission && (
          <Section title="Permissions" icon={<ShieldWarning size={12} />} colors={colors} defaultOpen={false}>
            <PermissionSection permission={data.permission} colors={colors} />
          </Section>
        )}

        <Section
          title="Decisions made"
          icon={<CheckCircle size={12} />}
          count={data.decisions.length || undefined}
          colors={colors}
          defaultOpen={false}
        >
          <DecisionLog decisions={data.decisions} colors={colors} />
        </Section>
      </div>
    </aside>
  )
}

export default AgentRail
