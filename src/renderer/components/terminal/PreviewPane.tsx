import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  RotateCcw,
  ExternalLink,
  Camera,
  Bug,
  ChevronDown,
  ChevronUp,
  Trash2,
  MessageSquare,
  Loader2
} from 'lucide-react'
import { useToast } from '../common/Toast'
import type { PreviewConsoleEntry } from '../../../shared/types'
import { PREVIEW_PARTITION } from '../../../shared/preview'

interface PreviewPaneProps {
  url: string
  onClose?: () => void
  /** When set, errors and screenshots can be handed straight to the running agent */
  activeTerminalId?: string | null
}

const MAX_ENTRIES = 60

// Installed in the preview page on every load. window.onerror and
// unhandledrejection don't reach the host any other way, so they're funnelled
// through console.error with a prefix the host recognises.
const ERROR_HOOK = `
(function () {
  if (window.__crestErrorHook) return;
  window.__crestErrorHook = true;
  var emit = function (payload) {
    try { console.error('[crest:error] ' + JSON.stringify(payload)); } catch (e) {}
  };
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window && event.target.tagName) {
      emit({
        message: 'Failed to load ' + event.target.tagName.toLowerCase() + ': ' +
          (event.target.src || event.target.href || '(unknown source)')
      });
      return;
    }
    emit({
      message: event.message || String(event.error || 'Error'),
      source: event.filename,
      line: event.lineno,
      stack: event.error && event.error.stack ? String(event.error.stack) : undefined
    });
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    emit({
      message: 'Unhandled promise rejection: ' + (reason && reason.message ? reason.message : String(reason)),
      stack: reason && reason.stack ? String(reason.stack) : undefined
    });
  });
})();
`

// Electron reports console levels as 0-3 (verbose, info, warning, error) but has
// used string names in other versions — accept both.
function normalizeLevel(level: number | string): PreviewConsoleEntry['level'] {
  if (typeof level === 'string') {
    if (level === 'error') return 'error'
    if (level === 'warning' || level === 'warn') return 'warn'
    return 'log'
  }
  if (level >= 3) return 'error'
  if (level === 2) return 'warn'
  return 'log'
}

