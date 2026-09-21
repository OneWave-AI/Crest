import { ipcMain, app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getCwd } from './terminal'
import { unquoteGitPath } from '../../shared/gitPath'
import type {
  GitFileStatusMap,
  GitFileStatusType,
  GitDiffFile,
  GitDiffResult,
  GitApplyResult
} from '../../shared/types'

const execFileAsync = promisify(execFile)

export interface GitStatus {
  branch: string
  dirty: boolean
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
}

export interface GitResult {
  success: boolean
  message: string
}

interface GitCommandResult {
  stdout: string
  stderr: string
}

async function runGitCommand(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

// Safe version that uses execFile to avoid shell injection
async function runGitCommandSafe(args: string[], cwd: string): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024
    })
    return { stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (error: unknown) {
    // execFile throws an error object that includes stdout and stderr
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(parseGitError(execError.stderr || execError.message || 'Unknown git error'))
  }
}

// Some git commands (diff, apply --check) use exit code 1 to mean "differences found"
// rather than "failure". This variant treats exit 1 as success and returns stdout.
async function runGitAllowDiffExit(args: string[], cwd: string): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024
    })
    return { stdout, stderr: stderr.trim() }
  } catch (error: unknown) {
    const execError = error as { code?: number; stdout?: string; stderr?: string; message?: string }
    if (execError.code === 1 && typeof execError.stdout === 'string') {
      return { stdout: execError.stdout, stderr: (execError.stderr || '').trim() }
    }
    throw new Error(parseGitError(execError.stderr || execError.message || 'Unknown git error'))
  }
}

// Parse git error messages into user-friendly format
function parseGitError(stderr: string): string {
  const errorMessage = stderr.trim()

  // Common git error patterns with user-friendly messages
  if (errorMessage.includes('not a git repository')) {
    return 'This directory is not a git repository'
  }
  if (errorMessage.includes('nothing to commit')) {
    return 'Nothing to commit - working directory is clean'
  }
  if (errorMessage.includes('Please tell me who you are')) {
    return 'Git user not configured. Run: git config --global user.email "you@example.com" and git config --global user.name "Your Name"'
  }
  if (errorMessage.includes('Could not read from remote repository')) {
    return 'Cannot connect to remote repository. Check your network connection and repository access'
  }
  if (errorMessage.includes('Authentication failed')) {
    return 'Authentication failed. Please check your credentials'
  }
  if (errorMessage.includes('Permission denied')) {
    return 'Permission denied. Check your SSH keys or credentials'
  }
  if (errorMessage.includes('fatal: No configured push destination')) {
    return 'No remote configured. Add a remote with: git remote add origin <url>'
  }
  if (errorMessage.includes('no upstream branch')) {
    return 'No upstream branch configured. Push with: git push -u origin <branch>'
  }
  if (errorMessage.includes('CONFLICT')) {
    return 'Merge conflict detected. Resolve conflicts before continuing'
  }
  if (errorMessage.includes('You have unstaged changes')) {
    return 'You have unstaged changes. Commit or stash them first'
  }
  if (errorMessage.includes('Your local changes would be overwritten')) {
    return 'Local changes would be overwritten. Commit or stash them first'
  }
  if (errorMessage.includes('failed to push some refs')) {
    return 'Push rejected. Pull latest changes first with git pull'
  }
  if (errorMessage.includes('Could not resolve host')) {
    return 'Cannot resolve remote host. Check your network connection'
  }

  // Return cleaned up error message if no specific pattern matched
  // Remove 'fatal: ' prefix and 'error: ' prefix for cleaner messages
  return errorMessage
    .replace(/^fatal:\s*/i, '')
    .replace(/^error:\s*/i, '')
    .split('\n')[0] // Take first line only
    .trim() || 'An unknown git error occurred'
}

