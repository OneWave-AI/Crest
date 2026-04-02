import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Folder,
  Activity,
  MessageSquare,
  Timer,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronRight,
  ChevronDown,
  Loader2,
  Code2,
  Calendar,
  Zap,
  Hash,
  FileText,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  X
} from 'lucide-react'
import type { Conversation } from '../../../shared/types'
import UsageDashboard from './UsageDashboard'

interface AnalyticsScreenProps {
  onBack: () => void
}

type Period = '7days' | '30days' | 'all'
type Tab = 'overview' | 'projects' | 'activity' | 'usage'

interface ProjectDetail {
  folder: string
  name: string
  totalSessions: number
  totalTimeMinutes: number
  totalTokens: number
  totalMessages: number
  lastActive: number
  firstActive: number
  avgSessionLength: number
  longestSession: number
  sessionsPerDay: number
  recentTrend: 'up' | 'down' | 'stable'
  dailyActivity: { date: string; sessions: number; minutes: number }[]
  sessions: {
    id: string
    timestamp: number
    duration: number
    messages: number
    tokens: number
  }[]
}

interface AnalyticsData {
  totalSessions: number
  totalTimeMinutes: number
  totalTokens: number
  totalMessages: number
  totalProjects: number
  sessions7Days: number
  sessions30Days: number
  time7Days: number
  time30Days: number
  tokens7Days: number
  tokens30Days: number
  projectDetails: ProjectDetail[]
  dailyActivity: { date: string; sessions: number; minutes: number; tokens: number }[]
  hourlyActivity: number[]
  weekdayActivity: number[]
  avgSessionLength: number
  mostActiveDay: string
  mostActiveHour: number
  longestSession: number
  trend7Day: number // percentage change from previous 7 days
  trend30Day: number
}

