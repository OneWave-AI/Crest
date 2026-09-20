import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Users,
  ListChecks,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  Loader2,
  ArrowLeft,
  FolderOpen,
  Cpu,
  AlertCircle,
  Play
} from 'lucide-react'
import type { TeamSummary, TeamConfig, TeamTask } from '../../../shared/types'

const POLL_INTERVAL = 5000 // 5 seconds

interface TeamsPanelProps {
  isOpen: boolean
  onClose: () => void
  activeTerminalId?: string | null
}

export default function TeamsPanel({ isOpen, onClose, activeTerminalId }: TeamsPanelProps) {
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null)
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const selectedTeamRef = useRef<string | null>(null)

  // Keep ref in sync for use inside polling interval
  useEffect(() => { selectedTeamRef.current = selectedTeam }, [selectedTeam])

  const loadTeams = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.api.teamsList()
      setTeams(list)
    } catch {
      setError('Failed to load teams')
      setTeams([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Silent refresh (no loading spinner) for polling
  const silentRefreshTeams = useCallback(async () => {
    try {
      const list = await window.api.teamsList()
      setTeams(list)
    } catch { /* silent */ }
  }, [])

  const silentRefreshDetail = useCallback(async (name: string) => {
    try {
      const [config, tasks] = await Promise.all([
        window.api.teamsGetConfig(name),
        window.api.teamsGetTasks(name)
      ])
      setTeamConfig(config)
      setTeamTasks(tasks)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadTeams()
      setSelectedTeam(null)
      setTeamConfig(null)
      setTeamTasks([])
      setConfirmDelete(null)
      setError(null)
      setDetailError(null)
    }
  }, [isOpen, loadTeams])

  // Auto-poll every 5 seconds while the panel is open
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => {
      if (selectedTeamRef.current) {
        silentRefreshDetail(selectedTeamRef.current)
      } else {
        silentRefreshTeams()
      }
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isOpen, silentRefreshTeams, silentRefreshDetail])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTeam) {
          setSelectedTeam(null)
          setTeamConfig(null)
          setTeamTasks([])
          setDetailError(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedTeam, onClose])

  const loadTeamDetail = useCallback(async (name: string) => {
    setDetailLoading(true)
    setDetailError(null)
    setSelectedTeam(name)
    setConfirmDelete(null)
    try {
      const [config, tasks] = await Promise.all([
        window.api.teamsGetConfig(name),
        window.api.teamsGetTasks(name)
      ])
      setTeamConfig(config)
      setTeamTasks(tasks)
    } catch {
      setDetailError('Failed to load team details')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleDelete = async (name: string) => {
    const result = await window.api.teamsDelete(name)
    if (!result.success) {
      setError(result.error || 'Failed to delete team')
      setConfirmDelete(null)
      return
    }
    setConfirmDelete(null)
    if (selectedTeam === name) {
      setSelectedTeam(null)
      setTeamConfig(null)
      setTeamTasks([])
    }
    loadTeams()
  }

  const handleStartTeam = useCallback(() => {
    if (!activeTerminalId) return
    const prompt = `Look at our current conversation context and the work we've been doing. Based on what needs to happen next, suggest and create a Team using TeamCreate to coordinate multiple agents working in parallel.

**What to do:**
1. Analyze what we've been working on and what tasks remain
2. Create a team with TeamCreate, giving it a descriptive name
3. Create tasks with TaskCreate for each piece of work
4. Spawn teammates using the Task tool with appropriate subagent_types
5. Assign tasks to teammates and coordinate their work

Pick the right number of teammates (2-5) and the right agent types for the work. Start the team now.`
    window.api.terminalSendText(prompt, activeTerminalId)
    onClose()
  }, [activeTerminalId, onClose])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const formatDate = (ts: number) => {
    if (!ts) return 'Unknown'
    const d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getMemberColor = (color?: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500',
      red: 'bg-red-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      cyan: 'bg-cyan-500',
      magenta: 'bg-pink-500',
      orange: 'bg-orange-500',
      sand: 'bg-sand-500',
    }
    return colors[color || ''] || 'bg-teal-500'
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-[#1a1a1a] rounded-lg border border-white/[0.06] w-[900px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {selectedTeam && (
              <button
                onClick={() => { setSelectedTeam(null); setTeamConfig(null); setTeamTasks([]); setDetailError(null) }}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="p-1.5 rounded-lg bg-teal-500/15">
              <Users size={16} className="text-teal-400" />
            </div>
            <h2 className="text-lg font-medium text-white">
              {selectedTeam ? selectedTeam : 'Teams'}
            </h2>
            {!selectedTeam && teams.length > 0 && (
              <span className="text-sm text-gray-500">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTerminalId && (
              <button
                onClick={handleStartTeam}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 text-xs font-medium transition-colors"
                title="Start a new team based on current conversation"
              >
                <Play size={12} />
                Start Team
              </button>
            )}
            <button
              onClick={() => { selectedTeam ? loadTeamDetail(selectedTeam) : loadTeams() }}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400"><X size={12} /></button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
            </div>
          ) : !selectedTeam ? (
            /* Teams List */
            teams.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <Users size={40} className="mx-auto mb-3 text-gray-600" />
                <p className="text-lg mb-2">No teams found</p>
                <p className="text-sm">Teams created via Claude Code CLI appear here.</p>
                <p className="text-xs text-gray-600 mt-2">Use TeamCreate in Claude Code to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map(team => {
                  const progressPct = team.taskStats.total > 0
                    ? Math.round((team.taskStats.completed / team.taskStats.total) * 100)
                    : 0

                  return (
                    <div
                      key={team.name}
                      className="bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-teal-500/30 transition-all cursor-pointer group"
                      onClick={() => loadTeamDetail(team.name)}
                    >
                      <div className="flex items-center gap-4 p-4">
                        <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 transition-colors">
                          <Users size={20} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-white truncate">{team.name}</h3>
                            <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded-full bg-white/[0.04]">
                              {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {team.description && (
                            <p className="text-xs text-gray-500 truncate mb-2">{team.description}</p>
                          )}

                          {/* Task progress bar */}
                          {team.taskStats.total > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                {team.taskStats.completed}/{team.taskStats.total} tasks
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-gray-600">{formatDate(team.createdAt)}</span>
                          {confirmDelete === team.name ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(team.name)}
                                className="px-2 py-1 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(team.name)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"
                              title="Delete team"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <ChevronRight size={16} className="text-gray-600 group-hover:text-teal-400 transition-colors" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
            </div>
          ) : detailError ? (
            <div className="text-center text-gray-500 py-12">
              <AlertCircle size={32} className="mx-auto mb-3 text-red-400/60" />
              <p className="text-sm text-red-400">{detailError}</p>
              <button onClick={() => loadTeamDetail(selectedTeam!)} className="mt-3 text-xs text-teal-400 hover:text-teal-300">Retry</button>
            </div>
          ) : (
            /* Team Detail View */
            <div className="space-y-6">
              {/* Team Info */}
              {teamConfig && (
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                  {teamConfig.description && (
                    <p className="text-sm text-gray-400 mb-3">{teamConfig.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Created {formatDate(teamConfig.createdAt)}</span>
                    <span>{teamConfig.members?.length || 0} members</span>
                    <span>{teamTasks.length} tasks</span>
                  </div>
                </div>
              )}

              {/* Members */}
              {teamConfig && teamConfig.members && teamConfig.members.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 flex items-center gap-2">
                    <Users size={12} /> Members ({teamConfig.members.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {teamConfig.members.map(member => (
                      <div
                        key={member.agentId}
                        className="bg-white/[0.03] rounded-lg border border-white/[0.06] p-3 flex items-center gap-3"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${getMemberColor(member.color)} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-medium truncate">{member.name}</span>
                            <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-white/[0.04] flex-shrink-0">{member.agentType}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {member.model && (
                              <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                <Cpu size={9} /> {member.model}
                              </span>
                            )}
                            {member.cwd && (
                              <span className="flex items-center gap-1 text-[10px] text-gray-600 truncate">
                                <FolderOpen size={9} /> {member.cwd.split('/').pop()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 flex items-center gap-2">
                  <ListChecks size={12} /> Tasks ({teamTasks.length})
                </h3>
                {teamTasks.length === 0 ? (
                  <div className="text-center text-gray-600 py-6 text-sm">
                    No tasks in this team
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamTasks.map(task => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: TeamTask }) {
  const [expanded, setExpanded] = useState(false)

  const getStatusBadge = (status: TeamTask['status']) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400"><CheckCircle size={10} /> Done</span>
      case 'in_progress':
        return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400"><Loader2 size={10} className="animate-spin" /> Active</span>
      case 'pending':
        return <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/15 text-gray-400"><Clock size={10} /> Pending</span>
      default:
        return null
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-lg border border-white/[0.06] overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs text-gray-600 font-mono w-8 flex-shrink-0">#{task.id}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white truncate block">{task.subject}</span>
        </div>
        {task.owner && (
          <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-white/[0.04] flex-shrink-0">{task.owner}</span>
        )}
        {getStatusBadge(task.status)}
      </div>

      {expanded && (
        <div className="border-t border-white/[0.04] p-3 bg-black/20">
          {task.description && (
            <p className="text-xs text-gray-400 mb-2 whitespace-pre-wrap">{task.description}</p>
          )}
          {task.activeForm && (
            <p className="text-[10px] text-cyan-400/70 mb-2">Status: {task.activeForm}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-gray-600">
            {task.blocks && task.blocks.length > 0 && (
              <span>Blocks: {task.blocks.join(', ')}</span>
            )}
            {task.blockedBy && task.blockedBy.length > 0 && (
              <span>Blocked by: {task.blockedBy.join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
