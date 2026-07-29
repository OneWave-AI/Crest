import { ipcMain, webContents, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getCwd } from './terminal'
import type { PreviewCaptureResult } from '../../shared/types'

// Screenshots land in <cwd>/.crest/ so the agent can read them without stepping
// outside the project it was started in. A self-ignoring .gitignore keeps them
// out of git status without touching the user's own ignore rules.
async function ensureCaptureDir(): Promise<string> {
  const cwd = getCwd()
  const base = cwd && cwd.length > 1 ? cwd : app.getPath('temp')
  const dir = path.join(base, '.crest', 'screenshots')

  await fs.mkdir(dir, { recursive: true })

  const ignorePath = path.join(base, '.crest', '.gitignore')
  try {
    await fs.access(ignorePath)
  } catch {
    await fs.writeFile(ignorePath, '*\n', 'utf-8').catch(() => {})
  }

  return dir
}

export function registerPreviewHandlers(): void {
  // Capture whatever the preview webview is currently showing and return a path
  // on disk. The renderer hands us the webview's webContents id.
  ipcMain.handle(
    'preview:capture',
    async (_, webContentsId: number, label?: string): Promise<PreviewCaptureResult> => {
      try {
        const target = webContents.fromId(webContentsId)
        if (!target || target.isDestroyed()) {
          return { success: false, error: 'Preview is no longer available' }
        }

        const image = await target.capturePage()
        if (image.isEmpty()) {
          return { success: false, error: 'Preview returned an empty frame — is it still loading?' }
        }

        const dir = await ensureCaptureDir()
        const safeLabel = (label || 'preview').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40)
        const filePath = path.join(dir, `${safeLabel}-${Date.now()}.png`)

        await fs.writeFile(filePath, image.toPNG())

        return { success: true, path: filePath }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to capture preview'
        }
      }
    }
  )
}