export default function AnalyticsScreen({ onBack }: AnalyticsScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [period, setPeriod] = useState<Period>('7days')
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  // Load analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true)
      try {
        const conversations: Conversation[] = await window.api.listConversations()
        console.log('[Analytics] Loaded conversations:', conversations.length)

        // Debug: Log sample conversation data
        if (conversations.length > 0) {
          console.log('[Analytics] Sample conversation:', {
            timestamp: conversations[0].timestamp,
            date: new Date(conversations[0].timestamp).toISOString(),
            stats: conversations[0].stats,
            projectFolder: conversations[0].projectFolder
          })
        }

        const now = new Date()
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

        let sessions7Days = 0, sessions7DaysPrev = 0
        let sessions30Days = 0, sessions30DaysPrev = 0
        let time7Days = 0, time7DaysPrev = 0
        let time30Days = 0, time30DaysPrev = 0
        let tokens7Days = 0, tokens30Days = 0
        let totalTokens = 0, totalMessages = 0, totalMinutes = 0
        let longestSession = 0

        // Track projects with detailed stats
        const projectMap = new Map<string, ProjectDetail>()

        // Track daily activity for chart (last 30 days)
        // Use local date strings to avoid timezone issues
        const getLocalDateStr = (d: Date) => {
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        const dailyMap = new Map<string, { sessions: number; minutes: number; tokens: number }>()
        for (let i = 29; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const dateStr = getLocalDateStr(date)
          dailyMap.set(dateStr, { sessions: 0, minutes: 0, tokens: 0 })
        }

        // Track hourly and weekday activity
        const hourlyActivity = new Array(24).fill(0)
        const weekdayActivity = new Array(7).fill(0)

        for (const conv of conversations) {
          const convDate = new Date(conv.timestamp)
          const convDateStr = getLocalDateStr(convDate)
          const hour = convDate.getHours()
          const weekday = convDate.getDay()

          // Get REAL stats from conversation
          // Cap duration at 8 hours (480 min) per session - prevents inflated stats from idle conversations
          const rawDurationMinutes = conv.stats?.duration
            ? Math.round(conv.stats.duration / 1000 / 60)
            : 10
          const durationMinutes = Math.min(rawDurationMinutes, 480) // Max 8 hours per session
          const tokens = conv.stats?.estimatedTokens || 2500
          const messages = conv.stats?.messageCount || 0

          // Track longest session
          if (durationMinutes > longestSession) {
            longestSession = durationMinutes
          }

          // Time period stats with comparison
          if (convDate >= sevenDaysAgo) {
            sessions7Days++
            time7Days += durationMinutes
            tokens7Days += tokens
          } else if (convDate >= fourteenDaysAgo) {
            sessions7DaysPrev++
            time7DaysPrev += durationMinutes
          }

          if (convDate >= thirtyDaysAgo) {
            sessions30Days++
            time30Days += durationMinutes
            tokens30Days += tokens
          } else if (convDate >= sixtyDaysAgo) {
            sessions30DaysPrev++
            time30DaysPrev += durationMinutes
          }

          // Daily activity
          const dayData = dailyMap.get(convDateStr)
          if (dayData) {
            dayData.sessions++
            dayData.minutes += durationMinutes
            dayData.tokens += tokens
          } else {
            // Debug: conversation date not in 30-day range
            console.log('[Analytics] Conv date not in range:', convDateStr, 'timestamp:', conv.timestamp)
          }

          // Hourly and weekday activity
          hourlyActivity[hour]++
          weekdayActivity[weekday]++

          // Project detailed stats
          if (conv.projectFolder) {
            let project = projectMap.get(conv.projectFolder)
            if (!project) {
              // Initialize project daily activity - use same local date format as global dailyMap
              const projectDaily = new Map<string, { sessions: number; minutes: number }>()
              for (let i = 29; i >= 0; i--) {
                const date = new Date(now)
                date.setDate(date.getDate() - i)
                const dateStr = getLocalDateStr(date)
                projectDaily.set(dateStr, { sessions: 0, minutes: 0 })
              }

              // Create a readable project name from the path
              // Handle paths like /Users/gabe/project or -Users-gabe-project
              const projectName = getProjectName(conv.projectFolder)

              project = {
                folder: conv.projectFolder,
                name: projectName,
                totalSessions: 0,
                totalTimeMinutes: 0,
                totalTokens: 0,
                totalMessages: 0,
                lastActive: 0,
                firstActive: conv.timestamp,
                avgSessionLength: 0,
                longestSession: 0,
                sessionsPerDay: 0,
                recentTrend: 'stable',
                dailyActivity: [],
                sessions: []
              }
              projectMap.set(conv.projectFolder, project)
            }

            project.totalSessions++
            project.totalTimeMinutes += durationMinutes
            project.totalTokens += tokens
            project.totalMessages += messages

            if (conv.timestamp > project.lastActive) {
              project.lastActive = conv.timestamp
            }
            if (conv.timestamp < project.firstActive) {
              project.firstActive = conv.timestamp
            }
            if (durationMinutes > project.longestSession) {
              project.longestSession = durationMinutes
            }

            // Add session detail
            project.sessions.push({
              id: conv.id,
              timestamp: conv.timestamp,
              duration: durationMinutes,
              messages,
              tokens
            })
          }

          totalTokens += tokens
          totalMessages += messages
          totalMinutes += durationMinutes
        }

        // Calculate project-level analytics
        const projectDetails: ProjectDetail[] = []
        for (const project of projectMap.values()) {
          // Calculate average session length
          project.avgSessionLength = project.totalSessions > 0
            ? Math.round(project.totalTimeMinutes / project.totalSessions)
            : 0

          // Calculate sessions per day (over active period)
          const activeDays = Math.max(1, Math.ceil((project.lastActive - project.firstActive) / (24 * 60 * 60 * 1000)))
          project.sessionsPerDay = Math.round((project.totalSessions / activeDays) * 10) / 10

          // Calculate recent trend (compare last 7 days vs previous 7 days)
          const recentSessions = project.sessions.filter(s => s.timestamp >= sevenDaysAgo.getTime()).length
          const prevSessions = project.sessions.filter(s =>
            s.timestamp >= fourteenDaysAgo.getTime() && s.timestamp < sevenDaysAgo.getTime()
          ).length

          if (recentSessions > prevSessions * 1.2) {
            project.recentTrend = 'up'
          } else if (recentSessions < prevSessions * 0.8) {
            project.recentTrend = 'down'
          } else {
            project.recentTrend = 'stable'
          }

          // Build daily activity for project - use consistent local date format
          const projectDailyMap = new Map<string, { sessions: number; minutes: number }>()
          for (let i = 29; i >= 0; i--) {
            const date = new Date(now)
            date.setDate(date.getDate() - i)
            const dateStr = getLocalDateStr(date)
            projectDailyMap.set(dateStr, { sessions: 0, minutes: 0 })
          }

          for (const session of project.sessions) {
            const dateStr = getLocalDateStr(new Date(session.timestamp))
            const dayData = projectDailyMap.get(dateStr)
            if (dayData) {
              dayData.sessions++
              dayData.minutes += session.duration
            }
          }

          project.dailyActivity = Array.from(projectDailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))

          // Sort sessions by timestamp (newest first)
          project.sessions.sort((a, b) => b.timestamp - a.timestamp)

          projectDetails.push(project)
        }

        // Sort projects by time spent
        projectDetails.sort((a, b) => b.totalTimeMinutes - a.totalTimeMinutes)

        // Convert daily activity to array
        const dailyActivity = Array.from(dailyMap.entries())
          .map(([date, data]) => ({ date, ...data }))

        // Debug: Log daily activity summary
        const activeDays = dailyActivity.filter(d => d.sessions > 0)
        console.log('[Analytics] Daily activity:', {
          totalDays: dailyActivity.length,
          activeDays: activeDays.length,
          sample: activeDays.slice(0, 3)
        })

        // Find most active day and hour
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const maxDayIndex = weekdayActivity.indexOf(Math.max(...weekdayActivity))
        const mostActiveDay = dayNames[maxDayIndex]
        const mostActiveHour = hourlyActivity.indexOf(Math.max(...hourlyActivity))

        // Calculate trends
        const trend7Day = sessions7DaysPrev > 0
          ? Math.round(((sessions7Days - sessions7DaysPrev) / sessions7DaysPrev) * 100)
          : 0
        const trend30Day = sessions30DaysPrev > 0
          ? Math.round(((sessions30Days - sessions30DaysPrev) / sessions30DaysPrev) * 100)
          : 0

        setAnalytics({
          totalSessions: conversations.length,
          totalTimeMinutes: totalMinutes,
          totalTokens,
          totalMessages,
          totalProjects: projectMap.size,
          sessions7Days,
          sessions30Days,
          time7Days,
          time30Days,
          tokens7Days,
          tokens30Days,
          projectDetails,
          dailyActivity,
          hourlyActivity,
          weekdayActivity,
          avgSessionLength: conversations.length > 0 ? Math.round(totalMinutes / conversations.length) : 0,
          mostActiveDay,
          mostActiveHour,
          longestSession,
          trend7Day,
          trend30Day
        })
      } catch (error) {
        console.error('Failed to load analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [])

  // Filter stats based on period
  const filteredStats = useMemo(() => {
    if (!analytics) return null

    switch (period) {
      case '7days':
        return {
          sessions: analytics.sessions7Days,
          time: analytics.time7Days,
          tokens: analytics.tokens7Days,
          trend: analytics.trend7Day,
          projects: analytics.projectDetails.filter(p =>
            p.lastActive >= Date.now() - 7 * 24 * 60 * 60 * 1000
          )
        }
      case '30days':
        return {
          sessions: analytics.sessions30Days,
          time: analytics.time30Days,
          tokens: analytics.tokens30Days,
          trend: analytics.trend30Day,
          projects: analytics.projectDetails.filter(p =>
            p.lastActive >= Date.now() - 30 * 24 * 60 * 60 * 1000
          )
        }
      default:
        return {
          sessions: analytics.totalSessions,
          time: analytics.totalTimeMinutes,
          tokens: analytics.totalTokens,
          trend: 0,
          projects: analytics.projectDetails
        }
    }
  }, [analytics, period])

  const toggleProjectExpanded = (folder: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder)
    } else {
      newExpanded.add(folder)
    }
    setExpandedProjects(newExpanded)
  }

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/[0.06] rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#cc785c]/10">
              <BarChart3 size={16} className="text-[#cc785c]" />
            </div>
            <h1 className="text-lg font-semibold text-white">Analytics</h1>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg">
          {(['7days', '30days', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-[#cc785c] text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              {p === '7days' ? '7 Days' : p === '30days' ? '30 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-white/[0.06]">
        {(['overview', 'usage', 'projects', 'activity'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedProject(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white/[0.08] text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#cc785c] animate-spin" />
          </div>
        ) : analytics && filteredStats ? (
          <>
            {/* Project Detail Modal */}
            {selectedProject && (
              <ProjectDetailModal
                project={selectedProject}
                onClose={() => setSelectedProject(null)}
              />
            )}

            {activeTab === 'overview' && (
              <OverviewTab
                analytics={analytics}
                filteredStats={filteredStats}
                period={period}
                onProjectClick={setSelectedProject}
                onViewAllProjects={() => setActiveTab('projects')}
              />
            )}
            {activeTab === 'projects' && (
              <ProjectsTab
                projects={filteredStats.projects}
                period={period}
                expandedProjects={expandedProjects}
                onToggleExpand={toggleProjectExpanded}
                onProjectClick={setSelectedProject}
              />
            )}
            {activeTab === 'activity' && (
              <ActivityTab analytics={analytics} />
            )}
            {activeTab === 'usage' && (
              <UsageDashboard />
            )}
          </>
        ) : (
          <div className="text-center text-gray-500 py-12">No analytics data available</div>
        )}
      </div>
    </div>
  )
}

// Project Detail Modal
function ProjectDetailModal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#141416] rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden border border-white/[0.08]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#cc785c]/10 flex items-center justify-center">
              <Code2 size={20} className="text-[#cc785c]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{project.name}</h2>
              <p className="text-xs text-gray-500 truncate max-w-md">{project.folder}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-lg text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatBox label="Total Time" value={formatMinutes(project.totalTimeMinutes)} color="orange" />
            <StatBox label="Sessions" value={project.totalSessions} color="blue" />
            <StatBox label="Messages" value={project.totalMessages} color="purple" />
            <StatBox label="Tokens" value={formatNumber(project.totalTokens)} color="green" />
          </div>

          {/* Insights */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
              <span className="text-xs text-gray-500">Avg Session</span>
              <p className="text-xl font-bold text-white mt-1">{project.avgSessionLength}m</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
              <span className="text-xs text-gray-500">Longest Session</span>
              <p className="text-xl font-bold text-white mt-1">{formatMinutes(project.longestSession)}</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
              <span className="text-xs text-gray-500">Sessions/Day</span>
              <p className="text-xl font-bold text-white mt-1">{project.sessionsPerDay}</p>
            </div>
          </div>

          {/* Activity Chart */}
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-6">
            <h4 className="text-sm font-medium text-white mb-4">30-Day Activity</h4>
            <div className="flex items-end gap-1 h-20">
              {project.dailyActivity.map((day, i) => {
                const maxMins = Math.max(...project.dailyActivity.map(d => d.minutes), 1)
                const height = day.minutes > 0 ? Math.max((day.minutes / maxMins) * 100, 5) : 3
                const isToday = i === project.dailyActivity.length - 1

                return (
                  <div
                    key={day.date}
                    className="flex-1 group relative"
                    title={`${day.date}: ${day.sessions} sessions, ${day.minutes}m`}
                  >
                    <div
                      className={`w-full rounded-sm transition-all ${
                        isToday ? 'bg-[#cc785c]' :
                        day.minutes > 0 ? 'bg-[#cc785c]/40' : 'bg-white/[0.06]'
                      }`}
                      style={{ height: `${(height / 100) * 80}px` }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Sessions */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Recent Sessions</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {project.sessions.slice(0, 10).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <Calendar size={14} className="text-gray-500" />
                    <span className="text-sm text-gray-300">
                      {new Date(session.timestamp).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Timer size={12} /> {session.duration}m
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} /> {session.messages}
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash size={12} /> {formatNumber(session.tokens)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Overview Tab
function OverviewTab({ analytics, filteredStats, period, onProjectClick, onViewAllProjects }: {
  analytics: AnalyticsData
  filteredStats: { sessions: number; time: number; tokens: number; trend: number; projects: ProjectDetail[] }
  period: Period
  onProjectClick: (p: ProjectDetail) => void
  onViewAllProjects: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Large stat cards with trends */}
      <div className="grid grid-cols-4 gap-4">
        <LargeStatCard
          icon={MessageSquare}
          label="Sessions"
          value={filteredStats.sessions}
          trend={period !== 'all' ? filteredStats.trend : undefined}
          color="orange"
        />
        <LargeStatCard
          icon={Timer}
          label="Time Coded"
          value={formatMinutes(filteredStats.time)}
          color="purple"
        />
        <LargeStatCard
          icon={Folder}
          label="Active Projects"
          value={filteredStats.projects.length}
          color="blue"
        />
        <LargeStatCard
          icon={Hash}
          label="Tokens Used"
          value={formatNumber(filteredStats.tokens)}
          color="green"
        />
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-4 gap-4">
        <InsightCard icon={Clock} label="Avg Session" value={`${analytics.avgSessionLength}m`} />
        <InsightCard icon={Zap} label="Longest Session" value={formatMinutes(analytics.longestSession)} />
        <InsightCard icon={Calendar} label="Most Active" value={analytics.mostActiveDay} />
        <InsightCard icon={Activity} label="Peak Hour" value={formatHour(analytics.mostActiveHour)} />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Daily Activity</h3>
            <span className="text-xs text-gray-500">Last 30 days</span>
          </div>
          <div className="flex items-end gap-1 h-32">
            {(analytics.dailyActivity.length > 0 ? analytics.dailyActivity :
              // Fallback: generate 30 empty days if no data (use local date format to match real data)
              Array.from({ length: 30 }, (_, i) => {
                const date = new Date()
                date.setDate(date.getDate() - (29 - i))
                const year = date.getFullYear()
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                return { date: `${year}-${month}-${day}`, sessions: 0, minutes: 0, tokens: 0 }
              })
            ).map((day, i, arr) => {
              const maxSessions = Math.max(...arr.map(d => d.sessions), 1)
              const height = day.sessions > 0 ? Math.max((day.sessions / maxSessions) * 100, 5) : 3
              const isToday = i === arr.length - 1

              return (
                <div
                  key={day.date}
                  className="flex-1 group cursor-pointer"
                  title={`${day.date}\n${day.sessions} sessions\n${day.minutes}m\n${formatNumber(day.tokens || 0)} tokens`}
                >
                  <div
                    className={`w-full rounded-sm transition-all group-hover:opacity-80 ${
                      isToday ? 'bg-gradient-to-t from-[#cc785c] to-[#e8956e]' :
                      day.sessions > 0 ? 'bg-[#cc785c]/40' : 'bg-white/[0.06]'
                    }`}
                    style={{ height: `${(height / 100) * 128}px` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-gray-600">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Top Projects */}
        <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Top Projects by Time</h3>
            <button
              onClick={onViewAllProjects}
              className="text-xs text-[#cc785c] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-3">
            {filteredStats.projects.slice(0, 5).map((project, i) => {
              const maxTime = filteredStats.projects[0]?.totalTimeMinutes || 1
              const percent = (project.totalTimeMinutes / maxTime) * 100

              return (
                <button
                  key={project.folder}
                  onClick={() => onProjectClick(project)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span className="text-xs text-gray-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-white truncate">{project.name}</span>
                      {project.recentTrend === 'up' && <ArrowUpRight size={12} className="text-green-400" />}
                      {project.recentTrend === 'down' && <ArrowDownRight size={12} className="text-red-400" />}
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#cc785c] to-[#e8956e] rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-[#cc785c]">{formatMinutes(project.totalTimeMinutes)}</span>
                    <p className="text-[10px] text-gray-600">{project.totalSessions} sessions</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Projects Tab
function ProjectsTab({ projects, period, expandedProjects, onToggleExpand, onProjectClick }: {
  projects: ProjectDetail[]
  period: Period
  expandedProjects: Set<string>
  onToggleExpand: (folder: string) => void
  onProjectClick: (p: ProjectDetail) => void
}) {
  const [sortBy, setSortBy] = useState<'time' | 'sessions' | 'recent' | 'messages'>('time')

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      switch (sortBy) {
        case 'time': return b.totalTimeMinutes - a.totalTimeMinutes
        case 'sessions': return b.totalSessions - a.totalSessions
        case 'recent': return b.lastActive - a.lastActive
        case 'messages': return b.totalMessages - a.totalMessages
      }
    })
  }, [projects, sortBy])

  // Calculate totals for header
  const totals = useMemo(() => ({
    time: projects.reduce((sum, p) => sum + p.totalTimeMinutes, 0),
    sessions: projects.reduce((sum, p) => sum + p.totalSessions, 0),
    messages: projects.reduce((sum, p) => sum + p.totalMessages, 0),
    tokens: projects.reduce((sum, p) => sum + p.totalTokens, 0)
  }), [projects])

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatBox label="Total Time" value={formatMinutes(totals.time)} color="orange" />
        <StatBox label="Total Sessions" value={totals.sessions} color="blue" />
        <StatBox label="Total Messages" value={formatNumber(totals.messages)} color="purple" />
        <StatBox label="Total Tokens" value={formatNumber(totals.tokens)} color="green" />
      </div>

      {/* Sort controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{sortedProjects.length} Projects</h3>
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg">
          {([
            { key: 'time', label: 'Time' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'messages', label: 'Messages' },
            { key: 'recent', label: 'Recent' }
          ] as const).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sortBy === s.key
                  ? 'bg-white/[0.1] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects list */}
      <div className="space-y-2">
        {sortedProjects.map((project) => {
          const isExpanded = expandedProjects.has(project.folder)

          return (
            <div key={project.folder} className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
              {/* Main row */}
              <div
                className="flex items-center p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => onToggleExpand(project.folder)}
              >
                <ChevronDown
                  size={16}
                  className={`text-gray-500 mr-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                />
                <div className="w-10 h-10 rounded-lg bg-[#cc785c]/10 flex items-center justify-center mr-3">
                  <Code2 size={18} className="text-[#cc785c]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">{project.name}</h4>
                    {project.recentTrend === 'up' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                        <TrendingUp size={10} /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate">{project.folder}</p>
                </div>
                <div className="grid grid-cols-4 gap-6 text-right">
                  <div>
                    <p className="text-sm font-medium text-[#cc785c]">{formatMinutes(project.totalTimeMinutes)}</p>
                    <p className="text-[10px] text-gray-600">time</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{project.totalSessions}</p>
                    <p className="text-[10px] text-gray-600">sessions</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{project.totalMessages}</p>
                    <p className="text-[10px] text-gray-600">messages</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{formatRelativeTime(project.lastActive)}</p>
                    <p className="text-[10px] text-gray-600">last active</p>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-white/[0.04]">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{project.avgSessionLength}m</p>
                      <p className="text-xs text-gray-500">avg session</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{formatMinutes(project.longestSession)}</p>
                      <p className="text-xs text-gray-500">longest</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{project.sessionsPerDay}</p>
                      <p className="text-xs text-gray-500">sessions/day</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{formatNumber(project.totalTokens)}</p>
                      <p className="text-xs text-gray-500">tokens</p>
                    </div>
                  </div>

                  {/* Mini activity chart */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">30-day activity</p>
                    <div className="flex items-end gap-px h-12">
                      {project.dailyActivity.map((day, i) => {
                        const maxMins = Math.max(...project.dailyActivity.map(d => d.minutes), 1)
                        const height = day.minutes > 0 ? Math.max((day.minutes / maxMins) * 100, 5) : 3
                        return (
                          <div
                            key={day.date}
                            className={`flex-1 rounded-sm ${
                              day.minutes > 0 ? 'bg-[#cc785c]/50' : 'bg-white/[0.06]'
                            }`}
                            style={{ height: `${(height / 100) * 48}px` }}
                            title={`${day.date}: ${day.minutes}m`}
                          />
                        )
                      })}
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); onProjectClick(project) }}
                    className="w-full py-2 text-sm text-[#cc785c] hover:bg-[#cc785c]/10 rounded-lg transition-colors"
                  >
                    View Full Details
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {sortedProjects.length === 0 && (
          <div className="text-center text-gray-500 py-12">No projects in this time period</div>
        )}
      </div>
    </div>
  )
}

// Activity Tab
function ActivityTab({ analytics }: { analytics: AnalyticsData }) {
  return (
    <div className="space-y-6">
      {/* 30-day activity chart */}
      <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white mb-4">30-Day Activity</h3>
        <div className="flex items-end gap-1 h-40">
          {analytics.dailyActivity.map((day, i) => {
            const maxSessions = Math.max(...analytics.dailyActivity.map(d => d.sessions), 1)
            const height = day.sessions > 0 ? Math.max((day.sessions / maxSessions) * 100, 5) : 3
            const isToday = i === analytics.dailyActivity.length - 1
            const date = new Date(day.date)

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center group cursor-pointer">
                <div className="relative w-full">
                  <div
                    className={`w-full rounded-sm transition-all group-hover:opacity-80 ${
                      isToday ? 'bg-gradient-to-t from-[#cc785c] to-[#e8956e]' :
                      day.sessions > 0 ? 'bg-[#cc785c]/40' : 'bg-white/[0.06]'
                    }`}
                    style={{ height: `${(height / 100) * 140}px` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-[#1a1a1a] border border-white/[0.1] rounded-lg p-2 text-xs whitespace-nowrap">
                      <p className="text-white font-medium">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      <p className="text-gray-400">{day.sessions} sessions</p>
                      <p className="text-gray-400">{day.minutes}m coded</p>
                      <p className="text-gray-400">{formatNumber(day.tokens)} tokens</p>
                    </div>
                  </div>
                </div>
                {(date.getDate() === 1 || i === 0 || isToday) && (
                  <span className="text-[8px] text-gray-600 mt-1">
                    {isToday ? 'Today' : `${date.getMonth() + 1}/${date.getDate()}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Hourly distribution */}
        <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white mb-4">Activity by Hour</h3>
          <div className="flex items-end gap-1 h-24">
            {analytics.hourlyActivity.map((count, hour) => {
              const maxCount = Math.max(...analytics.hourlyActivity, 1)
              const height = count > 0 ? Math.max((count / maxCount) * 100, 5) : 3
              const isPeak = hour === analytics.mostActiveHour

              return (
                <div key={hour} className="flex-1 flex flex-col items-center group" title={`${formatHour(hour)}: ${count} sessions`}>
                  <div
                    className={`w-full rounded-sm transition-all ${
                      isPeak ? 'bg-purple-500' :
                      count > 0 ? 'bg-purple-500/40' : 'bg-white/[0.06]'
                    }`}
                    style={{ height: `${(height / 100) * 96}px` }}
                  />
                  {hour % 6 === 0 && (
                    <span className="text-[8px] text-gray-600 mt-1">{hour}</span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Peak hour: <span className="text-white">{formatHour(analytics.mostActiveHour)}</span>
          </p>
        </div>

        {/* Weekday distribution */}
        <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white mb-4">Activity by Day</h3>
          <div className="space-y-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
              const count = analytics.weekdayActivity[i]
              const maxCount = Math.max(...analytics.weekdayActivity, 1)
              const percent = (count / maxCount) * 100
              const isMax = count === maxCount && count > 0

              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-8">{day}</span>
                  <div className="flex-1 h-4 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isMax ? 'bg-emerald-500' : 'bg-emerald-500/50'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Time breakdown */}
      <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white mb-4">Time Breakdown</h3>
        <div className="grid grid-cols-3 gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-1">Last 7 Days</p>
            <p className="text-2xl font-bold text-[#cc785c]">{formatMinutes(analytics.time7Days)}</p>
            <p className="text-xs text-gray-500 mt-1">{analytics.sessions7Days} sessions</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Last 30 Days</p>
            <p className="text-2xl font-bold text-[#cc785c]">{formatMinutes(analytics.time30Days)}</p>
            <p className="text-xs text-gray-500 mt-1">{analytics.sessions30Days} sessions</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">All Time</p>
            <p className="text-2xl font-bold text-[#cc785c]">{formatMinutes(analytics.totalTimeMinutes)}</p>
            <p className="text-xs text-gray-500 mt-1">{analytics.totalSessions} sessions</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Reusable components
function LargeStatCard({ icon: Icon, label, value, trend, color }: {
  icon: React.ComponentType<{ className?: string; size?: string | number }>
  label: string
  value: string | number
  trend?: number
  color: 'orange' | 'blue' | 'green' | 'purple'
}) {
  const colors = {
    orange: { bg: 'bg-[#cc785c]/10', icon: 'text-[#cc785c]' },
    blue: { bg: 'bg-blue-500/10', icon: 'text-blue-400' },
    green: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400' },
    purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400' }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${colors[color].bg}`}>
            <Icon size={16} className={colors[color].icon} />
          </div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
        </div>
        {trend !== undefined && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: 'orange' | 'blue' | 'green' | 'purple' }) {
  const colors = {
    orange: 'bg-[#cc785c]/10 border-[#cc785c]/20',
    blue: 'bg-blue-500/10 border-blue-500/20',
    green: 'bg-emerald-500/10 border-emerald-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20'
  }

  return (
    <div className={`${colors[color]} border rounded-xl p-4`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  )
}

function InsightCard({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string; size?: string | number }>
  label: string
  value: string
}) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-500" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
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

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

// Helper to create readable project names from folder paths
// Handles both /Users/gabe/project and -Users-gabe-project formats
function getProjectName(folder: string): string {
  // Normalize the path - handle dash-separated format from Claude
  // e.g., "-Users-gabe-myproject" -> "/Users/gabe/myproject"
  let normalizedPath = folder
  if (folder.startsWith('-')) {
    normalizedPath = folder.replace(/-/g, '/')
  }

  // Split path into segments
  const segments = normalizedPath.split('/').filter(Boolean)

  // If we have enough segments, return last 2 for context
  // e.g., /Users/gabe/Code/myproject -> "Code/myproject"
  // e.g., /Users/gabe/myproject -> "gabe/myproject"
  if (segments.length >= 2) {
    // Skip common base directories for cleaner names
    const skipDirs = ['Users', 'home', 'var', 'tmp', 'opt']
    let startIndex = 0

    // Find where the interesting part starts (skip Users/username typically)
    for (let i = 0; i < segments.length - 1; i++) {
      if (skipDirs.includes(segments[i])) {
        startIndex = i + 1
      } else {
        break
      }
    }

    // If the next segment after Users is the username, skip that too
    if (startIndex < segments.length - 1 && segments.length > startIndex + 1) {
      // Check if it looks like a username (short, no special chars)
      const potentialUsername = segments[startIndex]
      if (potentialUsername.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(potentialUsername)) {
        startIndex++
      }
    }

    // Get remaining meaningful segments
    const meaningfulSegments = segments.slice(startIndex)

    // Return last 2 meaningful segments for context
    if (meaningfulSegments.length >= 2) {
      return meaningfulSegments.slice(-2).join('/')
    } else if (meaningfulSegments.length === 1) {
      return meaningfulSegments[0]
    }
  }

  // Fallback to just the last segment
  return segments[segments.length - 1] || folder
}