export function registerGitHandlers(): void {
  ipcMain.handle('git-status', async (): Promise<GitStatus | null> => {
    const cwd = getCwd()

    try {
      // Check if we're in a git repo
      await runGitCommand(['rev-parse', '--git-dir'], cwd)

      // Get current branch
      let branch = 'HEAD'
      try {
        branch = await runGitCommand(['branch', '--show-current'], cwd)
        if (!branch) {
          // Detached HEAD state
          const shortSha = await runGitCommand(['rev-parse', '--short', 'HEAD'], cwd)
          branch = `detached:${shortSha}`
        }
      } catch {
        branch = 'unknown'
      }

      // Get ahead/behind counts
      let ahead = 0
      let behind = 0
      try {
        const aheadBehind = await runGitCommand(
          ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
          cwd
        )
        const parts = aheadBehind.split(/\s+/)
        ahead = parseInt(parts[0], 10) || 0
        behind = parseInt(parts[1], 10) || 0
      } catch {
        // No upstream or error - ignore
      }

      // Get status counts
      let staged = 0
      let unstaged = 0
      let untracked = 0

      try {
        const status = await runGitCommand(['status', '--porcelain'], cwd)
        const lines = status.split('\n').filter((line) => line.trim())

        for (const line of lines) {
          const indexStatus = line[0]
          const workTreeStatus = line[1]

          if (indexStatus === '?' && workTreeStatus === '?') {
            untracked++
          } else {
            if (indexStatus !== ' ' && indexStatus !== '?') {
              staged++
            }
            if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
              unstaged++
            }
          }
        }
      } catch {
        // Error getting status
      }

      const dirty = staged > 0 || unstaged > 0 || untracked > 0

      return {
        branch,
        dirty,
        ahead,
        behind,
        staged,
        unstaged,
        untracked
      }
    } catch {
      // Not a git repository
      return null
    }
  })

  ipcMain.handle('git-commit', async (_, message: string): Promise<GitResult> => {
    const cwd = getCwd()

    try {
      // Validate message is not empty
      if (!message || !message.trim()) {
        return {
          success: false,
          message: 'Commit message cannot be empty'
        }
      }

      // Stage all changes using safe execFile
      await runGitCommandSafe(['add', '-A'], cwd)

      // Commit with message using safe execFile (prevents shell injection)
      const { stdout } = await runGitCommandSafe(['commit', '-m', message.trim()], cwd)

      return {
        success: true,
        message: stdout || 'Changes committed successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to commit changes'
      }
    }
  })

  ipcMain.handle('git-push', async (): Promise<GitResult> => {
    const cwd = getCwd()

    try {
      // Check if we're in a git repo first
      await runGitCommandSafe(['rev-parse', '--git-dir'], cwd)

      // Check if there's a remote configured
      const { stdout: remotes } = await runGitCommandSafe(['remote'], cwd)
      if (!remotes.trim()) {
        return {
          success: false,
          message: 'No remote configured. Add a remote with: git remote add origin <url>'
        }
      }

      // Push using safe execFile
      const { stdout, stderr } = await runGitCommandSafe(['push'], cwd)

      // Git push often outputs to stderr even on success
      const output = stdout || stderr || 'Pushed successfully'

      return {
        success: true,
        message: output.includes('Everything up-to-date')
          ? 'Everything up-to-date'
          : output.split('\n')[0] || 'Pushed successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to push changes'
      }
    }
  })

  ipcMain.handle('git-pull', async (): Promise<GitResult> => {
    const cwd = getCwd()

    try {
      // Check if we're in a git repo first
      await runGitCommandSafe(['rev-parse', '--git-dir'], cwd)

      // Check if there's a remote configured
      const { stdout: remotes } = await runGitCommandSafe(['remote'], cwd)
      if (!remotes.trim()) {
        return {
          success: false,
          message: 'No remote configured. Add a remote with: git remote add origin <url>'
        }
      }

      // Pull using safe execFile
      const { stdout, stderr } = await runGitCommandSafe(['pull'], cwd)

      // Git pull often outputs to stderr even on success
      const output = stdout || stderr || 'Pulled successfully'

      return {
        success: true,
        message: output.includes('Already up to date')
          ? 'Already up to date'
          : output.split('\n')[0] || 'Pulled successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to pull changes'
      }
    }
  })

  // Get git status for individual files
  ipcMain.handle('git-file-status', async (): Promise<GitFileStatusMap> => {
    const cwd = getCwd()
    const statusMap: GitFileStatusMap = {}

    try {
      // Check if we're in a git repo using safe method
      await runGitCommandSafe(['rev-parse', '--git-dir'], cwd)

      // Get status for all files with -z for NUL-separated output (handles special chars)
      const { stdout: status } = await runGitCommandSafe(['status', '--porcelain', '-u', '-z'], cwd)

      // With -z flag, entries are NUL-separated
      // Format: XY PATH\0 or XY PATH\0ORIG_PATH\0 for renames
      const entries = status.split('\0').filter((entry) => entry.length > 0)

      let i = 0
      while (i < entries.length) {
        const entry = entries[i]

        // Entry must be at least 3 chars (XY + space + at least 1 char path)
        if (entry.length < 3) {
          i++
          continue
        }

        const indexStatus = entry[0]
        const workTreeStatus = entry[1]
        // File path starts at position 3 (after XY and space)
        let filePath = entry.substring(3)

        // Handle renamed/copied files - the original path follows as next entry
        if (indexStatus === 'R' || indexStatus === 'C') {
          // For renames with -z, the new path is in current entry, old path is next
          i++ // Skip the original path entry
        }

        // Unquote path if it's quoted (git quotes paths with special chars)
        filePath = unquoteGitPath(filePath)

        // Get absolute path
        const absolutePath = path.resolve(cwd, filePath)

        let fileStatus: GitFileStatusType = 'modified'

        if (indexStatus === '?' && workTreeStatus === '?') {
          fileStatus = 'untracked'
        } else if (indexStatus === 'U' || workTreeStatus === 'U' ||
                   (indexStatus === 'D' && workTreeStatus === 'D') ||
                   (indexStatus === 'A' && workTreeStatus === 'A')) {
          fileStatus = 'conflict'
        } else if (indexStatus === 'A') {
          fileStatus = 'added'
        } else if (indexStatus === 'D' || workTreeStatus === 'D') {
          fileStatus = 'deleted'
        } else if (indexStatus === 'R') {
          fileStatus = 'renamed'
        } else if (indexStatus === 'C') {
          fileStatus = 'added' // Copied files are essentially new additions
        } else if (indexStatus !== ' ' && indexStatus !== '?') {
          fileStatus = 'staged'
        } else if (workTreeStatus === 'M') {
          fileStatus = 'modified'
        }

        statusMap[absolutePath] = fileStatus
        i++
      }

      return statusMap
    } catch {
      // Not a git repository or error
      return {}
    }
  })

  // ---------------------------------------------------------------------------
  // Diff review — per-file diffs and per-hunk stage / unstage / discard
  // ---------------------------------------------------------------------------

  // Reject anything that would escape the repo root before handing it to git
  function resolveInRepo(cwd: string, relPath: string): string | null {
    const resolved = path.resolve(cwd, relPath)
    const root = path.resolve(cwd)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
    return resolved
  }

  // Parse `git diff --numstat --no-renames -z` into { path: [insertions, deletions] }.
  // --no-renames keeps every record a plain `ins\tdel\tpath\0` triple.
  function parseNumstat(stdout: string): Record<string, { insertions: number; deletions: number; binary: boolean }> {
    const out: Record<string, { insertions: number; deletions: number; binary: boolean }> = {}
    for (const entry of stdout.split('\0')) {
      if (!entry) continue
      const parts = entry.split('\t')
      if (parts.length < 3) continue
      const [ins, del, filePath] = parts
      out[filePath] = {
        insertions: ins === '-' ? 0 : parseInt(ins, 10) || 0,
        deletions: del === '-' ? 0 : parseInt(del, 10) || 0,
        binary: ins === '-' && del === '-'
      }
    }
    return out
  }

  // Every changed file in the working tree, with staged/unstaged split and line counts
  ipcMain.handle('git-diff-summary', async (): Promise<GitDiffFile[]> => {
    const cwd = getCwd()

    try {
      await runGitCommandSafe(['rev-parse', '--git-dir'], cwd)

      const [unstagedStat, stagedStat, { stdout: status }] = await Promise.all([
        runGitAllowDiffExit(['diff', '--numstat', '--no-renames', '-z'], cwd).then((r) => parseNumstat(r.stdout)),
        runGitAllowDiffExit(['diff', '--cached', '--numstat', '--no-renames', '-z'], cwd).then((r) => parseNumstat(r.stdout)),
        runGitCommandSafe(['status', '--porcelain', '-u', '-z'], cwd)
      ])

      const files: GitDiffFile[] = []
      const entries = status.split('\0').filter((entry) => entry.length > 0)

      let i = 0
      while (i < entries.length) {
        const entry = entries[i]
        if (entry.length < 3) {
          i++
          continue
        }

        const indexStatus = entry[0]
        const workTreeStatus = entry[1]
        let filePath = unquoteGitPath(entry.substring(3))

        // Renames/copies carry the original path in the following NUL-separated entry
        if (indexStatus === 'R' || indexStatus === 'C') i++

        const untracked = indexStatus === '?' && workTreeStatus === '?'
        const staged = !untracked && indexStatus !== ' ' && indexStatus !== '?'
        const unstaged = untracked || (workTreeStatus !== ' ' && workTreeStatus !== '?')

        let fileStatus: GitFileStatusType = 'modified'
        if (untracked) fileStatus = 'untracked'
        else if (indexStatus === 'U' || workTreeStatus === 'U') fileStatus = 'conflict'
        else if (indexStatus === 'A') fileStatus = 'added'
        else if (indexStatus === 'D' || workTreeStatus === 'D') fileStatus = 'deleted'
        else if (indexStatus === 'R') fileStatus = 'renamed'

        const stat = unstagedStat[filePath]
        const cachedStat = stagedStat[filePath]

        let insertions = (stat?.insertions || 0) + (cachedStat?.insertions || 0)
        let deletions = (stat?.deletions || 0) + (cachedStat?.deletions || 0)
        let binary = Boolean(stat?.binary || cachedStat?.binary)

        // Untracked files have no numstat entry — count the new lines ourselves
        if (untracked) {
          const absolute = resolveInRepo(cwd, filePath)
          if (absolute) {
            try {
              const stats = await fs.stat(absolute)
              if (stats.isDirectory()) {
                i++
                continue
              }
              if (stats.size > 2 * 1024 * 1024) {
                binary = true
              } else {
                const contents = await fs.readFile(absolute)
                if (contents.includes(0)) {
                  binary = true
                } else {
                  const text = contents.toString('utf-8')
                  insertions = text.length === 0 ? 0 : text.replace(/\n$/, '').split('\n').length
                  deletions = 0
                }
              }
            } catch {
              // Unreadable — leave the counts at zero
            }
          }
        }

        files.push({
          path: filePath,
          absolutePath: path.resolve(cwd, filePath),
          status: fileStatus,
          staged,
          unstaged,
          insertions,
          deletions,
          binary
        })
        i++
      }

      files.sort((a, b) => a.path.localeCompare(b.path))
      return files
    } catch {
      return []
    }
  })

  // Unified diff for a single file, either the staged or the working-tree side
  ipcMain.handle(
    'git-diff-file',
    async (_, relPath: string, staged: boolean, untracked: boolean): Promise<GitDiffResult> => {
      const cwd = getCwd()

      try {
        const absolute = resolveInRepo(cwd, relPath)
        if (!absolute) return { success: false, error: 'Path is outside the repository' }

        // Untracked files aren't known to git yet, so diff them against /dev/null
        // and rewrite the headers to repo-relative paths so hunks stay appliable.
        if (untracked) {
          const { stdout } = await runGitAllowDiffExit(
            ['diff', '--no-index', '--unified=3', '--', '/dev/null', absolute],
            cwd
          )
          const normalized = stdout
            .replace(/^diff --git .*$/m, `diff --git a/${relPath} b/${relPath}`)
            .replace(/^\+\+\+ .*$/m, `+++ b/${relPath}`)
          return { success: true, diff: normalized, binary: /^(Binary files|GIT binary patch)/m.test(stdout) }
        }

        const args = staged
          ? ['diff', '--cached', '--unified=3', '--no-renames', '--', relPath]
          : ['diff', '--unified=3', '--no-renames', '--', relPath]
        const { stdout } = await runGitAllowDiffExit(args, cwd)

        return { success: true, diff: stdout, binary: /^(Binary files|GIT binary patch)/m.test(stdout) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to read diff' }
      }
    }
  )

  // Apply a patch fragment. The renderer builds single-hunk patches from a parsed
  // diff, so this is the one primitive behind stage-hunk / unstage-hunk / discard-hunk:
  //   stage   -> { cached: true }
  //   unstage -> { cached: true, reverse: true }
  //   discard -> { reverse: true }
  ipcMain.handle(
    'git-apply-patch',
    async (_, patch: string, options?: { reverse?: boolean; cached?: boolean }): Promise<GitApplyResult> => {
      const cwd = getCwd()

      if (!patch || !patch.trim()) {
        return { success: false, error: 'Empty patch' }
      }

      // git apply requires a trailing newline
      const body = patch.endsWith('\n') ? patch : `${patch}\n`
      const patchFile = path.join(app.getPath('temp'), `crest-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`)

      try {
        await fs.writeFile(patchFile, body, 'utf-8')

        const args = ['apply', '--whitespace=nowarn']
        if (options?.cached) args.push('--cached')
        if (options?.reverse) args.push('--reverse')
        args.push(patchFile)

        // --check first so a failure leaves the tree untouched instead of half-applied
        await runGitCommandSafe([...args.slice(0, -1), '--check', patchFile], cwd)
        await runGitCommandSafe(args, cwd)

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply patch'
        }
      } finally {
        await fs.unlink(patchFile).catch(() => {})
      }
    }
  )

  ipcMain.handle('git-stage-file', async (_, relPath: string): Promise<GitApplyResult> => {
    const cwd = getCwd()
    try {
      if (!resolveInRepo(cwd, relPath)) return { success: false, error: 'Path is outside the repository' }
      await runGitCommandSafe(['add', '--', relPath], cwd)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stage file' }
    }
  })

  ipcMain.handle('git-unstage-file', async (_, relPath: string): Promise<GitApplyResult> => {
    const cwd = getCwd()
    try {
      if (!resolveInRepo(cwd, relPath)) return { success: false, error: 'Path is outside the repository' }
      await runGitCommandSafe(['restore', '--staged', '--', relPath], cwd)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to unstage file' }
    }
  })

  // Destructive: throws away working-tree changes for one file. The index is left
  // alone, and untracked files are deleted outright. The UI confirms before calling.
  ipcMain.handle(
    'git-discard-file',
    async (_, relPath: string, untracked: boolean): Promise<GitApplyResult> => {
      const cwd = getCwd()
      try {
        const absolute = resolveInRepo(cwd, relPath)
        if (!absolute) return { success: false, error: 'Path is outside the repository' }

        if (untracked) {
          await fs.rm(absolute, { force: true })
          return { success: true }
        }

        await runGitCommandSafe(['restore', '--worktree', '--', relPath], cwd)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to discard changes' }
      }
    }
  )
}
