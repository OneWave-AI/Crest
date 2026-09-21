import { ipcMain, app, dialog } from 'electron'
import * as fs from 'fs/promises'
import { join, normalize, resolve, sep } from 'path'
import { homedir } from 'os'

const CLAUDE_DIR = join(homedir(), '.claude')
const SKILLS_DIR = join(CLAUDE_DIR, 'skills')
const AGENTS_DIR = join(CLAUDE_DIR, 'agents')
const COMMANDS_DIR = join(CLAUDE_DIR, 'commands')
const METADATA_FILE = join(CLAUDE_DIR, 'skills-metadata.json')

// Validate that a path is within allowed directories (skills, agents, or commands).
// The separator matters: a bare startsWith also accepts sibling directories that
// merely share the prefix, so `~/.claude/skills-anything` passed this gate and the
// handlers below read and write arbitrary files.
function isPathAllowed(path: string): boolean {
  const normalizedPath = normalize(resolve(path))
  return [SKILLS_DIR, AGENTS_DIR, COMMANDS_DIR].some(
    (dir) => normalizedPath === dir || normalizedPath.startsWith(dir + sep)
  )
}

interface SkillMetadata {
  categories?: string[]
  lastUsed?: number
  createdAt?: number
  order?: number
}

interface Skill {
  id: string
  name: string
  description: string
  path: string
}

interface Agent {
  id: string
  name: string
  description: string
  path: string
  model?: string
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(CLAUDE_DIR, { recursive: true })
  await fs.mkdir(SKILLS_DIR, { recursive: true })
  await fs.mkdir(AGENTS_DIR, { recursive: true })
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      frontmatter[key] = value
    }
  }

  return frontmatter
}

