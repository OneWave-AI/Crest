import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const token = (await readFile(join(homedir(), '.crest/api-token'), 'utf8')).trim()
const connection = JSON.parse(await readFile(join(homedir(), '.crest/api-connection.json'), 'utf8'))
const headers = { Authorization: `Bearer ${token}` }
const client = new Client({ name: 'crest-live-smoke', version: '1.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
const project = await mkdtemp(join(tmpdir(), 'crest-live-smoke-'))
let taskId
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(connection.mcpUrl), { requestInit: { headers } }))
  assert.equal(client.getProtocolEra(), 'modern')
  assert.equal((await client.listTools()).tools.length, 5)
  const status = await fetch(connection.url + '/v1/status', { headers }).then(r => r.json())
  assert.equal(status.app, 'Crest')
  const spec = await fetch(connection.url + '/openapi.json', { headers }).then(r => r.json())
  assert.equal(spec.openapi, '3.1.0')
  await writeFile(join(project, 'add.py'), 'def add(a, b):\n    return a - b\n')
  const started = await client.callTool({ name: 'crest_start_task', arguments: {
    projectPath: project, prompt: 'Fix add(a, b) to return the sum of the two numbers. Preserve the function signature. Only change add.py.',
    files: ['add.py'], mode: 'edit', model: process.env.CREST_SMOKE_MODEL || 'qwen3.5:4b', requestKey: randomUUID()
  } })
  if (started.isError) throw new Error(JSON.stringify(started))
  const task = JSON.parse(started.content.find(item => item.type === 'text').text)
  taskId = task.id
  console.log(JSON.stringify({ phase: 'started', protocol: client.getProtocolEra(), version: status.version, model: task.model, taskId }))
  let result = task
  for (let attempt = 0; attempt < 205 && result.status === 'running'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    result = await fetch(connection.url + '/v1/tasks/' + taskId, { headers }).then(r => r.json())
    if (attempt % 10 === 0) console.log(JSON.stringify({ phase: 'poll', status: result.status }))
  }
  assert.equal(result.status, 'completed', JSON.stringify(result))
  assert.deepEqual(result.changedFiles, ['add.py'])
  execFileSync('python3', ['-c', 'from add import add; assert add(2, 3) == 5; assert add(-2, 3) == 1; assert add(0, 0) == 0; assert add(1.5, 2.5) == 4'], { cwd: project })
  const report = { phase: 'passed', taskId, model: result.model, changedFiles: result.changedFiles, assertions: 4, backupPath: result.backupPath }
  console.log(JSON.stringify(report))
} finally {
  if (taskId) await fetch(connection.url + '/v1/tasks/' + taskId, { method: 'DELETE', headers }).catch(() => {})
  await client.close()
  await rm(project, { recursive: true, force: true })
}
