/**
 * Error logging utility for development and production
 *
 * Provides structured error logging with context, stack traces,
 * and optional integration with external error tracking services.
 */

const isDev = import.meta.env.DEV

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export interface ErrorContext {
  /** Component or module where error occurred */
  component?: string
  /** Action being performed when error occurred */
  action?: string
  /** User-facing error message */
  userMessage?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** IPC channel if applicable */
  ipcChannel?: string
  /** HTTP status code if applicable */
  statusCode?: number
  /** Request URL if applicable */
  url?: string
}

export interface LoggedError {
  id: string
  timestamp: number
  severity: ErrorSeverity
  message: string
  stack?: string
  context: ErrorContext
}

// In-memory error log for development (last 100 errors)
const errorLog: LoggedError[] = []
const MAX_LOG_SIZE = 100

// Error listeners for external integrations
type ErrorListener = (error: LoggedError) => void
const errorListeners: Set<ErrorListener> = new Set()

/**
 * Generate unique error ID
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Format error for console output
 */
function formatConsoleOutput(error: LoggedError): string[] {
  const lines: string[] = []
  const time = new Date(error.timestamp).toISOString()

  lines.push(`[${error.severity.toUpperCase()}] ${time}`)
  lines.push(`Message: ${error.message}`)

  if (error.context.component) {
    lines.push(`Component: ${error.context.component}`)
  }

  if (error.context.action) {
    lines.push(`Action: ${error.context.action}`)
  }

  if (error.context.ipcChannel) {
    lines.push(`IPC Channel: ${error.context.ipcChannel}`)
  }

  if (error.context.url) {
    lines.push(`URL: ${error.context.url}`)
  }

  if (error.context.metadata && Object.keys(error.context.metadata).length > 0) {
    lines.push(`Metadata: ${JSON.stringify(error.context.metadata, null, 2)}`)
  }

  return lines
}

/**
 * Get console method and style based on severity
 */
function getConsoleConfig(severity: ErrorSeverity): {
  method: typeof console.log
  style: string
  tag: string
} {
  const configs: Record<ErrorSeverity, { method: typeof console.log; style: string; tag: string }> = {
    debug: {
      method: console.debug,
      style: 'color: #888',
      tag: 'DEBUG'
    },
    info: {
      method: console.info,
      style: 'color: #3b82f6',
      tag: 'INFO'
    },
    warning: {
      method: console.warn,
      style: 'color: #eab308',
      tag: 'WARN'
    },
    error: {
      method: console.error,
      style: 'color: #ef4444',
      tag: 'ERROR'
    },
    critical: {
      method: console.error,
      style: 'color: #dc2626; font-weight: bold',
      tag: 'CRITICAL'
    }
  }

  return configs[severity]
}

/**
 * Log an error with context
 *
 * @param error - Error object or message string
 * @param severity - Error severity level
 * @param context - Additional context about the error
 * @returns The logged error object
 *
 * @example
 * ```ts
 * // Log an error with context
 * logError(
 *   new Error('Failed to load files'),
 *   'error',
 *   {
 *     component: 'FileExplorer',
 *     action: 'listFiles',
 *     ipcChannel: 'list-files'
 *   }
 * )
 *
 * // Log a simple message
 * logError('API timeout', 'warning', { url: '/api/data' })
 * ```
 */
export function logError(
  error: Error | string,
  severity: ErrorSeverity = 'error',
  context: ErrorContext = {}
): LoggedError {
  const loggedError: LoggedError = {
    id: generateErrorId(),
    timestamp: Date.now(),
    severity,
    message: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    context
  }

  // Add to in-memory log
  errorLog.unshift(loggedError)
  if (errorLog.length > MAX_LOG_SIZE) {
    errorLog.pop()
  }

  // Console output in development
  if (isDev) {
    const config = getConsoleConfig(severity)
    const lines = formatConsoleOutput(loggedError)

    console.group(`%c[${config.tag}] ${loggedError.message}`, config.style)
    lines.forEach(line => console.log(line))
    if (loggedError.stack) {
      console.log('Stack:', loggedError.stack)
    }
    console.groupEnd()
  }

  // Notify listeners (for external error tracking integrations)
  errorListeners.forEach(listener => {
    try {
      listener(loggedError)
    } catch (e) {
      console.error('Error listener failed:', e)
    }
  })

  return loggedError
}

/**
 * Convenience methods for different severity levels
 */
export const logger = {
  debug: (message: string | Error, context?: ErrorContext) =>
    logError(message, 'debug', context),

  info: (message: string | Error, context?: ErrorContext) =>
    logError(message, 'info', context),

  warn: (message: string | Error, context?: ErrorContext) =>
    logError(message, 'warning', context),

  error: (message: string | Error, context?: ErrorContext) =>
    logError(message, 'error', context),

  critical: (message: string | Error, context?: ErrorContext) =>
    logError(message, 'critical', context)
}

/**
 * Log an IPC error with channel information
 */
export function logIpcError(
  channel: string,
  error: Error | string,
  metadata?: Record<string, unknown>
): LoggedError {
  return logError(error, 'error', {
    component: 'IPC',
    action: `ipcRenderer.invoke('${channel}')`,
    ipcChannel: channel,
    metadata
  })
}

/**
 * Log a component error
 */
export function logComponentError(
  componentName: string,
  error: Error | string,
  action?: string,
  metadata?: Record<string, unknown>
): LoggedError {
  return logError(error, 'error', {
    component: componentName,
    action,
    metadata
  })
}

/**
 * Get recent errors from the log
 */
export function getErrorLog(count?: number): LoggedError[] {
  return count ? errorLog.slice(0, count) : [...errorLog]
}

/**
 * Clear the error log
 */
export function clearErrorLog(): void {
  errorLog.length = 0
}

/**
 * Subscribe to error events
 */
export function subscribeToErrors(listener: ErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

/**
 * Create a typed error with context for use with try-catch
 */
export class AppError extends Error {
  public readonly context: ErrorContext
  public readonly severity: ErrorSeverity

  constructor(
    message: string,
    severity: ErrorSeverity = 'error',
    context: ErrorContext = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.severity = severity
    this.context = context

    // Capture proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  /**
   * Log this error
   */
  log(): LoggedError {
    return logError(this, this.severity, this.context)
  }
}

/**
 * IPC-specific error class
 */
export class IpcError extends AppError {
  public readonly channel: string

  constructor(channel: string, message: string, metadata?: Record<string, unknown>) {
    super(message, 'error', {
      component: 'IPC',
      ipcChannel: channel,
      metadata
    })
    this.name = 'IpcError'
    this.channel = channel
  }
}

/**
 * Wrap an async function with error logging
 */
export function withErrorLogging<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  context: Omit<ErrorContext, 'metadata'>
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args)
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'error',
        { ...context, metadata: { args } }
      )
      throw error
    }
  }
}

/**
 * Create safe IPC caller with built-in error logging
 */
export function createSafeIpcCaller<T, Args extends unknown[]>(
  channel: string,
  ipcFn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await ipcFn(...args)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logIpcError(channel, err, { args })
      throw new IpcError(channel, err.message, { args, originalError: err.message })
    }
  }
}

// Development-only exports for debugging
if (isDev) {
  // Expose error log to window for debugging
  (window as unknown as Record<string, unknown>).__errorLog = {
    get: getErrorLog,
    clear: clearErrorLog,
    log: errorLog
  }
}

export default logger
