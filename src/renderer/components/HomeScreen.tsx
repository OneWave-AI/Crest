import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Play,
  FolderOpen,
  Sparkles,
  History,
  Download,
  Code2,
  Rocket,
  ArrowRight,
  Zap,
  Bot,
  MessageSquare,
  Clock,
  ChevronRight,
  AlertCircle,
  Loader2,
  Plug,
  Settings,
  TrendingUp,
  DollarSign,
  Timer,
  Activity,
  BarChart3,
  Cpu,
  Wrench,
  GitBranch,
  Terminal,
  Globe,
  FileEdit,
  Search,
  Hexagon
} from 'lucide-react'

// Custom Bee Icon component
const BeeIcon = ({ className, size = 24 }: { className?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Body */}
    <ellipse cx="12" cy="14" rx="5" ry="6" fill="currentColor" opacity="0.2"/>
    <ellipse cx="12" cy="14" rx="5" ry="6"/>
    {/* Stripes */}
    <path d="M7.5 12h9" strokeWidth="1.5"/>
    <path d="M7.5 15h9" strokeWidth="1.5"/>
    {/* Head */}
    <circle cx="12" cy="7" r="3" fill="currentColor" opacity="0.3"/>
    <circle cx="12" cy="7" r="3"/>
    {/* Wings */}
    <ellipse cx="7" cy="11" rx="3" ry="2" fill="currentColor" opacity="0.15" transform="rotate(-30 7 11)"/>
    <ellipse cx="17" cy="11" rx="3" ry="2" fill="currentColor" opacity="0.15" transform="rotate(30 17 11)"/>
    {/* Antennae */}
    <path d="M10 5 L8 2"/>
    <path d="M14 5 L16 2"/>
    {/* Stinger */}
    <path d="M12 20 L12 22"/>
  </svg>
)
import { useAppStore } from '../store'

interface HomeScreenProps {
  cwd: string
  claudeInstalled: boolean | null
  claudeCliInstalled?: boolean | null
  codexCliInstalled?: boolean | null
  onStartSession: () => void
  onSelectFolder: () => void
  onOpenSkills: () => void
  onOpenHistory: () => void
  onOpenSettings?: () => void
  onOpenSuperAgent?: () => void
  onOpenAnalytics?: () => void
  onOpenHive?: () => void
  onOpenMemory?: () => void
  onOpenTeams?: () => void
  onStartChat?: () => void
}

interface RecentProject {
  folder: string
  name: string
  timestamp: number
}

interface Stats {
  conversations: number
  skills: number
  agents: number
  mcpServers: number
}

interface DetailedStats {
  totalSessions: number
  totalTokens: number
  totalTimeMinutes: number
  avgSessionLength: number
  sessions7Days: number
  sessions30Days: number
  time7Days: number
  time30Days: number
  recentActivity: { date: string; sessions: number; minutes: number }[]
  topProjects: { name: string; folder: string; sessions: number; timeMinutes: number }[]
  totalProjects: number
  // Time analysis
  peakHour: number
  peakDay: string
  hourlyDistribution: number[] // 24 hours, sessions per hour
  dailyDistribution: number[] // 7 days (Sun-Sat), sessions per day
  productivityScore: number // 0-100 based on consistency
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

export default function HomeScreen({
  cwd,
  claudeInstalled,
  claudeCliInstalled,
  codexCliInstalled,
  onStartSession,
  onSelectFolder,
  onOpenSkills,
  onOpenHistory,
  onOpenSettings,
  onOpenSuperAgent,
  onOpenAnalytics,
  onOpenHive,
  onOpenMemory,
  onOpenTeams,
  onStartChat
}: HomeScreenProps) {
  // Get setCwd from store to keep it in sync when clicking projects
  const setCwd = useAppStore((state) => state.setCwd)

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [stats, setStats] = useState<Stats>({ conversations: 0, skills: 0, agents: 0, mcpServers: 0 })
  const [detailedStats, setDetailedStats] = useState<DetailedStats>({
    totalSessions: 0,
    totalTokens: 0,
    totalTimeMinutes: 0,
    avgSessionLength: 0,
    sessions7Days: 0,
    sessions30Days: 0,
    time7Days: 0,
    time30Days: 0,
    recentActivity: [],
    topProjects: [],
    totalProjects: 0,
    peakHour: 0,
    peakDay: 'N/A',
    hourlyDistribution: Array(24).fill(0),
    dailyDistribution: Array(7).fill(0),
    productivityScore: 0
  })
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [isStarting, setIsStarting] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Trigger mount animation
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  // Load data
  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      setLoadingState('loading')
      try {
        const conversations = await window.api.listConversations()
        if (cancelled) return
        const projectMap = new Map<string, RecentProject>()
        for (const conv of conversations) {
          if (conv.projectFolder && !projectMap.has(conv.projectFolder)) {
            projectMap.set(conv.projectFolder, {
              folder: conv.projectFolder,
              name: conv.projectFolder.split('/').pop() || 'Project',
              timestamp: conv.timestamp
            })
          }
        }
        setRecentProjects(Array.from(projectMap.values()).slice(0, 3))
        const [skills, agents, mcpServers] = await Promise.all([
          window.api.listSkills().catch(() => []),
          window.api.listAgents().catch(() => []),
          window.api.mcpList().catch(() => [])
        ])
        if (cancelled) return
        setStats({
          conversations: conversations.length,
          skills: Array.isArray(skills) ? skills.length : 0,
          agents: Array.isArray(agents) ? agents.length : 0,
          mcpServers: Array.isArray(mcpServers) ? mcpServers.filter((s: { enabled: boolean }) => s.enabled).length : 0
        })

        // Calculate detailed stats from conversations using REAL duration data
        const now = new Date()
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        let sessions7Days = 0
        let sessions30Days = 0
        let time7Days = 0
        let time30Days = 0
        let totalTokens = 0
        let totalMinutes = 0

        // Group sessions by date for activity chart (last 7 days)
        // Use local date strings to avoid timezone issues
        const getLocalDateStr = (d: Date) => {
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        const activityMap = new Map<string, { sessions: number; minutes: number }>()
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const dateStr = getLocalDateStr(date)
          activityMap.set(dateStr, { sessions: 0, minutes: 0 })
        }

        // Track projects with time
        const projectCounts = new Map<string, { name: string; folder: string; count: number; timeMinutes: number }>()

        // Time analysis tracking
        const hourlyDistribution = Array(24).fill(0)
        const dailyDistribution = Array(7).fill(0)
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

        for (const conv of conversations) {
          const convDate = new Date(conv.timestamp)
          const convDateStr = getLocalDateStr(convDate)

          // Get REAL duration from stats (in milliseconds), convert to minutes
          const durationMinutes = conv.stats?.duration
            ? Math.round(conv.stats.duration / 1000 / 60)
            : 10 // Default 10 min if no duration data

          // Get REAL token count from stats
          const tokens = conv.stats?.estimatedTokens || 2500

          // Track hourly and daily distribution
          const hour = convDate.getHours()
          const dayOfWeek = convDate.getDay()
          hourlyDistribution[hour]++
          dailyDistribution[dayOfWeek]++

          // Count by time period
          if (convDate >= sevenDaysAgo) {
            sessions7Days++
            time7Days += durationMinutes
          }
          if (convDate >= thirtyDaysAgo) {
            sessions30Days++
            time30Days += durationMinutes
          }

          // Track activity by date with time
          const dayData = activityMap.get(convDateStr)
          if (dayData) {
            dayData.sessions++
            dayData.minutes += durationMinutes
          }

          // Track projects with time
          if (conv.projectFolder) {
            const existing = projectCounts.get(conv.projectFolder)
            if (existing) {
              existing.count++
              existing.timeMinutes += durationMinutes
            } else {
              projectCounts.set(conv.projectFolder, {
                name: conv.projectFolder.split('/').pop() || 'Unknown',
                folder: conv.projectFolder,
                count: 1,
                timeMinutes: durationMinutes
              })
            }
          }

          totalTokens += tokens
          totalMinutes += durationMinutes
        }

        // Sort projects by TIME spent (for developer billing)
        const topProjects = Array.from(projectCounts.values())
          .sort((a, b) => b.timeMinutes - a.timeMinutes)
          .slice(0, 5)
          .map(p => ({ name: p.name, folder: p.folder, sessions: p.count, timeMinutes: p.timeMinutes }))

        // Convert activity map to array
        const recentActivity = Array.from(activityMap.entries())
          .map(([date, data]) => ({ date, sessions: data.sessions, minutes: data.minutes }))

        // Calculate peak hour and day
        const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution))
        const peakDayIndex = dailyDistribution.indexOf(Math.max(...dailyDistribution))
        const peakDay = dayNames[peakDayIndex] || 'N/A'