export default function PreviewPane({ url, onClose, activeTerminalId }: PreviewPaneProps) {
  const { showToast } = useToast()
  const webviewRef = useRef<HTMLWebViewElement | null>(null)
  const [entries, setEntries] = useState<PreviewConsoleEntry[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const errors = entries.filter((entry) => entry.level === 'error')
  const warnings = entries.filter((entry) => entry.level === 'warn')

  const tag = useCallback(
    () => webviewRef.current as unknown as Electron.WebviewTag | null,
    []
  )

  const addEntry = useCallback((entry: Omit<PreviewConsoleEntry, 'id' | 'count' | 'timestamp'>) => {
    setEntries((prev) => {
      const last = prev[prev.length - 1]
      // Collapse repeats — a render loop can emit the same error hundreds of times
      if (last && last.level === entry.level && last.message === entry.message) {
        const next = prev.slice(0, -1)
        next.push({ ...last, count: last.count + 1, timestamp: Date.now() })
        return next
      }
      const next = [
        ...prev,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          count: 1
        }
      ]
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    })
  }, [])

  // Wire up the webview's console and load-failure events
  useEffect(() => {
    const element = webviewRef.current
    if (!element) return

    const onDomReady = () => {
      const wv = tag()
      wv?.executeJavaScript(ERROR_HOOK).catch(() => {
        // Page may block script evaluation — console capture still works
      })
    }

    const onConsoleMessage = (event: Event) => {
      const message = event as unknown as Electron.ConsoleMessageEvent

      if (message.message?.startsWith('[crest:error] ')) {
        try {
          const payload = JSON.parse(message.message.slice('[crest:error] '.length)) as {
            message: string
            source?: string
            line?: number
            stack?: string
          }
          addEntry({ level: 'error', ...payload })
          return
        } catch {
          // Fall through and record it as a plain console error
        }
      }

      const level = normalizeLevel(message.level)
      if (level === 'log') return // only surface warnings and errors

      addEntry({
        level,
        message: message.message,
        source: message.sourceId,
        line: message.line
      })
    }

    const onFailLoad = (event: Event) => {
      const failure = event as unknown as Electron.DidFailLoadEvent
      if (!failure.isMainFrame) return
      // -3 is ERR_ABORTED, which fires on ordinary in-page navigations
      if (failure.errorCode === -3) return
      addEntry({
        level: 'error',
        message: `Failed to load: ${failure.errorDescription || `error ${failure.errorCode}`}`,
        source: failure.validatedURL
      })
    }

    const onNavigate = () => setEntries([])

    element.addEventListener('dom-ready', onDomReady)
    element.addEventListener('console-message', onConsoleMessage)
    element.addEventListener('did-fail-load', onFailLoad)
    element.addEventListener('did-start-loading', onNavigate)

    return () => {
      element.removeEventListener('dom-ready', onDomReady)
      element.removeEventListener('console-message', onConsoleMessage)
      element.removeEventListener('did-fail-load', onFailLoad)
      element.removeEventListener('did-start-loading', onNavigate)
    }
  }, [addEntry, tag])

  // A fresh target starts with a clean slate
  useEffect(() => {
    setEntries([])
    setConsoleOpen(false)
  }, [url])

  // Auto-open the console the first time something actually breaks
  useEffect(() => {
    if (errors.length > 0) setConsoleOpen(true)
  }, [errors.length])

  const reload = useCallback(() => {
    setEntries([])
    tag()?.reload()
  }, [tag])

  const capture = useCallback(async () => {
    const wv = tag()
    if (!wv) return

    setCapturing(true)
    try {
      const result = await window.api.previewCapture(wv.getWebContentsId(), 'preview')

      if (!result.success || !result.path) {
        showToast('error', 'Screenshot failed', result.error)
        return
      }

      if (activeTerminalId) {
        await window.api.terminalSendText(
          `Here's a screenshot of the preview: ${result.path}`,
          activeTerminalId
        )
        showToast('success', 'Screenshot sent to session', result.path)
      } else {
        await navigator.clipboard.writeText(result.path).catch(() => {})
        showToast('success', 'Screenshot saved', `Path copied: ${result.path}`)
      }
    } finally {
      setCapturing(false)
    }
  }, [tag, activeTerminalId, showToast])

  const formatEntry = useCallback((entry: PreviewConsoleEntry) => {
    const location = entry.source ? `${entry.source}${entry.line ? `:${entry.line}` : ''}` : ''
    return [
      `${entry.level.toUpperCase()}: ${entry.message}`,
      location && `  at ${location}`,
      entry.stack && `\n${entry.stack}`
    ]
      .filter(Boolean)
      .join('\n')
  }, [])

  const sendToSession = useCallback(
    async (subset: PreviewConsoleEntry[]) => {
      if (!activeTerminalId || subset.length === 0) return

      const body = subset.map(formatEntry).join('\n\n')
      const prompt = `The preview at ${url} is reporting ${
        subset.length === 1 ? 'this error' : `these ${subset.length} errors`
      }. Find the cause and fix it:\n\n${body}`

      // Bracketed paste, otherwise every newline in the stack submits separately
      await window.api.terminalSendPaste(prompt, activeTerminalId)
      showToast('info', 'Sent to session', subset.length === 1 ? subset[0].message : `${subset.length} errors`)
    },
    [activeTerminalId, url, formatEntry, showToast]
  )

  const copyAll = useCallback(async () => {
    await navigator.clipboard.writeText(entries.map(formatEntry).join('\n\n'))
    showToast('success', 'Copied', `${entries.length} console entries`)
  }, [entries, formatEntry, showToast])

  const isHttp = url.startsWith('http')
  const src = isHttp ? url : `local-file://${url.replace(/^file:\/\//, '')}`

  return (
    <div className="h-full w-1/2 bg-surface-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-3 border-b border-overlay/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
          <span className="text-xs text-ink-muted flex-shrink-0">Preview</span>
          <span className="text-[10px] text-ink-faint font-mono truncate">{url.split('/').pop()}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Error/warning counter */}
          {(errors.length > 0 || warnings.length > 0) && (
            <button
              onClick={() => setConsoleOpen((open) => !open)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                errors.length > 0
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
              title="Preview console"
            >
              <Bug size={11} />
              {errors.length > 0 && <span>{errors.length}</span>}
              {warnings.length > 0 && (
                <span className={errors.length > 0 ? 'text-amber-400/80' : ''}>
                  {errors.length > 0 ? `/ ${warnings.length}` : warnings.length}
                </span>
              )}
              {consoleOpen ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
            </button>
          )}

          <button
            onClick={capture}
            disabled={capturing}
            className="p-1 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink-bright disabled:opacity-40 transition-colors"
            title={activeTerminalId ? 'Screenshot and send to session' : 'Screenshot preview'}
          >
            {capturing ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          </button>

          <button
            onClick={reload}
            className="p-1 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink-bright transition-colors"
            title="Reload"
          >
            <RotateCcw size={12} />
          </button>

          <button
            onClick={() => {
              if (isHttp) window.api.openUrlExternal(url)
              else window.api.openFileExternal(url)
            }}
            className="p-1 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink-bright transition-colors"
            title="Open externally"
          >
            <ExternalLink size={12} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-overlay/[0.06] text-ink-subtle hover:text-ink-bright transition-colors"
              title="Close preview"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Page */}
      <div className="flex-1 bg-white overflow-hidden min-h-0">
        <webview
          id="preview-iframe"
          ref={webviewRef}
          src={src}
          className="w-full h-full"
          // Preview content gets its own storage jar instead of sharing the app
          // session. Shared constant: main registers local-file: on this same
          // partition, and the two must not drift.
          partition={PREVIEW_PARTITION}
          // @ts-ignore - webpreferences is valid for webview
          webpreferences="allowRunningInsecureContent=no,contextIsolation=yes"
        />
      </div>

      {/* Console drawer */}
      {consoleOpen && entries.length > 0 && (
        <div className="h-56 flex flex-col border-t border-overlay/[0.06] bg-surface-0">
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-3 border-b border-overlay/[0.06]">
            <span className="text-[10px] uppercase tracking-wider text-ink-subtle">Preview Console</span>
            <div className="flex items-center gap-1">
              {activeTerminalId && errors.length > 0 && (
                <button
                  onClick={() => sendToSession(errors)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-accent hover:bg-accent/15 transition-colors"
                  title="Send every error to the running session"
                >
                  <MessageSquare size={10} />
                  Send {errors.length === 1 ? 'error' : 'all errors'} to session
                </button>
              )}
              <button
                onClick={copyAll}
                className="px-2 py-1 rounded text-[10px] text-ink-subtle hover:text-ink-bright hover:bg-overlay/[0.06] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setEntries([])}
                className="p-1 rounded text-ink-subtle hover:text-ink-bright hover:bg-overlay/[0.06] transition-colors"
                title="Clear"
              >
                <Trash2 size={11} />
              </button>
              <button
                onClick={() => setConsoleOpen(false)}
                className="p-1 rounded text-ink-subtle hover:text-ink-bright hover:bg-overlay/[0.06] transition-colors"
                title="Hide console"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`group flex items-start gap-2 px-3 py-1.5 border-b border-overlay/[0.03] ${
                  entry.level === 'error' ? 'text-red-300' : 'text-amber-300/90'
                }`}
              >
                <span className="flex-shrink-0 mt-0.5 w-9 text-[9px] uppercase text-ink-faint">
                  {entry.level}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-wrap break-words">
                    {entry.message}
                    {entry.count > 1 && (
                      <span className="ml-2 px-1.5 rounded-full bg-overlay/10 text-[9px] text-ink-muted">
                        {entry.count}
                      </span>
                    )}
                  </div>
                  {entry.source && (
                    <div className="text-[10px] text-ink-faint truncate mt-0.5">
                      {entry.source}
                      {entry.line ? `:${entry.line}` : ''}
                    </div>
                  )}
                  {entry.stack && (
                    <pre className="mt-1 text-[10px] text-ink-subtle whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                      {entry.stack}
                    </pre>
                  )}
                </div>

                {activeTerminalId && (
                  <button
                    onClick={() => sendToSession([entry])}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-ink-subtle hover:text-accent hover:bg-overlay/[0.06] transition-all"
                    title="Send this one to the session"
                  >
                    <MessageSquare size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
