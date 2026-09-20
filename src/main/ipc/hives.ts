import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { Hive, HiveOperationResult } from '../../shared/types'

// Get hives config path
function getHivesPath(): string {
  return path.join(os.homedir(), '.claude', 'arena-hives.json')
}

// Default hives that ship with the app
const DEFAULT_HIVES: Hive[] = [
  {
    id: 'audit',
    name: 'Audit',
    icon: 'Search',
    description: 'Spawn agents to review code quality, security, and performance',
    category: 'audit',
    color: '#3b82f6',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM AUDIT MODE ACTIVATED**

Analyze the current situation, our recent conversation, and the codebase context. You need to launch a coordinated agent swarm (minimum 3 agents) to audit and review.

**YOUR TASK:**
1. First, briefly analyze what we've been working on and what needs attention
2. Then CHOOSE 3-5 specialized agents that are most relevant to THIS specific situation
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent perform their analysis and report findings

**AGENT SELECTION GUIDELINES:**
Pick agents based on what's actually needed. Examples of agent types you might choose:
- Code Quality Reviewer (patterns, structure, readability)
- Security Auditor (vulnerabilities, auth, data handling)
- Performance Analyst (bottlenecks, optimization)
- API Reviewer (endpoints, contracts, error handling)
- UI/UX Reviewer (accessibility, responsiveness, UX)
- Test Coverage Analyst (missing tests, edge cases)
- Type Safety Reviewer (TypeScript, type coverage)

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Key findings (with file:line references)
- Severity: CRITICAL | WARNING | INFO
- Recommended actions

Begin by analyzing the context and selecting your agents now.`
  },
  {
    id: 'action',
    name: 'Action',
    icon: 'Zap',
    description: 'Deploy agents to fix issues, refactor, and add tests',
    category: 'action',
    color: '#10b981',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM ACTION MODE ACTIVATED**

Based on our conversation and any previous audit findings, launch a coordinated agent swarm (minimum 3 agents) to take action and implement improvements.

**YOUR TASK:**
1. First, summarize what needs to be fixed/improved based on context
2. Then CHOOSE 3-5 specialized agents that can best address these issues
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Mission]"
4. Have each agent execute their tasks and show the changes

**AGENT SELECTION GUIDELINES:**
Pick agents based on what actions are actually needed. Examples:
- Bug Fixer (fix identified bugs, handle edge cases)
- Security Patcher (fix vulnerabilities, add validation)
- Performance Optimizer (optimize slow code, add caching)
- Refactoring Agent (clean up code, improve structure)
- Test Writer (add unit tests, integration tests)
- Type Fixer (add/fix TypeScript types)
- Error Handler (add try/catch, improve error messages)

**EXECUTION RULES:**
- Prioritize: Security first -> Bugs -> Improvements
- Show each change with file:line references
- Explain what was changed and why
- Each agent should complete their task before the next begins

Begin by analyzing what needs action and selecting your agents now.`
  },
  {
    id: 'design',
    name: 'Design Polish',
    icon: 'Paintbrush',
    description: 'Improve visual design, colors, and UI polish',
    category: 'design',
    color: '#8b5cf6',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM DESIGN POLISH MODE ACTIVATED**

Analyze the UI/UX and visual design of the current codebase. You need to launch a coordinated agent swarm (minimum 3 agents) to polish the design.

**YOUR TASK:**
1. First, analyze the current visual design and identify areas for improvement
2. Then CHOOSE 3-5 specialized design agents that can best address these issues
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent make specific improvements

**FOCUS AREAS:**
- Color consistency and palette
- Spacing and alignment
- Typography hierarchy
- Visual polish and micro-interactions
- Accessibility (contrast, focus states)

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Specific changes (with file:line references)
- Before/after description

Begin by analyzing the design and selecting your agents now.`
  },
  {
    id: 'ui-fix',
    name: 'UI Fix',
    icon: 'Wrench',
    description: 'Fix UI bugs, layout issues, and responsiveness',
    category: 'action',
    color: '#f59e0b',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM UI FIX MODE ACTIVATED**

Scan for and fix UI bugs and layout issues. You need to launch a coordinated agent swarm (minimum 3 agents) to fix UI problems.

**YOUR TASK:**
1. First, scan the codebase for UI bugs and layout issues
2. Then CHOOSE 3-5 specialized agents that can best fix these issues
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Mission]"
4. Have each agent fix their assigned issues

**FOCUS AREAS:**
- Overflow and clipping problems
- Z-index and stacking issues
- Responsive breakpoint bugs
- Hover/focus state issues
- Animation glitches
- Missing error boundaries

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and mission
- Issues found (with file:line references)
- Fixes applied
- Severity: CRITICAL | WARNING | INFO

Begin scanning for UI bugs and selecting your agents now.`
  },
  {
    id: 'routes',
    name: 'Routes',
    icon: 'Route',
    description: 'Analyze and improve routing and navigation',
    category: 'audit',
    color: '#06b6d4',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM ROUTE MODE ACTIVATED**

Analyze and improve routing and navigation. You need to launch a coordinated agent swarm (minimum 3 agents) to improve the routing architecture.

**YOUR TASK:**
1. First, analyze the current routing structure and navigation patterns
2. Then CHOOSE 3-5 specialized agents to audit and improve routing
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent analyze/improve their assigned area

**FOCUS AREAS:**
- Route organization and structure
- Navigation flow and UX
- Deep linking support
- Protected routes and auth guards
- Route transitions and animations
- History management
- SEO (if applicable)

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Findings/improvements (with file:line references)
- Recommendations or changes made

Begin by analyzing the routing architecture and selecting your agents now.`
  },
  {
    id: 'api',
    name: 'API',
    icon: 'Server',
    description: 'Audit API endpoints, contracts, and error handling',
    category: 'audit',
    color: '#ec4899',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM API AUDIT MODE ACTIVATED**

Audit all API endpoints, contracts, and data handling. You need to launch a coordinated agent swarm (minimum 3 agents) to review the API layer.

**YOUR TASK:**
1. First, identify all API endpoints and data contracts in the codebase
2. Then CHOOSE 3-5 specialized agents to audit different API aspects
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent perform their analysis

**FOCUS AREAS:**
- Endpoint consistency and naming
- Request/response validation
- Error handling and status codes
- Authentication and authorization
- Rate limiting and caching
- Documentation and types
- Security vulnerabilities

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Endpoints reviewed
- Issues found (with file:line references)
- Severity: CRITICAL | WARNING | INFO
- Recommendations

Begin by analyzing the API layer and selecting your agents now.`
  },
  {
    id: 'connector',
    name: 'Connector',
    icon: 'Link2',
    description: 'Improve integrations and external connections',
    category: 'action',
    color: '#14b8a6',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM CONNECTOR MODE ACTIVATED**

Analyze and improve all external integrations and connections. You need to launch a coordinated agent swarm (minimum 3 agents) to audit integrations.

**YOUR TASK:**
1. First, identify all external integrations (APIs, databases, services)
2. Then CHOOSE 3-5 specialized agents to improve different integrations
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent analyze/improve their assigned integration

**FOCUS AREAS:**
- External API integrations
- Database connections and queries
- Third-party service integrations
- WebSocket connections
- OAuth/authentication flows
- Error handling and retries
- Connection pooling and performance

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and role
- Integration reviewed
- Issues or improvements (with file:line references)
- Changes made or recommendations

Begin by identifying integrations and selecting your agents now.`
  },
  {
    id: 'research',
    name: 'Research',
    icon: 'Layers',
    description: 'Deep dive analysis and documentation',
    category: 'audit',
    color: '#6366f1',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: `**SWARM RESEARCH MODE ACTIVATED**

Perform a deep research analysis of the codebase. You need to launch a coordinated agent swarm (minimum 3 agents) to understand and document.

**YOUR TASK:**
1. First, identify the main areas that need understanding or documentation
2. Then CHOOSE 3-5 specialized research agents based on the codebase
3. For each agent you spawn, clearly announce: "Spawning Agent: [Name] - [Role]"
4. Have each agent perform their research and report findings

**FOCUS AREAS:**
- Architecture and design patterns
- Data flow and state management
- Dependencies and their purposes
- Code organization and conventions
- Performance characteristics
- Potential technical debt
- Documentation gaps

**OUTPUT FORMAT:**
For each agent, provide:
- Agent name and research focus
- Key findings with examples
- Architecture diagrams (ASCII if needed)
- Recommendations for improvement
- Documentation suggestions

Begin by analyzing the codebase and selecting your research agents now.`
  }
]

// Load hives from disk or return defaults
async function loadHives(): Promise<Hive[]> {
  try {
    const hivesPath = getHivesPath()
    if (fs.existsSync(hivesPath)) {
      const data = fs.readFileSync(hivesPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('[Hives] Error loading hives:', err)
  }
  return DEFAULT_HIVES
}

// Save hives to disk
async function saveHives(hives: Hive[]): Promise<void> {
  try {
    const hivesPath = getHivesPath()
    const dir = path.dirname(hivesPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(hivesPath, JSON.stringify(hives, null, 2))
  } catch (err) {
    console.error('[Hives] Error saving hives:', err)
    throw err
  }
}

// Generate unique ID
function generateId(): string {
  return `hive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function registerHiveHandlers(): void {
  // List all hives
  ipcMain.handle('hive-list', async (): Promise<Hive[]> => {
    return await loadHives()
  })

  // Get single hive
  ipcMain.handle('hive-get', async (_, id: string): Promise<Hive | null> => {
    const hives = await loadHives()
    return hives.find(h => h.id === id) || null
  })

  // Create new hive
  ipcMain.handle('hive-create', async (_, hiveData: Omit<Hive, 'id' | 'createdAt' | 'updatedAt'>): Promise<HiveOperationResult> => {
    try {
      const hives = await loadHives()
      const newHive: Hive = {
        ...hiveData,
        id: generateId(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      hives.push(newHive)
      await saveHives(hives)
      return { success: true, hive: newHive }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Update hive
  ipcMain.handle('hive-update', async (_, id: string, updates: Partial<Hive>): Promise<HiveOperationResult> => {
    try {
      const hives = await loadHives()
      const index = hives.findIndex(h => h.id === id)
      if (index === -1) {
        return { success: false, error: 'Hive not found' }
      }
      hives[index] = {
        ...hives[index],
        ...updates,
        id: hives[index].id, // Don't allow ID change
        updatedAt: Date.now()
      }
      await saveHives(hives)
      return { success: true, hive: hives[index] }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Delete hive
  ipcMain.handle('hive-delete', async (_, id: string): Promise<HiveOperationResult> => {
    try {
      const hives = await loadHives()
      const index = hives.findIndex(h => h.id === id)
      if (index === -1) {
        return { success: false, error: 'Hive not found' }
      }
      const deleted = hives.splice(index, 1)[0]
      await saveHives(hives)
      return { success: true, hive: deleted }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Reset to defaults
  ipcMain.handle('hive-reset', async (): Promise<HiveOperationResult> => {
    try {
      await saveHives(DEFAULT_HIVES)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