        // Calculate productivity score (based on consistency - how spread out sessions are)
        const avgSessionsPerDay = conversations.length / 7
        const variance = dailyDistribution.reduce((sum, count) => sum + Math.pow(count - avgSessionsPerDay, 2), 0) / 7
        const consistency = Math.max(0, 100 - Math.sqrt(variance) * 10)
        const productivityScore = Math.round(Math.min(100, consistency + (sessions7Days > 0 ? 20 : 0)))

        setDetailedStats({
          totalSessions: conversations.length,
          totalTokens,
          totalTimeMinutes: totalMinutes,
          avgSessionLength: conversations.length > 0 ? Math.round(totalMinutes / conversations.length) : 0,
          sessions7Days,
          sessions30Days,
          time7Days,
          time30Days,
          recentActivity,
          topProjects,
          totalProjects: projectCounts.size,
          peakHour,
          peakDay,
          hourlyDistribution,
          dailyDistribution,
          productivityScore
        })

        setLoadingState('loaded')
      } catch {
        if (!cancelled) setLoadingState('error')
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  const handleStart = useCallback(() => {
    if (!cwd || claudeInstalled === false || isStarting) return
    setIsStarting(true)
    onStartSession()
  }, [cwd, claudeInstalled, isStarting, onStartSession])

  const handleProjectClick = useCallback((folder: string) => {
    // Update both the store and the main process cwd
    setCwd(folder)
    window.api.setCwd(folder)
    onStartSession()
  }, [setCwd, onStartSession])

  const canStart = Boolean(cwd) && claudeInstalled !== false

  const formatTime = useMemo(() => (ts: number) => {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }, [])

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[#030305]">
      {/* Layered Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 20%, #0a0a12 0%, #030305 100%)' }} />

        {/* Static gradient orb */}
        <div className="absolute w-96 h-96 -top-20 -left-20 rounded-full bg-[#cc785c]/5 blur-3xl" />

        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />

        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)' }} />
      </div>

      {/* Content */}
      <div className={`relative z-10 max-w-3xl mx-auto px-6 py-12 transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0 translate-y-4'}`}>
        {/* Compact Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3 tracking-tight">
            <span className="bg-gradient-to-r from-[#cc785c] to-[#e8956e] bg-clip-text text-transparent">Crest</span>
          </h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Your autonomous AI coding companion. Let Claude build, debug, and ship while you focus on what matters.
          </p>

          {/* Stats summary - always shown */}
          {loadingState === 'loaded' && (
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <span className="text-gray-500"><span className="text-white font-medium">{stats.conversations}</span> chats</span>
              <span className="text-gray-700">•</span>
              <span className="text-gray-500"><span className="text-white font-medium">{stats.skills + stats.agents}</span> tools</span>
              <span className="text-gray-700">•</span>
              <span className="text-gray-500"><span className="text-white font-medium">{stats.mcpServers}</span> MCP</span>
            </div>
          )}
        </div>

        {/* Analytics Dashboard - Skeleton Loader */}
        {loadingState === 'loading' && (
          <div className="mb-6 animate-pulse">
            <div className="bg-[#111113] rounded-2xl border border-white/[0.06] p-5">
              {/* Header skeleton */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
                  <div className="w-24 h-4 rounded bg-white/[0.06]" />
                </div>
                <div className="w-20 h-3 rounded bg-white/[0.06]" />
              </div>

              {/* Stats Cards skeleton */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-black/20 rounded-xl p-3 border border-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded bg-white/[0.06]" />
                      <div className="w-12 h-2 rounded bg-white/[0.06]" />
                    </div>
                    <div className="w-16 h-6 rounded bg-white/[0.08]" />
                  </div>
                ))}
              </div>

              {/* Two columns skeleton */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-20 h-2 rounded bg-white/[0.06]" />
                    <div className="w-3 h-3 rounded bg-white/[0.06]" />
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-sm bg-white/[0.06]"
                          style={{ height: `${20 + i * 10}%` }}
                        />
                        <div className="w-2 h-2 rounded bg-white/[0.04]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-20 h-2 rounded bg-white/[0.06]" />
                    <div className="w-3 h-3 rounded bg-white/[0.06]" />
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded bg-white/[0.06]" />
                        <div className="flex-1 h-2 rounded bg-white/[0.06]" />
                        <div className="w-16 h-1.5 rounded bg-white/[0.06]" />
                        <div className="w-8 h-2 rounded bg-white/[0.06]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Time Analysis Section skeleton */}
              <div className="mt-4 bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-24 h-2 rounded bg-white/[0.06]" />
                  <div className="w-3 h-3 rounded bg-white/[0.06]" />
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="text-center">
                      <div className="w-12 h-8 rounded bg-white/[0.08] mx-auto mb-1" />
                      <div className="w-16 h-2 rounded bg-white/[0.04] mx-auto" />
                    </div>
                  ))}
                </div>
                {/* 24h Activity skeleton */}
                <div className="mt-4">
                  <div className="w-16 h-2 rounded bg-white/[0.04] mb-2" />
                  <div className="flex items-end gap-0.5 h-8">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-white/[0.04]"
                        style={{ height: `${10 + (i % 5) * 15}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    {['12am', '6am', '12pm', '6pm', '12am'].map((t) => (
                      <div key={t} className="w-6 h-1.5 rounded bg-white/[0.03]" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer skeleton */}
              <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-2 rounded bg-white/[0.06]" />
                  <div className="w-28 h-2 rounded bg-white/[0.06]" />
                </div>
                <div className="w-16 h-2 rounded bg-white/[0.04]" />
              </div>
            </div>
          </div>
        )}

        {/* Analytics Dashboard - Actual Content */}
        {loadingState === 'loaded' && (
          <div className="mb-6 animate-in fade-in duration-500">
            <div className="bg-[#111113] rounded-2xl border border-white/[0.06] p-5">
              {/* Dashboard Header with View Details link */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#cc785c]/10">
                    <BarChart3 size={14} className="text-[#cc785c]" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Your Activity</h3>
                </div>
                {onOpenAnalytics && (
                  <button
                    onClick={onOpenAnalytics}
                    className="flex items-center gap-1 text-xs text-[#cc785c] hover:text-[#e8956e] transition-colors"
                  >
                    View Details <ArrowRight size={12} />
                  </button>
                )}
              </div>

              {/* Stats Cards Grid - 4 columns */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                <StatCard
                  icon={MessageSquare}
                  label="This Week"
                  value={detailedStats.sessions7Days}
                />
                <StatCard
                  icon={Timer}
                  label="Time Coded"
                  value={formatMinutes(detailedStats.time7Days)}
                />
                <StatCard
                  icon={Activity}
                  label="Projects"
                  value={detailedStats.totalProjects}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Tokens"
                  value={formatNumber(detailedStats.totalTokens)}
                />
              </div>

              {/* Two columns: Activity Chart + Top Projects */}
              <div className="grid grid-cols-2 gap-4">
                {/* Activity Chart */}
                <div className="bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">7-Day Activity</span>
                    <TrendingUp size={12} className="text-gray-400" />
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {(detailedStats.recentActivity.length > 0 ? detailedStats.recentActivity :
                      // Fallback: generate 7 empty days if no data
                      Array.from({ length: 7 }, (_, i) => {
                        const date = new Date()
                        date.setDate(date.getDate() - (6 - i))
                        return { date: date.toISOString().split('T')[0], sessions: 0, minutes: 0 }
                      })
                    ).map((day, i, arr) => {
                      const maxSessions = Math.max(...arr.map(d => d.sessions), 1)
                      const height = day.sessions > 0 ? Math.max((day.sessions / maxSessions) * 100, 15) : 8
                      const isToday = i === arr.length - 1
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${day.sessions} sessions, ${day.minutes}m`}>
                          <div
                            className={`w-full rounded-sm transition-all ${
                              isToday ? 'bg-gradient-to-t from-[#cc785c] to-[#e8956e]' :
                              day.sessions > 0 ? 'bg-[#cc785c]/40' : 'bg-white/[0.06]'
                            }`}
                            style={{ height: `${height}%` }}
                          />
                          <span className="text-[10px] text-gray-600">
                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Top Projects by TIME */}
                <div className="bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Top Projects</span>
                    <Clock size={12} className="text-gray-400" />
                  </div>
                  <div className="space-y-2">
                    {detailedStats.topProjects.slice(0, 4).map((project) => {
                      const maxTime = detailedStats.topProjects[0]?.timeMinutes || 1
                      const percent = (project.timeMinutes / maxTime) * 100
                      return (
                        <div key={project.folder} className="flex items-center gap-2">
                          <Code2 size={10} className="text-gray-500 flex-shrink-0" />
                          <span className="text-[11px] text-gray-400 truncate flex-1">{project.name}</span>
                          <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#cc785c] to-[#e8956e] transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 w-10 text-right flex-shrink-0">{formatMinutes(project.timeMinutes)}</span>
                        </div>
                      )
                    })}
                    {detailedStats.topProjects.length === 0 && (
                      <p className="text-[11px] text-gray-600 text-center py-2">No project data yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Analysis Section */}
              <div className="mt-4 bg-black/20 rounded-xl p-4 border border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Work Patterns</span>
                  <Clock size={12} className="text-gray-400" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {/* Peak Hour */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#cc785c]">
                      {detailedStats.peakHour > 12 ? detailedStats.peakHour - 12 : detailedStats.peakHour || 12}
                      <span className="text-sm ml-1">{detailedStats.peakHour >= 12 ? 'PM' : 'AM'}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Peak Hour</p>
                  </div>
                  {/* Peak Day */}
                  <div className="text-center">
                    <div className="text-lg font-bold text-[#cc785c]">{detailedStats.peakDay.slice(0, 3)}</div>
                    <p className="text-[10px] text-gray-500 mt-1">Most Active Day</p>
                  </div>
                  {/* Productivity Score */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#cc785c]">{detailedStats.productivityScore}</div>
                    <p className="text-[10px] text-gray-500 mt-1">Consistency</p>
                  </div>
                </div>
                {/* Hourly Distribution Mini Chart */}
                <div className="mt-4">
                  <p className="text-[10px] text-gray-600 mb-2">24h Activity</p>
                  <div className="flex items-end gap-0.5 h-8">
                    {detailedStats.hourlyDistribution.map((count, hour) => {
                      const max = Math.max(...detailedStats.hourlyDistribution, 1)
                      const height = count > 0 ? Math.max((count / max) * 100, 10) : 4
                      const isWorkHour = hour >= 9 && hour <= 18
                      return (
                        <div
                          key={hour}
                          className={`flex-1 rounded-t-sm transition-all ${
                            count > 0 ? (isWorkHour ? 'bg-[#cc785c]/60' : 'bg-[#cc785c]/30') : 'bg-white/[0.04]'
                          }`}
                          style={{ height: `${height}%` }}
                          title={`${hour}:00 - ${count} sessions`}
                        />
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-gray-600">12am</span>
                    <span className="text-[9px] text-gray-600">6am</span>
                    <span className="text-[9px] text-gray-600">12pm</span>
                    <span className="text-[9px] text-gray-600">6pm</span>
                    <span className="text-[9px] text-gray-600">12am</span>
                  </div>
                </div>
              </div>

              {/* Footer Insights */}
              <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Cpu size={10} className="text-gray-400" />
                    Avg session: <span className="text-gray-400">{detailedStats.avgSessionLength}m</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Plug size={10} className="text-gray-400" />
                    30-day: <span className="text-gray-400">{detailedStats.sessions30Days} sessions</span>
                  </span>
                </div>
                <span className="text-[10px] text-gray-700">Updated just now</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-[#111113] rounded-2xl border border-white/[0.06] p-6 mb-6">
          {/* Folder Selector - Premium */}
          <button onClick={onSelectFolder} className="w-full group flex items-center gap-4 rounded-xl bg-black/40 hover:bg-black/60 border border-white/[0.08] hover:border-[#cc785c]/40 p-4 mb-4 transition-all duration-300 hover:shadow-lg hover:shadow-[#cc785c]/10">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-[#cc785c]/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#cc785c]/20 to-[#cc785c]/5 flex items-center justify-center group-hover:scale-105 transition-all duration-300 border border-[#cc785c]/20">
                <FolderOpen className="w-5 h-5 text-[#cc785c]" />
              </div>
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Project Folder</p>
              <p className="text-white text-sm font-mono truncate">{cwd || 'Select a folder...'}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-[#cc785c]/20 transition-all duration-300">
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-[#cc785c] group-hover:translate-x-0.5 transition-all duration-300" />
            </div>
          </button>

          {/* CLI install status */}
          {(claudeCliInstalled === false || codexCliInstalled === false) && (
            <div className="space-y-2 mb-4">
              {claudeCliInstalled === false && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-400 text-sm mb-2">Claude Code CLI not installed</p>
                  <button onClick={() => window.api.installCli('claude')} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg py-2 text-sm transition-colors">
                    <Download size={16} /> Install Claude Code
                  </button>
                </div>
              )}
              {codexCliInstalled === false && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-emerald-400 text-sm mb-2">Codex CLI not installed</p>
                  <button onClick={() => window.api.installCli('codex')} className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-medium rounded-lg py-2 text-sm transition-colors">
                    <Download size={16} /> Install Codex
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Start Buttons */}
          <div className="flex gap-3">
            {/* Start with Project - Premium */}
            <div className="flex-1 relative group/start">
              {canStart && !isStarting && (
                <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-[#cc785c] to-[#e8956e] opacity-75 blur-sm group-hover/start:opacity-100 transition-opacity" />
              )}
              <button
                onClick={handleStart}
                disabled={!canStart || isStarting}
                className={`relative w-full flex items-center justify-center gap-3 rounded-xl py-4 font-semibold text-lg transition-all duration-300 ${
                  canStart && !isStarting
                    ? 'bg-gradient-to-r from-[#cc785c] to-[#e8956e] text-white shadow-xl shadow-[#cc785c]/30 hover:shadow-2xl hover:shadow-[#cc785c]/40 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isStarting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /><span>Starting...</span></>
                ) : (
                  <>
                    <div className="relative">
                      <Play className="w-5 h-5" fill="currentColor" />
                      {canStart && <div className="absolute inset-0 animate-ping opacity-30"><Play className="w-5 h-5" fill="currentColor" /></div>}
                    </div>
                    <span>Start Session</span>
                    <ArrowRight className="w-5 h-5 transition-transform group-hover/start:translate-x-1" />
                  </>
                )}
              </button>
            </div>

            {/* Start Chat UI */}
            <button
              onClick={() => {
                if (onStartChat) onStartChat()
              }}
              disabled={claudeInstalled === false || isStarting}
              className={`group/chat px-6 py-4 flex items-center justify-center gap-3 rounded-xl font-medium transition-all duration-300 border ${
                claudeInstalled !== false && !isStarting
                  ? 'bg-gradient-to-r from-[#cc785c]/10 to-[#cc785c]/5 hover:from-[#cc785c]/20 hover:to-[#cc785c]/10 border-[#cc785c]/20 hover:border-[#cc785c]/40 text-gray-200 hover:text-white hover:scale-[1.02] backdrop-blur-sm'
                  : 'bg-gray-800/30 text-gray-600 cursor-not-allowed border-transparent'
              }`}
              title="Start with Chat UI"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-base">Chat UI</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover/chat:translate-x-1 opacity-50" />
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-600 mt-3">
            <kbd className="px-1.5 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 font-mono shadow-sm">⌘</kbd>
            <span className="mx-1">+</span>
            <kbd className="px-1.5 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 font-mono shadow-sm">↵</kbd>
            <span className="ml-2 text-gray-500">to start with project</span>
          </p>
        </div>

        {/* Command Panel */}
        <div className="flex justify-center mb-8">
          <div className="relative max-w-md w-full">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl">
              <div className="relative px-2 py-2.5">
                {/* Top row */}
                <div className="grid grid-cols-4 gap-0.5">
                  <PanelItem label="Projects" icon="projects" accent="#60a5fa" onClick={onSelectFolder} />
                  <PanelItem label="Tools" icon="tools" accent="#fb923c" onClick={onOpenSkills} badge={stats.skills + stats.agents || undefined} />
                  <PanelItem label="Hive" icon="hive" accent="#fbbf24" onClick={onOpenHive || onOpenSuperAgent || (() => {})} />
                  <PanelItem label="Memory" icon="memory" accent="#a78bfa" onClick={onOpenMemory || (() => {})} />
                </div>

                {/* Separator */}
                <div className="mx-8 my-1.5 h-px" style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)'
                }} />

                {/* Bottom row */}
                <div className="grid grid-cols-4 gap-0.5">
                  <PanelItem label="Teams" icon="teams" accent="#2dd4bf" onClick={onOpenTeams || (() => {})} />
                  <PanelItem label="History" icon="history" accent="#8b5cf6" onClick={onOpenHistory} badge={stats.conversations || undefined} />
                  <PanelItem label="Stats" icon="stats" accent="#22d3ee" onClick={onOpenAnalytics || (() => {})} />
                  <PanelItem label="Config" icon="config" accent="#9ca3af" onClick={onOpenSettings || (() => {})} />
                </div>

                {/* Agent row separator */}
                <div className="mx-6 my-1.5 h-px" style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)'
                }} />

                {/* Agent buttons row */}
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  {/* Super Agent */}
                  {onOpenSuperAgent && (
                    <button
                      onClick={onOpenSuperAgent}
                      disabled={claudeInstalled === false}
                      className="agent-btn group/sa relative flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-200 active:scale-[0.97]"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(204,120,92,0.04)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div
                        className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover/sa:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, rgba(204,120,92,0.18), rgba(232,149,110,0.1))',
                          border: '1px solid rgba(204,120,92,0.15)',
                          boxShadow: 'inset 0 1px 0 rgba(204,120,92,0.08)',
                        }}
                      >
                        <Zap className="w-3.5 h-3.5 text-[#cc785c] opacity-80 group-hover/sa:opacity-100 transition-opacity duration-200" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-[11px] font-semibold tracking-wide text-gray-400 group-hover/sa:text-gray-200 transition-colors duration-200 truncate">
                          Super Agent
                        </div>
                        <div className="text-[10px] text-gray-600 truncate">AI task execution</div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-700 group-hover/sa:text-[#cc785c] group-hover/sa:translate-x-0.5 transition-all duration-200 shrink-0" />
                    </button>
                  )}

                  {/* Orchestrator */}
                  {onOpenSuperAgent && (
                    <button
                      onClick={onOpenSuperAgent}
                      className="agent-btn group/orch relative flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-200 active:scale-[0.97]"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(204,120,92,0.04)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div
                        className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover/orch:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, rgba(204,120,92,0.18), rgba(232,149,110,0.1))',
                          border: '1px solid rgba(204,120,92,0.15)',
                          boxShadow: 'inset 0 1px 0 rgba(204,120,92,0.08)',
                        }}
                      >
                        <div style={{ color: '#cc785c' }} className="opacity-80 group-hover/orch:opacity-100 transition-opacity duration-200">
                          <GeometricIcons.orchestrator className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-[11px] font-semibold tracking-wide text-gray-400 group-hover/orch:text-gray-200 transition-colors duration-200 truncate">
                          Orchestrator
                        </div>
                        <div className="text-[10px] text-gray-600 truncate">Multi-agent swarm</div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-700 group-hover/orch:text-[#cc785c] group-hover/orch:translate-x-0.5 transition-all duration-200 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Projects - Premium */}
        {recentProjects.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2 font-medium">
              <Clock size={10} className="text-gray-600" /> Recent Projects
            </h3>
            <div className="space-y-2">
              {recentProjects.map((project, index) => (
                <button
                  key={project.folder}
                  onClick={() => handleProjectClick(project.folder)}
                  className="w-full group flex items-center gap-3 rounded-xl bg-[#111113] hover:bg-[#111113]/80 border border-white/[0.06] hover:border-[#cc785c]/30 p-3.5 text-left transition-all duration-300 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-[#cc785c]/5"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center group-hover:from-[#cc785c]/20 group-hover:to-[#cc785c]/5 transition-all duration-300 border border-white/5">
                    <Code2 className="w-4 h-4 text-gray-500 group-hover:text-[#cc785c] transition-colors duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate font-medium">{project.name}</span>
                    <span className="text-[11px] text-gray-600">{formatTime(project.timestamp)}</span>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/0 group-hover:bg-white/5 flex items-center justify-center transition-all duration-300">
                    <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-[#cc785c] group-hover:translate-x-0.5 transition-all duration-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <span className="text-[11px] text-gray-700">Crest • Built with <Rocket className="w-2.5 h-2.5 inline text-gray-400" /></span>
        </div>
      </div>

      <style>{`
        @keyframes shine {
          0% { transform: skewX(-20deg) translateX(-150%); }
          100% { transform: skewX(-20deg) translateX(250%); }
        }

        .animate-shine {
          animation: shine 0.8s ease-out forwards;
        }

        /* Panel item hover states */
        .panel-item:hover .panel-icon-box {
          transform: scale(1.06);
        }
        .panel-item:hover .panel-icon-wrap {
          opacity: 1;
        }
        .panel-item:hover .panel-label {
          color: rgba(229,231,235,0.9);
        }
        .panel-item:hover .panel-underline {
          width: 20px;
        }
        .panel-item:hover .panel-glow {
          opacity: 0.25;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-shine { animation: none; }
        }
      `}</style>
    </div>
  )
}

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remaining = mins % 60
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
  }
  return `${mins}m`
}

function getToolIcon(name: string): typeof Terminal {
  const icons: Record<string, typeof Terminal> = {
    Read: FileEdit,
    Write: FileEdit,
    Edit: FileEdit,
    Bash: Terminal,
    Grep: Search,
    Glob: Search,
    Git: GitBranch,
    Browser: Globe
  }
  return icons[name] || Wrench
}

// Stat Card Component
function StatCard({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string; size?: string | number }>
  label: string
  value: string | number
}) {
  return (
    <div className="relative bg-black/20 rounded-xl p-3 border border-white/[0.04] border-l-2 border-l-[#cc785c]/30 hover:border-white/[0.08] hover:border-l-[#cc785c]/50 transition-all hover:translate-y-[-1px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-[#cc785c]/10">
          <Icon size={12} className="text-[#cc785c]" />
        </div>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  )
}

// 3D Geometric Icons - uses gradients for lighting, layered fills for depth
const GeometricIcons: Record<string, ({ className }: { className?: string }) => JSX.Element> = {
  projects: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="proj-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="proj-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {/* Drop shadow */}
      <path d="M5 27C5 27 8 29 16 29C24 29 27 27 27 27" stroke="currentColor" strokeWidth="0.5" opacity="0.08" />
      {/* Back card - offset for depth */}
      <rect x="7" y="3" width="20" height="17" rx="2.5" fill="currentColor" stroke="currentColor" strokeWidth="0.8" opacity="0.15" />
      {/* Middle card */}
      <rect x="4.5" y="5.5" width="20" height="17" rx="2.5" fill="currentColor" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      {/* Front folder - 3D face */}
      <path d="M3 12.5C3 11.12 4.12 10 5.5 10H10.5L13 12.5H24.5C25.88 12.5 27 13.62 27 15V24.5C27 25.88 25.88 27 24.5 27H5.5C4.12 27 3 25.88 3 24.5V12.5Z" fill="url(#proj-face)" stroke="currentColor" strokeWidth="1.3" />
      {/* Folder tab - lit from top */}
      <path d="M3 12.5C3 11.12 4.12 10 5.5 10H10.5L13 12.5" fill="url(#proj-top)" />
      <path d="M5.5 10H10.5L13 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Top edge highlight */}
      <path d="M13.5 12.5H24.5C25.88 12.5 27 13.62 27 15" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      {/* Inner shine band */}
      <rect x="6" y="15" width="19" height="1" rx="0.5" fill="currentColor" opacity="0.1" />
      {/* Embossed diamond detail */}
      <path d="M14.5 20L16 18L17.5 20L16 22L14.5 20Z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
    </svg>
  ),
  tools: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="star-lit" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="star-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {/* Soft glow ring */}
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="0.5" opacity="0.08" strokeDasharray="2 3" />
      {/* Main star - filled face */}
      <path d="M16 3L18.8 12.2L27 16L18.8 19.8L16 29L13.2 19.8L5 16L13.2 12.2L16 3Z" fill="url(#star-lit)" />
      {/* Star outline with lighting */}
      <path d="M16 3L18.8 12.2L27 16L18.8 19.8L16 29L13.2 19.8L5 16L13.2 12.2L16 3Z" stroke="url(#star-edge)" strokeWidth="1.3" strokeLinejoin="round" />
      {/* Top-left lit facet */}
      <path d="M16 3L13.2 12.2L5 16L16 16L16 3Z" fill="currentColor" opacity="0.12" />
      {/* Top-right lit facet */}
      <path d="M16 3L18.8 12.2L27 16L16 16L16 3Z" fill="currentColor" opacity="0.08" />
      {/* Center gem */}
      <circle cx="16" cy="16" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.15" />
      {/* Secondary sparkle */}
      <path d="M25 5L25.8 7.2L28 8L25.8 8.8L25 11L24.2 8.8L22 8L24.2 7.2L25 5Z" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
      {/* Micro sparkle */}
      <circle cx="7" cy="6.5" r="1" fill="currentColor" opacity="0.3" />
      <path d="M7 5.5V7.5M6 6.5H8" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
    </svg>
  ),
  hive: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="hex-top" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="hex-side" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {/* Top hex - brightest, front-facing */}
      <path d="M16 1.5L21.5 4.5V10.5L16 13.5L10.5 10.5V4.5L16 1.5Z" fill="url(#hex-top)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      {/* Top hex upper facet highlight */}
      <path d="M10.5 4.5L16 1.5L21.5 4.5L16 7.5L10.5 4.5Z" fill="currentColor" opacity="0.15" />
      {/* Bottom-left hex */}
      <path d="M8 13.5L13.5 16.5V22.5L8 25.5L2.5 22.5V16.5L8 13.5Z" fill="url(#hex-side)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.5 16.5L8 13.5L13.5 16.5L8 19.5L2.5 16.5Z" fill="currentColor" opacity="0.1" />
      {/* Bottom-right hex */}
      <path d="M24 13.5L29.5 16.5V22.5L24 25.5L18.5 22.5V16.5L24 13.5Z" fill="url(#hex-side)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M18.5 16.5L24 13.5L29.5 16.5L24 19.5L18.5 16.5Z" fill="currentColor" opacity="0.1" />
      {/* Shared edge glow lines */}
      <line x1="13.5" y1="10.5" x2="13.5" y2="16.5" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      <line x1="18.5" y1="10.5" x2="18.5" y2="16.5" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      {/* Joint nodes */}
      <circle cx="13.5" cy="13.5" r="1.2" fill="currentColor" opacity="0.35" />
      <circle cx="18.5" cy="13.5" r="1.2" fill="currentColor" opacity="0.35" />
      <circle cx="16" cy="16.5" r="1" fill="currentColor" opacity="0.2" />
    </svg>
  ),
  memory: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <radialGradient id="mem-core" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
        </radialGradient>
        <radialGradient id="mem-node" cx="0.35" cy="0.3" r="0.65">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      {/* Orbit ring */}
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="0.4" opacity="0.08" strokeDasharray="1.5 3" />
      {/* Connection lines with glow */}
      <line x1="16" y1="12" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <line x1="19.2" y1="13.2" x2="25.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <line x1="19" y1="19" x2="24.5" y2="23.5" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
      <line x1="13" y1="19" x2="7.5" y2="23.5" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
      <line x1="12.8" y1="13.2" x2="6.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      {/* Central node - 3D sphere */}
      <circle cx="16" cy="16" r="4.5" fill="url(#mem-core)" />
      <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      {/* Sphere highlight */}
      <ellipse cx="14.5" cy="14" rx="2" ry="1.5" fill="currentColor" opacity="0.12" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" opacity="0.4" />
      <circle cx="15" cy="15" r="0.6" fill="currentColor" opacity="0.25" />
      {/* Outer nodes - 3D spheres */}
      <circle cx="16" cy="4" r="2.8" fill="url(#mem-node)" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="15.2" cy="3.2" rx="1" ry="0.7" fill="currentColor" opacity="0.15" />
      <circle cx="27" cy="9" r="2.3" fill="url(#mem-node)" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="26.3" cy="8.3" rx="0.8" ry="0.6" fill="currentColor" opacity="0.15" />
      <circle cx="25.5" cy="24" r="2.3" fill="url(#mem-node)" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="24.8" cy="23.3" rx="0.8" ry="0.6" fill="currentColor" opacity="0.12" />
      <circle cx="6.5" cy="24" r="2.3" fill="url(#mem-node)" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="5.8" cy="23.3" rx="0.8" ry="0.6" fill="currentColor" opacity="0.12" />
      <circle cx="5" cy="9" r="2.3" fill="url(#mem-node)" stroke="currentColor" strokeWidth="1.1" />
      <ellipse cx="4.3" cy="8.3" rx="0.8" ry="0.6" fill="currentColor" opacity="0.15" />
    </svg>
  ),
  teams: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <radialGradient id="team-orb" cx="0.4" cy="0.35" r="0.65">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </radialGradient>
      </defs>
      {/* Left sphere */}
      <circle cx="11.5" cy="12" r="7.5" fill="url(#team-orb)" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="9.5" cy="10" rx="3" ry="2" fill="currentColor" opacity="0.08" />
      {/* Right sphere */}
      <circle cx="20.5" cy="12" r="7.5" fill="url(#team-orb)" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="18.5" cy="10" rx="3" ry="2" fill="currentColor" opacity="0.08" />
      {/* Bottom sphere */}
      <circle cx="16" cy="20" r="7.5" fill="url(#team-orb)" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="14" cy="18" rx="3" ry="2" fill="currentColor" opacity="0.08" />
      {/* Intersections - brighter where overlapping */}
      <ellipse cx="16" cy="10.5" rx="3" ry="4" fill="currentColor" opacity="0.08" />
      <ellipse cx="13" cy="17.5" rx="3" ry="3.5" fill="currentColor" opacity="0.06" />
      <ellipse cx="19" cy="17.5" rx="3" ry="3.5" fill="currentColor" opacity="0.06" />
      {/* Triple intersection core - brightest */}
      <circle cx="16" cy="15" r="2.5" fill="currentColor" opacity="0.18" />
      <circle cx="16" cy="15" r="1.2" fill="currentColor" opacity="0.3" />
      <circle cx="15.5" cy="14.3" r="0.5" fill="currentColor" opacity="0.15" />
    </svg>
  ),
  history: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="clock-face" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="hand-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Shadow under clock */}
      <ellipse cx="16" cy="28" rx="10" ry="1.5" fill="currentColor" opacity="0.05" />
      {/* Outer atmospheric ring */}
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="0.4" opacity="0.06" strokeDasharray="1 3" />
      {/* Clock face fill */}
      <circle cx="16" cy="16" r="11.5" fill="url(#clock-face)" />
      {/* Main ring with gap */}
      <path d="M16 4C9.37 4 4 9.37 4 16C4 22.63 9.37 28 16 28C22.63 28 28 22.63 28 16C28 12.69 26.67 9.7 24.49 7.51" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* Inner ring glow */}
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
      {/* Rewind arrow */}
      <path d="M24.5 3L25 8L20 7.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24.5 3L25 8L20 7.2" fill="currentColor" opacity="0.1" />
      {/* Hour marks - 3D dots */}
      <circle cx="16" cy="6" r="1" fill="currentColor" opacity="0.3" />
      <circle cx="26" cy="16" r="1" fill="currentColor" opacity="0.25" />
      <circle cx="16" cy="26" r="1" fill="currentColor" opacity="0.2" />
      <circle cx="6" cy="16" r="1" fill="currentColor" opacity="0.25" />
      {/* Smaller tick marks */}
      <circle cx="21.5" cy="7.5" r="0.5" fill="currentColor" opacity="0.15" />
      <circle cx="24.5" cy="10.5" r="0.5" fill="currentColor" opacity="0.15" />
      <circle cx="24.5" cy="21.5" r="0.5" fill="currentColor" opacity="0.12" />
      <circle cx="21.5" cy="24.5" r="0.5" fill="currentColor" opacity="0.12" />
      <circle cx="10.5" cy="24.5" r="0.5" fill="currentColor" opacity="0.12" />
      <circle cx="7.5" cy="21.5" r="0.5" fill="currentColor" opacity="0.12" />
      {/* Hour hand - thick, lit */}
      <line x1="16" y1="10.5" x2="16" y2="16" stroke="url(#hand-lit)" strokeWidth="2" strokeLinecap="round" />
      {/* Minute hand */}
      <line x1="16" y1="16" x2="20.5" y2="18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      {/* Center hub - 3D */}
      <circle cx="16" cy="16" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="16" cy="16" r="1.3" fill="currentColor" opacity="0.5" />
      <circle cx="15.3" cy="15.3" r="0.5" fill="currentColor" opacity="0.2" />
    </svg>
  ),
  stats: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="bar1" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="bar2" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="bar3" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* Floor shadow */}
      <path d="M3 28.5H29" stroke="currentColor" strokeWidth="0.4" opacity="0.1" />
      {/* Grid lines */}
      <line x1="4" y1="22" x2="28" y2="22" stroke="currentColor" strokeWidth="0.3" opacity="0.06" strokeDasharray="2 2" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="0.3" opacity="0.06" strokeDasharray="2 2" />
      <line x1="4" y1="10" x2="28" y2="10" stroke="currentColor" strokeWidth="0.3" opacity="0.06" strokeDasharray="2 2" />
      {/* Bar 1 - short, 3D with side face */}
      <rect x="5" y="19" width="5.5" height="9" rx="1.5" fill="url(#bar1)" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5" y="19" width="2.5" height="9" rx="0.5" fill="currentColor" opacity="0.06" />
      <rect x="5" y="19" width="5.5" height="1.5" rx="0.5" fill="currentColor" opacity="0.1" />
      {/* Bar 2 - medium */}
      <rect x="13" y="12" width="5.5" height="16" rx="1.5" fill="url(#bar2)" stroke="currentColor" strokeWidth="1.2" />
      <rect x="13" y="12" width="2.5" height="16" rx="0.5" fill="currentColor" opacity="0.06" />
      <rect x="13" y="12" width="5.5" height="1.5" rx="0.5" fill="currentColor" opacity="0.12" />
      {/* Bar 3 - tall */}
      <rect x="21" y="5" width="5.5" height="23" rx="1.5" fill="url(#bar3)" stroke="currentColor" strokeWidth="1.2" />
      <rect x="21" y="5" width="2.5" height="23" rx="0.5" fill="currentColor" opacity="0.06" />
      <rect x="21" y="5" width="5.5" height="1.5" rx="0.5" fill="currentColor" opacity="0.15" />
      {/* Trend line */}
      <path d="M7.5 18L15.5 11L23.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" opacity="0.4" />
      {/* Trend dots - 3D */}
      <circle cx="7.5" cy="18" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="7.5" cy="18" r="1.2" fill="currentColor" opacity="0.35" />
      <circle cx="15.5" cy="11" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="15.5" cy="11" r="1.2" fill="currentColor" opacity="0.35" />
      <circle cx="23.5" cy="4" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="23.5" cy="4" r="1.2" fill="currentColor" opacity="0.35" />
    </svg>
  ),
  config: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <linearGradient id="oct-face" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
        <radialGradient id="oct-ring" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
        </radialGradient>
      </defs>
      {/* Outer octagon - 3D body */}
      <path d="M11 2.5H21L29.5 11V21L21 29.5H11L2.5 21V11L11 2.5Z" fill="url(#oct-face)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      {/* Top facet highlight */}
      <path d="M11 2.5H21L16 8L11 2.5Z" fill="currentColor" opacity="0.08" />
      {/* Left facet - slightly lit */}
      <path d="M2.5 11L11 2.5L8 16L2.5 21V11Z" fill="currentColor" opacity="0.05" />
      {/* Inner octagon */}
      <path d="M13.5 7.5H18.5L23.5 12.5V19.5L18.5 24.5H13.5L8.5 19.5V12.5L13.5 7.5Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" opacity="0.3" />
      <path d="M13.5 7.5H18.5L23.5 12.5V19.5L18.5 24.5H13.5L8.5 19.5V12.5L13.5 7.5Z" fill="currentColor" opacity="0.04" />
      {/* Center ring - 3D */}
      <circle cx="16" cy="16" r="4" fill="url(#oct-ring)" />
      <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1.3" />
      {/* Ring highlight */}
      <ellipse cx="14.8" cy="14.5" rx="1.8" ry="1.2" fill="currentColor" opacity="0.08" />
      {/* Center dot */}
      <circle cx="16" cy="16" r="1.5" fill="currentColor" opacity="0.45" />
      <circle cx="15.4" cy="15.4" r="0.5" fill="currentColor" opacity="0.2" />
      {/* Vertex accents */}
      <circle cx="11" cy="2.5" r="1" fill="currentColor" opacity="0.2" />
      <circle cx="21" cy="2.5" r="1" fill="currentColor" opacity="0.2" />
      <circle cx="29.5" cy="11" r="1" fill="currentColor" opacity="0.15" />
      <circle cx="29.5" cy="21" r="1" fill="currentColor" opacity="0.1" />
      <circle cx="21" cy="29.5" r="0.8" fill="currentColor" opacity="0.08" />
      <circle cx="11" cy="29.5" r="0.8" fill="currentColor" opacity="0.08" />
      <circle cx="2.5" cy="21" r="0.8" fill="currentColor" opacity="0.1" />
      <circle cx="2.5" cy="11" r="1" fill="currentColor" opacity="0.15" />
    </svg>
  ),
  orchestrator: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <defs>
        <radialGradient id="orch-core" cx="0.4" cy="0.3" r="0.6">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id="orch-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* Outer orbit ring */}
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="0.5" opacity="0.08" strokeDasharray="2 4" />
      {/* Middle orbit ring */}
      <ellipse cx="16" cy="16" rx="10" ry="10" stroke="url(#orch-ring)" strokeWidth="0.8" strokeDasharray="3 2" />
      {/* Orbital path arcs */}
      <path d="M6 16C6 10.5 10.5 6 16 6" stroke="currentColor" strokeWidth="0.6" opacity="0.15" />
      <path d="M26 16C26 21.5 21.5 26 16 26" stroke="currentColor" strokeWidth="0.6" opacity="0.15" />
      {/* Central core - 3D sphere */}
      <circle cx="16" cy="16" r="5" fill="url(#orch-core)" />
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.4" />
      {/* Core specular */}
      <ellipse cx="14.5" cy="14" rx="2.2" ry="1.5" fill="currentColor" opacity="0.12" />
      <circle cx="16" cy="16" r="2" fill="currentColor" opacity="0.35" />
      <circle cx="15" cy="15" r="0.7" fill="currentColor" opacity="0.2" />
      {/* Satellite nodes on orbit */}
      <circle cx="16" cy="4" r="2.2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1" />
      <circle cx="15.3" cy="3.3" r="0.5" fill="currentColor" opacity="0.15" />
      <circle cx="27" cy="11" r="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
      <circle cx="26.3" cy="10.3" r="0.5" fill="currentColor" opacity="0.12" />
      <circle cx="27" cy="21" r="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="11" r="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="21" r="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
      <circle cx="16" cy="28" r="2.2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" />
      {/* Connection beams from core */}
      <line x1="16" y1="11" x2="16" y2="5.8" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="20" y1="13" x2="25.2" y2="11.5" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      <line x1="20" y1="19" x2="25.2" y2="20.5" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      <line x1="12" y1="19" x2="6.8" y2="20.5" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      <line x1="12" y1="13" x2="6.8" y2="11.5" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      <line x1="16" y1="21" x2="16" y2="26.2" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      {/* Energy pulse rings */}
      <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="0.4" opacity="0.1" />
    </svg>
  ),
}

// Convert hex to rgba helper
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Compact Panel Item
function PanelItem({ label, icon, accent, onClick, badge }: {
  label: string
  icon: string
  accent: string
  onClick: () => void
  badge?: number
}) {
  const IconComponent = GeometricIcons[icon]

  return (
    <button
      onClick={onClick}
      className="panel-item relative flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 transition-all duration-200 active:scale-[0.96]"
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div className="relative">
        {/* Hover glow */}
        <div
          className="panel-glow absolute -inset-1.5 rounded-xl pointer-events-none transition-opacity duration-300"
          style={{ backgroundColor: accent, opacity: 0, filter: 'blur(10px)' }}
        />

        {/* Icon box */}
        <div
          className="panel-icon-box relative w-9 h-9 rounded-[10px] flex items-center justify-center transition-all duration-200"
          style={{
            background: `linear-gradient(145deg, ${hexToRgba(accent, 0.1)}, ${hexToRgba(accent, 0.03)})`,
            border: `1px solid ${hexToRgba(accent, 0.1)}`,
            boxShadow: `inset 0 1px 0 ${hexToRgba(accent, 0.06)}`,
          }}
        >
          {/* Badge */}
          {badge !== undefined && badge > 0 && (
            <div
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[7px] font-bold flex items-center justify-center z-20"
              style={{
                background: hexToRgba(accent, 0.2),
                color: accent,
                border: `1px solid ${hexToRgba(accent, 0.25)}`,
              }}
            >
              {badge > 99 ? '99+' : badge}
            </div>
          )}

          {/* Icon */}
          {IconComponent && (
            <div
              className="panel-icon-wrap relative z-10 transition-all duration-200"
              style={{ color: accent, opacity: 0.6 }}
            >
              <IconComponent className="w-[18px] h-[18px]" />
            </div>
          )}
        </div>
      </div>

      {/* Label */}
      <span
        className="panel-label text-[10px] font-medium tracking-wider uppercase transition-colors duration-200"
        style={{ color: 'rgba(156,163,175,0.6)' }}
      >
        {label}
      </span>

      {/* Hover underline */}
      <div
        className="panel-underline absolute bottom-1.5 left-1/2 h-[1.5px] rounded-full pointer-events-none transition-all duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          width: 0,
          transform: 'translateX(-50%)'
        }}
      />
    </button>
  )
}

function QuickAction({ icon: Icon, label, onClick, color, badge }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  color: 'blue' | 'orange' | 'purple' | 'gray'
  badge?: number
}) {
  const colors = {
    blue: {
      bg: 'bg-blue-500/10 group-hover:bg-blue-500/20',
      icon: 'text-blue-400',
      border: 'hover:border-blue-500/40',
      glow: 'group-hover:shadow-blue-500/20',
      badge: 'bg-blue-500/20 text-blue-300'
    },
    orange: {
      bg: 'bg-[#cc785c]/10 group-hover:bg-[#cc785c]/25',
      icon: 'text-[#cc785c]',
      border: 'hover:border-[#cc785c]/40',
      glow: 'group-hover:shadow-[#cc785c]/20',
      badge: 'bg-[#cc785c]/20 text-[#e8956e]'
    },
    purple: {
      bg: 'bg-purple-500/10 group-hover:bg-purple-500/20',
      icon: 'text-purple-400',
      border: 'hover:border-purple-500/40',
      glow: 'group-hover:shadow-purple-500/20',
      badge: 'bg-purple-500/20 text-purple-300'
    },
    gray: {
      bg: 'bg-gray-500/10 group-hover:bg-gray-500/20',
      icon: 'text-gray-400',
      border: 'hover:border-gray-500/30',
      glow: 'group-hover:shadow-gray-500/10',
      badge: 'bg-gray-500/20 text-gray-400'
    }
  }
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] ${colors[color].border} p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg ${colors[color].glow} backdrop-blur-sm`}
    >
      {badge !== undefined && (
        <div className={`absolute -top-1.5 -right-1.5 px-2 py-0.5 rounded-full ${colors[color].badge} text-[10px] font-semibold shadow-lg`}>
          {badge}
        </div>
      )}
      <div className={`relative w-11 h-11 rounded-xl ${colors[color].bg} flex items-center justify-center transition-all duration-300 group-hover:scale-110`}>
        <Icon className={`w-5 h-5 ${colors[color].icon} transition-all duration-300`} />
      </div>
      <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors duration-300">{label}</span>
    </button>
  )
}
