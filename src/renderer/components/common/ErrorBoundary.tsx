import { Component, ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Bug, Home, ChevronDown, ChevronUp } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  showHomeButton?: boolean
  onNavigateHome?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  showStackTrace: boolean
}

const isDev = import.meta.env.DEV

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStackTrace: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })

    // Log error in development
    if (isDev) {
      console.group('[ErrorBoundary] Caught an error')
      console.error('Error:', error)
      console.error('Component Stack:', errorInfo.componentStack)
      console.groupEnd()
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showStackTrace: false
    })
    this.props.onReset?.()
  }

  toggleStackTrace = () => {
    this.setState(prev => ({ showStackTrace: !prev.showStackTrace }))
  }

  handleReportIssue = () => {
    const { error, errorInfo } = this.state
    const issueTitle = encodeURIComponent(`[Bug] ${error?.name}: ${error?.message}`)
    const issueBody = encodeURIComponent(`
## Error Description
${error?.message}

## Stack Trace
\`\`\`
${error?.stack}
\`\`\`

## Component Stack
\`\`\`
${errorInfo?.componentStack}
\`\`\`

## Steps to Reproduce
1.
2.
3.

## Expected Behavior


## Environment
- App Version: ${import.meta.env.VITE_APP_VERSION || 'development'}
- Platform: ${navigator.platform}
- User Agent: ${navigator.userAgent}
    `)

    // Open GitHub issue page (update URL as needed)
    window.api?.openUrlExternal?.(`https://github.com/OneWave-AI/Crest/issues/new?title=${issueTitle}&body=${issueBody}`)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { error, errorInfo, showStackTrace } = this.state

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="w-full max-w-lg">
            {/* Error Card */}
            <div className="bg-gradient-to-b from-[#1a1a1a] to-[#141414] rounded-2xl border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.1)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 p-6 border-b border-white/5">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={24} className="text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
                  <p className="text-sm text-gray-400">An unexpected error occurred</p>
                </div>
              </div>

              {/* Error Message */}
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                  <p className="text-sm text-red-300 font-mono break-all">
                    {error?.message || 'Unknown error'}
                  </p>
                </div>

                {/* Stack Trace (Development only) */}
                {isDev && errorInfo && (
                  <div>
                    <button
                      onClick={this.toggleStackTrace}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {showStackTrace ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {showStackTrace ? 'Hide' : 'Show'} stack trace
                    </button>

                    {showStackTrace && (
                      <div className="mt-3 p-4 rounded-xl bg-[#0d0d0d] border border-white/5 overflow-auto max-h-[300px]">
                        <pre className="text-xs text-gray-500 font-mono whitespace-pre-wrap break-all">
                          {error?.stack}
                          {'\n\nComponent Stack:'}
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={this.handleReset}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[#cc785c] hover:bg-[#b86a50] text-white font-medium transition-all duration-200 shadow-[0_0_20px_rgba(204,120,92,0.2)] hover:shadow-[0_0_30px_rgba(204,120,92,0.3)]"
                  >
                    <RotateCcw size={18} />
                    Try Again
                  </button>

                  <div className="flex gap-3">
                    {this.props.showHomeButton && this.props.onNavigateHome && (
                      <button
                        onClick={this.props.onNavigateHome}
                        className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium transition-all duration-200 border border-white/10"
                      >
                        <Home size={18} />
                        Go Home
                      </button>
                    )}

                    <button
                      onClick={this.handleReportIssue}
                      className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium transition-all duration-200 border border-white/10"
                    >
                      <Bug size={18} />
                      Report Issue
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Help text */}
            <p className="text-center text-sm text-gray-500 mt-4">
              If this keeps happening, try refreshing the app or{' '}
              <button
                onClick={this.handleReportIssue}
                className="text-[#cc785c] hover:text-[#e08a6c] underline underline-offset-2"
              >
                report the issue
              </button>
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Hook for functional components to trigger error boundary
export function useErrorBoundary() {
  const throwError = (error: Error) => {
    throw error
  }

  return { throwError }
}
