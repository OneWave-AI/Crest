import { app, BrowserWindow, shell, protocol, net, dialog, ipcMain, session } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { stopAllAcpSessions } from './ipc/acp'
import { autoInstallStarterKit } from './ipc/skills'
import { initAutoUpdater } from './services/updater'
import { PREVIEW_PARTITION } from '../shared/preview'

// Register custom protocol as privileged (must be before app ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      corsEnabled: false,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let hasActiveTerminal = false
let forceQuit = false

// Track terminal session state from renderer
ipcMain.on('terminal-session-active', (_, active: boolean) => {
  hasActiveTerminal = active
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Crest',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Confirm before closing if terminal is active
  mainWindow.on('close', (e) => {
    if (forceQuit || !hasActiveTerminal) {
      return // Allow close
    }

    e.preventDefault()
    dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['Cancel', 'Close Anyway'],
      defaultId: 0,
      cancelId: 0,
      title: 'Active Terminal Session',
      message: 'You have an active terminal session.',
      detail: 'Closing will end your Claude session. Are you sure you want to close?'
    }).then(({ response }) => {
      if (response === 1) {
        forceQuit = true
        mainWindow?.close()
      }
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // DevTools can be opened with Cmd+Option+I
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.crest.app')

  // Inject a Content Security Policy on renderer responses.
  // 'unsafe-inline' on style is required by component libraries that inject styles at runtime.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' local-file:; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: https: local-file:; " +
          "media-src 'self' data: blob: https: local-file:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' https: ws: wss:; " +
          "object-src 'none'; " +
          "base-uri 'self'; " +
          "frame-ancestors 'none'"
        ]
      }
    })
  })

  // Serve local files to the preview pane.
  // Scoped to home directory to prevent serving arbitrary system files.
  const handleLocalFile = (request: Request): Response | Promise<Response> => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
    const resolved = require('path').resolve(filePath)
    const home = homedir()
    if (!resolved.startsWith(home)) {
      return new Response('Forbidden: path outside home directory', { status: 403 })
    }
    // Block sensitive files
    const base = require('path').basename(resolved).toLowerCase()
    if (base.startsWith('.env') || base === 'credentials.json' || base.endsWith('.pem') || base.endsWith('.key')) {
      return new Response('Forbidden: sensitive file', { status: 403 })
    }
    return net.fetch(pathToFileURL(resolved).toString())
  }

  protocol.handle('local-file', handleLocalFile)

  // The preview <webview> runs in its own partition (PreviewPane.tsx), and a
  // custom scheme registered via the global `protocol` object only reaches the
  // DEFAULT session. Without this second registration every non-http preview --
  // i.e. every local file -- rendered a blank pane and emitted no did-fail-load
  // at all, so the preview console had nothing to show either.
  session.fromPartition(PREVIEW_PARTITION).protocol.handle('local-file', handleLocalFile)

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register all IPC handlers
  registerIpcHandlers()

  // Auto-install starter kit for new users before showing the window
  autoInstallStarterKit().catch((err) => {
    console.error('Failed to auto-install starter kit:', err)
  })

  createWindow()

  initAutoUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Don't orphan ACP agent processes when Crest exits.
app.on('will-quit', () => {
  stopAllAcpSessions()
})

export { mainWindow }
