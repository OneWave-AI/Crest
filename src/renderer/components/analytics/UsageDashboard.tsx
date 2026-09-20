import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Clock,
  BarChart3,
  PieChart,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Database,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import type { DetailedUsageStats } from '../../../shared/types'

interface UsageDashboardProps {
  className?: string
}

// Format large numbers
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toFixed(0)
}

// Format currency
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export default function UsageDashboard({ className = '' }: UsageDashboardProps) {
  const [stats, setStats] = useState<DetailedUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30)

  // Fetch usage stats
  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.getDetailedUsageStats(timeRange)
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [timeRange])

  // Calculate week-over-week change
  const weekOverWeekChange = useMemo(() => {
    if (!stats || stats.daily.length < 14) return null

    const recent7Days = stats.daily.slice(-7).reduce((sum, d) => sum + d.totalTokens, 0)
    const previous7Days = stats.daily.slice(-14, -7).reduce((sum, d) => sum + d.totalTokens, 0)

    if (previous7Days === 0) return null
    return ((recent7Days - previous7Days) / previous7Days) * 100
  }, [stats])

  // Get max daily usage for chart scaling
  const maxDailyTokens = useMemo(() => {
    if (!stats) return 0
    return Math.max(...stats.daily.map(d => d.totalTokens), 1)
  }, [stats])

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Loading skeleton */}
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-overlay/[0.03] rounded-xl p-4 animate-pulse">
              <div className="h-4 w-20 bg-overlay/10 rounded mb-2" />
              <div className="h-8 w-24 bg-overlay/10 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-overlay/[0.03] rounded-xl p-6 h-48 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-red-500/10 border border-red-500/20 rounded-xl p-6 ${className}`}>
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-red-400" size={20} />
          <div>
            <p className="text-red-400 font-medium">Failed to load usage data</p>
            <p className="text-sm text-red-400/70 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchStats}
            className="ml-auto px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/20 rounded-lg">
            <BarChart3 size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink-bright">Usage Dashboard</h2>
            <p className="text-sm text-ink-subtle">Token usage and cost analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-overlay/[0.05] rounded-lg p-0.5">
            {([7, 30, 90] as const).map(days => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-accent text-white'
                    : 'text-ink-muted hover:text-ink-bright'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-2 rounded-lg text-ink-muted hover:text-ink-bright hover:bg-overlay/[0.05] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Tokens */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-4 border border-overlay/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink-subtle">Total Tokens</span>
            <Database size={16} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-ink-bright">
            {formatNumber(stats.totals.totalTokens)}
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs">
            <span className="text-ink-subtle">In: {formatNumber(stats.totals.inputTokens)}</span>
            <span className="text-ink-faint">|</span>
            <span className="text-ink-subtle">Out: {formatNumber(stats.totals.outputTokens)}</span>
          </div>
        </div>

        {/* Total Cost */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-4 border border-overlay/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink-subtle">Estimated Cost</span>
            <DollarSign size={16} className="text-green-400" />
          </div>
          <div className="text-2xl font-bold text-ink-bright">
            {formatCurrency(stats.totals.cost)}
          </div>
          <div className="text-xs text-ink-subtle mt-1">
            ~{formatCurrency(stats.predictions.costPerSession)}/session
          </div>
        </div>

        {/* Sessions */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-4 border border-overlay/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink-subtle">Sessions</span>
            <Zap size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-ink-bright">
            {stats.totals.sessions}
          </div>
          <div className="text-xs text-ink-subtle mt-1">
            {(stats.totals.sessions / timeRange).toFixed(1)}/day avg
          </div>
        </div>

        {/* Week over Week Change */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-4 border border-overlay/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink-subtle">Weekly Trend</span>
            {weekOverWeekChange !== null && weekOverWeekChange >= 0 ? (
              <ArrowUpRight size={16} className="text-green-400" />
            ) : (
              <ArrowDownRight size={16} className="text-red-400" />
            )}
          </div>
          <div className={`text-2xl font-bold ${
            weekOverWeekChange === null ? 'text-ink-muted' :
            weekOverWeekChange >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {weekOverWeekChange !== null ? (
              `${weekOverWeekChange >= 0 ? '+' : ''}${weekOverWeekChange.toFixed(1)}%`
            ) : (
              'N/A'
            )}
          </div>
          <div className="text-xs text-ink-subtle mt-1">vs previous 7 days</div>
        </div>
      </div>

      {/* Daily Usage Chart */}
      <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-6 border border-overlay/[0.06]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-ink-muted">Daily Token Usage</h3>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-ink-subtle">Input</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-sand-400" />
              <span className="text-ink-subtle">Output</span>
            </div>
          </div>
        </div>

        {stats.daily.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-ink-subtle text-sm">
            No usage data for this period
          </div>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {stats.daily.slice(-30).map((day, index) => {
              const inputHeight = (day.inputTokens / maxDailyTokens) * 100
              const outputHeight = (day.outputTokens / maxDailyTokens) * 100

              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col justify-end gap-0.5 group relative"
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-4 border border-overlay/10 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    <div className="font-medium text-ink-bright">{day.date}</div>
                    <div className="text-cyan-400">In: {formatNumber(day.inputTokens)}</div>
                    <div className="text-sand-400">Out: {formatNumber(day.outputTokens)}</div>
                    <div className="text-green-400">{formatCurrency(day.cost)}</div>
                  </div>

                  {/* Bars */}
                  <div
                    className="w-full bg-sand-500/60 rounded-t transition-all group-hover:bg-sand-400"
                    style={{ height: `${outputHeight}%`, minHeight: outputHeight > 0 ? '2px' : '0' }}
                  />
                  <div
                    className="w-full bg-cyan-500/60 rounded-t transition-all group-hover:bg-cyan-400"
                    style={{ height: `${inputHeight}%`, minHeight: inputHeight > 0 ? '2px' : '0' }}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-xs text-ink-faint">
          {stats.daily.length > 0 && (
            <>
              <span>{stats.daily[Math.max(0, stats.daily.length - 30)]?.date}</span>
              <span>{stats.daily[stats.daily.length - 1]?.date}</span>
            </>
          )}
        </div>
      </div>

      {/* Model Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* By Model */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-6 border border-overlay/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-ink-muted">Usage by Model</h3>
          </div>

          {stats.byModel.length === 0 ? (
            <div className="text-sm text-ink-subtle text-center py-4">No model data</div>
          ) : (
            <div className="space-y-3">
              {stats.byModel.map(model => {
                const percentage = stats.totals.totalTokens > 0
                  ? (model.totalTokens / stats.totals.totalTokens) * 100
                  : 0

                const colors: Record<string, { bg: string; text: string }> = {
                  'Opus': { bg: 'bg-sand-500', text: 'text-sand-400' },
                  'Sonnet': { bg: 'bg-accent', text: 'text-accent' },
                  'Haiku': { bg: 'bg-emerald-500', text: 'text-emerald-400' }
                }
                const color = colors[model.model] || { bg: 'bg-ink-subtle', text: 'text-ink-muted' }

                return (
                  <div key={model.model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${color.text}`}>{model.model}</span>
                      <span className="text-sm text-ink-muted">{formatNumber(model.totalTokens)}</span>
                    </div>
                    <div className="h-2 bg-overlay/[0.05] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color.bg} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-ink-subtle">
                      <span>{model.sessions} sessions</span>
                      <span>{formatCurrency(model.cost)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Projections */}
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-6 border border-overlay/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-ink-muted">Projections</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-overlay/[0.06]">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-ink-subtle" />
                <span className="text-sm text-ink-muted">Daily Average</span>
              </div>
              <span className="text-sm font-medium text-ink-bright">
                {formatNumber(stats.predictions.dailyAverage)} tokens
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-overlay/[0.06]">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-ink-subtle" />
                <span className="text-sm text-ink-muted">Weekly Projection</span>
              </div>
              <span className="text-sm font-medium text-ink-bright">
                {formatNumber(stats.predictions.weeklyProjection)} tokens
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-overlay/[0.06]">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-ink-subtle" />
                <span className="text-sm text-ink-muted">Monthly Projection</span>
              </div>
              <span className="text-sm font-medium text-ink-bright">
                {formatNumber(stats.predictions.monthlyProjection)} tokens
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-ink-subtle" />
                <span className="text-sm text-ink-muted">Monthly Cost Est.</span>
              </div>
              <span className="text-sm font-medium text-green-400">
                {formatCurrency(stats.predictions.costPerSession * stats.totals.sessions / timeRange * 30)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cache Usage */}
      {(stats.totals.cacheCreationInputTokens > 0 || stats.totals.cacheReadInputTokens > 0) && (
        <div className="bg-gradient-to-br from-overlay/[0.05] to-overlay/[0.02] rounded-xl p-6 border border-overlay/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} className="text-blue-400" />
            <h3 className="text-sm font-medium text-ink-muted">Cache Usage</h3>
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Saving money!</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-ink-subtle mb-1">Cache Created</div>
              <div className="text-lg font-bold text-ink-bright">
                {formatNumber(stats.totals.cacheCreationInputTokens)}
              </div>
            </div>
            <div>
              <div className="text-sm text-ink-subtle mb-1">Cache Read</div>
              <div className="text-lg font-bold text-ink-bright">
                {formatNumber(stats.totals.cacheReadInputTokens)}
              </div>
            </div>
            <div>
              <div className="text-sm text-ink-subtle mb-1">Cache Hit Rate</div>
              <div className="text-lg font-bold text-green-400">
                {stats.totals.cacheCreationInputTokens > 0
                  ? `${((stats.totals.cacheReadInputTokens / (stats.totals.cacheCreationInputTokens + stats.totals.cacheReadInputTokens)) * 100).toFixed(1)}%`
                  : 'N/A'
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