async function loadMetadata(): Promise<Record<string, SkillMetadata>> {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function saveMetadata(metadata: Record<string, SkillMetadata>): Promise<void> {
  await fs.mkdir(CLAUDE_DIR, { recursive: true })
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2))
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('list-skills', async (): Promise<Skill[]> => {
    await ensureDirectories()
    const skills: Skill[] = []
    const seenIds = new Set<string>()

    // Read from ~/.claude/skills/ (directories with SKILL.md and standalone .md files)
    try {
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue

        if (entry.isDirectory()) {
          // Directory-based skill with SKILL.md
          const skillPath = join(SKILLS_DIR, entry.name, 'SKILL.md')
          try {
            const content = await fs.readFile(skillPath, 'utf-8')
            const frontmatter = parseFrontmatter(content)

            skills.push({
              id: entry.name,
              name: frontmatter.name || entry.name,
              description: frontmatter.description || '',
              path: skillPath
            })
            seenIds.add(entry.name)
          } catch {
            // Skip invalid skills
          }
        } else if (entry.name.endsWith('.md')) {
          // Standalone .md file skill
          const skillPath = join(SKILLS_DIR, entry.name)
          try {
            const content = await fs.readFile(skillPath, 'utf-8')
            const frontmatter = parseFrontmatter(content)
            const id = entry.name.replace('.md', '')

            skills.push({
              id,
              name: frontmatter.name || id,
              description: frontmatter.description || '',
              path: skillPath
            })
            seenIds.add(id)
          } catch {
            // Skip invalid skills
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    // Also read from ~/.claude/commands/ (CLI slash commands)
    try {
      const commandEntries = await fs.readdir(COMMANDS_DIR)

      for (const entry of commandEntries) {
        if (!entry.endsWith('.md') || entry.startsWith('.')) continue

        const id = entry.replace('.md', '')
        if (seenIds.has(id)) continue // Skip duplicates

        const commandPath = join(COMMANDS_DIR, entry)
        try {
          const content = await fs.readFile(commandPath, 'utf-8')
          const frontmatter = parseFrontmatter(content)

          skills.push({
            id,
            name: frontmatter.name || id,
            description: frontmatter.description || '',
            path: commandPath
          })
        } catch {
          // Skip invalid commands
        }
      }
    } catch {
      // Commands directory doesn't exist
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('list-agents', async (): Promise<Agent[]> => {
    await ensureDirectories()
    const agents: Agent[] = []

    try {
      const entries = await fs.readdir(AGENTS_DIR)

      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue

        const agentPath = join(AGENTS_DIR, entry)
        try {
          const content = await fs.readFile(agentPath, 'utf-8')
          const frontmatter = parseFrontmatter(content)
          const id = entry.replace('.md', '')

          agents.push({
            id,
            name: frontmatter.name || id,
            description: frontmatter.description || '',
            path: agentPath,
            model: frontmatter.model
          })
        } catch {
          // Skip invalid agents
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return agents.sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('create-skill', async (_, id: string, name: string, desc: string) => {
    await ensureDirectories()
    const skillDir = join(SKILLS_DIR, id)
    await fs.mkdir(skillDir, { recursive: true })

    const content = `---
name: ${name}
description: ${desc}
---

# ${name}

${desc}
`
    await fs.writeFile(join(skillDir, 'SKILL.md'), content)
  })

  ipcMain.handle('create-agent', async (_, id: string, name: string, desc: string) => {
    await ensureDirectories()

    const content = `---
name: ${name}
description: ${desc}
model: claude-sonnet-4-20250514
---

# ${name}

${desc}
`
    await fs.writeFile(join(AGENTS_DIR, `${id}.md`), content)
  })

  ipcMain.handle('delete-skill', async (_, skillId: string) => {
    const skillDir = join(SKILLS_DIR, skillId)
    await fs.rm(skillDir, { recursive: true, force: true })
  })

  ipcMain.handle('delete-agent', async (_, agentId: string) => {
    const agentPath = join(AGENTS_DIR, `${agentId}.md`)
    await fs.unlink(agentPath)
  })

  ipcMain.handle('read-skill-content', async (_, path: string): Promise<string> => {
    // Validate path is within allowed directories
    if (!isPathAllowed(path)) {
      throw new Error('Access denied: path is outside allowed directories')
    }
    return await fs.readFile(path, 'utf-8')
  })

  ipcMain.handle('save-skill-content', async (_, path: string, content: string) => {
    // Validate path is within allowed directories
    if (!isPathAllowed(path)) {
      throw new Error('Access denied: path is outside allowed directories')
    }
    await fs.writeFile(path, content)
  })

  ipcMain.handle('list-plugins', async () => {
    // TODO: Read from Claude config
    return []
  })

  ipcMain.handle('toggle-plugin', async (_, pluginId: string, enabled: boolean) => {
    // TODO: Update Claude config
    console.log('Toggle plugin:', pluginId, enabled)
  })

  ipcMain.handle('install-starter-kit', async () => {
    await ensureDirectories()
    let skillsInstalled = 0
    let agentsInstalled = 0
    const skipped: string[] = []

    try {
      // Get path to assets (works in dev and production)
      const isDev = !app.isPackaged
      let assetsPath: string

      if (isDev) {
        // In development, assets are in the project root
        assetsPath = join(app.getAppPath(), 'assets')
      } else {
        // In production, assets are copied to resources
        assetsPath = join(process.resourcesPath, 'assets')
      }

      const starterSkillsPath = join(assetsPath, 'starter-skills')
      const starterAgentsPath = join(assetsPath, 'starter-agents')

      // Log paths for debugging
      console.log('Assets path:', assetsPath)
      console.log('Starter skills path:', starterSkillsPath)
      console.log('Starter agents path:', starterAgentsPath)

      // Copy skills
      try {
        // Check if starter skills directory exists
        const skillsDirExists = await fs.access(starterSkillsPath).then(() => true).catch(() => false)
        if (!skillsDirExists) {
          console.warn('Starter skills directory not found:', starterSkillsPath)
        } else {
          const skillEntries = await fs.readdir(starterSkillsPath, { withFileTypes: true })
          for (const entry of skillEntries) {
            // Only process directories (skill folders)
            if (!entry.isDirectory()) continue

            const skillDir = entry.name
            const sourcePath = join(starterSkillsPath, skillDir)
            const destPath = join(SKILLS_DIR, skillDir)

            // Check if already exists
            const exists = await fs.access(destPath).then(() => true).catch(() => false)
            if (exists) {
              skipped.push(skillDir)
              continue
            }

            // Copy recursively
            await fs.cp(sourcePath, destPath, { recursive: true })
            skillsInstalled++
          }
        }
      } catch (err) {
        console.error('Error copying skills:', err)
      }

      // Copy agents
      try {
        // Check if starter agents directory exists
        const agentsDirExists = await fs.access(starterAgentsPath).then(() => true).catch(() => false)
        if (!agentsDirExists) {
          console.warn('Starter agents directory not found:', starterAgentsPath)
        } else {
          const agentFiles = await fs.readdir(starterAgentsPath)
          for (const agentFile of agentFiles) {
            if (!agentFile.endsWith('.md')) continue

            const sourcePath = join(starterAgentsPath, agentFile)
            const destPath = join(AGENTS_DIR, agentFile)

            // Check if already exists
            const exists = await fs.access(destPath).then(() => true).catch(() => false)
            if (exists) {
              skipped.push(agentFile)
              continue
            }

            await fs.copyFile(sourcePath, destPath)
            agentsInstalled++
          }
        }
      } catch (err) {
        console.error('Error copying agents:', err)
      }

      return { success: true, skillsInstalled, agentsInstalled, skipped }
    } catch (err) {
      console.error('Failed to install starter kit:', err)
      return { success: false, skillsInstalled: 0, agentsInstalled: 0 }
    }
  })

  ipcMain.handle('check-starter-kit', async () => {
    await ensureDirectories()
    const skills = await fs.readdir(SKILLS_DIR).catch(() => [])
    const agents = await fs.readdir(AGENTS_DIR).catch(() => [])
    // Filter out hidden files like .DS_Store that macOS creates
    const realSkills = skills.filter((f: string) => !f.startsWith('.'))
    const realAgents = agents.filter((f: string) => !f.startsWith('.'))
    return {
      hasSkills: realSkills.length > 0,
      hasAgents: realAgents.length > 0
    }
  })

  // Duplicate skill
  ipcMain.handle('duplicate-skill', async (_, skillId: string) => {
    await ensureDirectories()
    const sourcePath = join(SKILLS_DIR, skillId)
    let destId = `${skillId}-copy`
    let counter = 1

    // Find unique name
    while (true) {
      const destPath = join(SKILLS_DIR, destId)
      const exists = await fs.access(destPath).then(() => true).catch(() => false)
      if (!exists) break
      destId = `${skillId}-copy-${counter++}`
    }

    const destPath = join(SKILLS_DIR, destId)
    await fs.cp(sourcePath, destPath, { recursive: true })

    // Update name in frontmatter
    const skillFile = join(destPath, 'SKILL.md')
    const content = await fs.readFile(skillFile, 'utf-8')
    const updatedContent = content.replace(/^(---\nname:\s*)(.+)/m, `$1$2 (Copy)`)
    await fs.writeFile(skillFile, updatedContent)

    // Update metadata
    const metadata = await loadMetadata()
    metadata[destId] = {
      createdAt: Date.now(),
      categories: metadata[skillId]?.categories || []
    }
    await saveMetadata(metadata)

    return { success: true, newId: destId }
  })

  // Duplicate agent
  ipcMain.handle('duplicate-agent', async (_, agentId: string) => {
    await ensureDirectories()
    const sourcePath = join(AGENTS_DIR, `${agentId}.md`)
    let destId = `${agentId}-copy`
    let counter = 1

    // Find unique name
    while (true) {
      const destPath = join(AGENTS_DIR, `${destId}.md`)
      const exists = await fs.access(destPath).then(() => true).catch(() => false)
      if (!exists) break
      destId = `${agentId}-copy-${counter++}`
    }

    const destPath = join(AGENTS_DIR, `${destId}.md`)
    const content = await fs.readFile(sourcePath, 'utf-8')
    const updatedContent = content.replace(/^(---\nname:\s*)(.+)/m, `$1$2 (Copy)`)
    await fs.writeFile(destPath, updatedContent)

    // Update metadata
    const metadata = await loadMetadata()
    metadata[`agent:${destId}`] = {
      createdAt: Date.now(),
      categories: metadata[`agent:${agentId}`]?.categories || []
    }
    await saveMetadata(metadata)

    return { success: true, newId: destId }
  })

  // Import skill from content
  ipcMain.handle('import-skill', async (_, id: string, content: string) => {
    await ensureDirectories()
    const skillDir = join(SKILLS_DIR, id)

    // Check if already exists
    const exists = await fs.access(skillDir).then(() => true).catch(() => false)
    if (exists) {
      throw new Error(`Skill "${id}" already exists`)
    }

    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(join(skillDir, 'SKILL.md'), content)

    // Update metadata
    const metadata = await loadMetadata()
    metadata[id] = { createdAt: Date.now() }
    await saveMetadata(metadata)

    return { success: true }
  })

  // Import agent from content
  ipcMain.handle('import-agent', async (_, id: string, content: string) => {
    await ensureDirectories()
    const agentPath = join(AGENTS_DIR, `${id}.md`)

    // Check if already exists
    const exists = await fs.access(agentPath).then(() => true).catch(() => false)
    if (exists) {
      throw new Error(`Agent "${id}" already exists`)
    }

    await fs.writeFile(agentPath, content)

    // Update metadata
    const metadata = await loadMetadata()
    metadata[`agent:${id}`] = { createdAt: Date.now() }
    await saveMetadata(metadata)

    return { success: true }
  })

  // Export skill or agent to file
  ipcMain.handle('export-skill-or-agent', async (_, sourcePath: string, name: string, type: 'skill' | 'agent') => {
    try {
      const content = await fs.readFile(sourcePath, 'utf-8')
      const safeFileName = name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      const fileName = `${safeFileName}.md`

      const result = await dialog.showSaveDialog({
        title: `Export ${type === 'skill' ? 'Skill' : 'Agent'}`,
        defaultPath: join(app.getPath('downloads'), fileName),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' }
      }

      await fs.writeFile(result.filePath, content)
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Export failed' }
    }
  })

  // Get metadata for skill/agent
  ipcMain.handle('get-skill-metadata', async (_, id: string) => {
    const metadata = await loadMetadata()
    return metadata[id] || {}
  })

  // Update metadata for skill/agent
  ipcMain.handle('update-skill-metadata', async (_, id: string, updates: Partial<SkillMetadata>) => {
    const metadata = await loadMetadata()
    metadata[id] = { ...metadata[id], ...updates }
    await saveMetadata(metadata)
    return { success: true }
  })

  // Get all metadata
  ipcMain.handle('get-all-metadata', async () => {
    return await loadMetadata()
  })

  // Save all metadata (for reordering)
  ipcMain.handle('save-all-metadata', async (_, newMetadata: Record<string, SkillMetadata>) => {
    await saveMetadata(newMetadata)
    return { success: true }
  })

  // Update skill/agent last used timestamp
  ipcMain.handle('update-last-used', async (_, id: string) => {
    const metadata = await loadMetadata()
    metadata[id] = { ...metadata[id], lastUsed: Date.now() }
    await saveMetadata(metadata)
    return { success: true }
  })
}

/**
 * Auto-install starter kit for new users on app startup.
 * Checks if skills and agents directories are empty (ignoring hidden files)
 * and copies bundled starter content if so.
 */
export async function autoInstallStarterKit(): Promise<void> {
  await ensureDirectories()

  const skills = (await fs.readdir(SKILLS_DIR).catch(() => [])).filter((f: string) => !f.startsWith('.'))
  const agents = (await fs.readdir(AGENTS_DIR).catch(() => [])).filter((f: string) => !f.startsWith('.'))

  if (skills.length > 0 || agents.length > 0) {
    console.log(`User already has ${skills.length} skills and ${agents.length} agents - skipping starter kit`)
    return
  }

  console.log('New user detected - auto-installing starter kit...')

  const isDev = !app.isPackaged
  const assetsPath = isDev
    ? join(app.getAppPath(), 'assets')
    : join(process.resourcesPath, 'assets')

  const starterSkillsPath = join(assetsPath, 'starter-skills')
  const starterAgentsPath = join(assetsPath, 'starter-agents')

  let skillsInstalled = 0
  let agentsInstalled = 0

  // Copy starter skills
  try {
    const exists = await fs.access(starterSkillsPath).then(() => true).catch(() => false)
    if (exists) {
      const skillEntries = await fs.readdir(starterSkillsPath, { withFileTypes: true })
      for (const entry of skillEntries) {
        if (!entry.isDirectory()) continue
        const destPath = join(SKILLS_DIR, entry.name)
        const destExists = await fs.access(destPath).then(() => true).catch(() => false)
        if (!destExists) {
          await fs.cp(join(starterSkillsPath, entry.name), destPath, { recursive: true })
          skillsInstalled++
        }
      }
    }
  } catch (err) {
    console.error('Error copying starter skills:', err)
  }

  // Copy starter agents
  try {
    const exists = await fs.access(starterAgentsPath).then(() => true).catch(() => false)
    if (exists) {
      const agentFiles = await fs.readdir(starterAgentsPath)
      for (const agentFile of agentFiles) {
        if (!agentFile.endsWith('.md')) continue
        const destPath = join(AGENTS_DIR, agentFile)
        const destExists = await fs.access(destPath).then(() => true).catch(() => false)
        if (!destExists) {
          await fs.copyFile(join(starterAgentsPath, agentFile), destPath)
          agentsInstalled++
        }
      }
    }
  } catch (err) {
    console.error('Error copying starter agents:', err)
  }

  console.log(`Starter kit installed: ${skillsInstalled} skills, ${agentsInstalled} agents`)
}
