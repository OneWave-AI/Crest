import { app, BrowserWindow, dialog, shell } from 'electron'
import type { UpdateInfo } from 'electron-updater'

/**
 * Self-update against GitHub Releases.
 *
 * Crest ships unsigned (`identity: null` in the builder config), so macOS will
 * not let electron-updater swap the bundle in place -- `quitAndInstall` on an
 * unsigned app fails the code-signature check and leaves the user on the old
 * build with no visible error. Until the app is signed and notarised we detect
 * the update and hand the user the release page, which is honest about what it
 * can do rather than silently doing nothing.
 *
 * When signing lands, set DOWNLOAD_AND_INSTALL to true: everything below the
 * flag is already the real download/install path.
 */
const DOWNLOAD_AND_INSTALL = false

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const RELEASES_URL = 'https://github.com/OneWave-AI/Crest/releases/latest'

let started = false

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  // An update check from a dev build reads the version out of package.json and
  // will always think it is behind. Nothing to install, and the dialog is noise.
  if (!app.isPackaged || started) return
  started = true

  // Required lazily: electron-updater pulls in a chunk of Node at import time,
  // and a dev run should not pay for a module it never uses.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = require('electron-updater')

  autoUpdater.autoDownload = DOWNLOAD_AND_INSTALL
  autoUpdater.autoInstallOnAppQuit = DOWNLOAD_AND_INSTALL

  autoUpdater.on('error', (err: Error) => {
    // A failed update check must never interrupt the session -- log it and let
    // the next interval try again.
    console.error('[updater]', err?.message ?? err)
  })

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    if (DOWNLOAD_AND_INSTALL) return // the download handler takes it from here

    const window = getWindow()
    if (!window) return

    const { response } = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: `Crest ${info.version} is available.`,
      detail: `You are on ${app.getVersion()}. Downloads open in your browser.`
    })

    if (response === 0) shell.openExternal(RELEASES_URL)
  })

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    const window = getWindow()
    if (!window) return

    const { response } = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Restart now', 'On next quit'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Crest ${info.version} is ready to install.`,
      detail: 'Restarting takes a few seconds. Running agents will be stopped.'
    })

    if (response === 0) autoUpdater.quitAndInstall()
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[updater] check failed:', err?.message ?? err)
    })
  }

  // Not at startup -- the first seconds after launch are already busy spawning
  // terminals and the starter-kit install. Give the app a moment first.
  setTimeout(check, 30_000)
  setInterval(check, CHECK_INTERVAL_MS)
}
