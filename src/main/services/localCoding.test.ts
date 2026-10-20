import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, readFile, symlink, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LocalCoding, codingFile } from './localCoding'

const dirs: string[] = []
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'crest-coding-')); dirs.push(dir)
  const project = join(dir, 'project'); await mkdir(project)
  await writeFile(join(project, 'add.py'), 'def add(a, b): return a - b\n')
  return { dir, project }
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function done(worker: LocalCoding, id: string) {
  for (let i = 0; i < 100; i++) {
    const task = worker.get(id)
    if (task.status !== 'running') { await new Promise(resolve => setTimeout(resolve, 10)); return task }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Worker did not finish')
}
const answer = (files: { path: string; content: string }[]) => new Response(JSON.stringify({ message: { content: JSON.stringify({ summary: 'Fixed addition. Tests have not been run.', files }) } }))

describe('local coding boundaries', () => {
  it('edits only named files and preserves originals', async () => {
    const { dir, project } = await fixture()
    let requestBody: any
    const worker = new LocalCoding(join(dir, 'backups'), undefined, async (url, init) => {
      expect(url).toBe('http://127.0.0.1:11434/api/chat')
      requestBody = JSON.parse(init!.body as string)
      return answer([{ path: 'add.py', content: 'def add(a, b): return a + b\n' }])
    })
    const task = await done(worker, (await worker.start({ projectPath: project, prompt: 'Fix addition', files: ['add.py'], mode: 'edit', history: [{ role: 'assistant', content: 'Earlier answer' }] })).id)
    expect(task.status).toBe('completed')
    expect(task.changedFiles).toEqual(['add.py'])
    expect(await readFile(join(project, 'add.py'), 'utf8')).toContain('a + b')
    expect(await readFile(join(task.backupPath!, 'originals.json'), 'utf8')).toContain('a - b')
    expect(requestBody.model).toBe('qwen3.5:4b')
    expect(requestBody.format.type).toBe('object')
    expect(requestBody.messages[1]).toEqual({ role: 'assistant', content: 'Earlier answer' })
    expect(requestBody.messages[2].role).toBe('user')
    expect(requestBody.messages[2].content).toContain('Fix addition')
  })
  it('rejects model paths outside the allowlist before any writes', async () => {
    const { dir, project } = await fixture()
    const worker = new LocalCoding(dir, undefined, async () => answer([
      { path: 'add.py', content: 'changed' }, { path: '../outside', content: 'bad' }
    ]))
    const task = await done(worker, (await worker.start({ projectPath: project, prompt: 'fix', files: ['add.py'], mode: 'edit' })).id)
    expect(task.status).toBe('failed')
    expect(task.changedFiles).toEqual([])
    expect(await readFile(join(project, 'add.py'), 'utf8')).toContain('a - b')
  })
  it('does not overwrite edits made while the model is working', async () => {
    const { dir, project } = await fixture()
    const worker = new LocalCoding(dir, undefined, async () => {
      await writeFile(join(project, 'add.py'), 'user edit')
      return answer([{ path: 'add.py', content: 'model edit' }])
    })
    const task = await done(worker, (await worker.start({ projectPath: project, prompt: 'fix', files: ['add.py'], mode: 'edit' })).id)
    expect(task.status).toBe('failed')
    expect(await readFile(join(project, 'add.py'), 'utf8')).toBe('user edit')
  })
  it('blocks traversal, sensitive files, and symlinks', async () => {
    const { dir, project } = await fixture()
    await symlink(dir, join(project, 'escape'))
    for (const path of ['../bad', '/tmp/bad', '.env', '.git/config', 'escape/file', 'a/../b']) {
      await expect(codingFile(project, path)).rejects.toThrow()
    }
  })
  it('cancels an in-flight request and prevents writes', async () => {
    const { dir, project } = await fixture()
    const worker = new LocalCoding(dir, undefined, async (_, init) => new Promise((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('Aborted')))
    }))
    const task = await worker.start({ projectPath: project, prompt: 'fix', files: ['add.py'], mode: 'edit' })
    expect(worker.cancel(task.id).status).toBe('cancelled')
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(worker.get(task.id).changedFiles).toEqual([])
    expect(await readFile(join(project, 'add.py'), 'utf8')).toContain('a - b')
  })
  it('refuses remote model hosts', () => {
    expect(() => new LocalCoding('/tmp/backups', 'https://example.com')).toThrow('local HTTP')
  })
  it('keeps task handles across restart and deduplicates retry keys', async () => {
    const { dir, project } = await fixture()
    const input = { projectPath: project, prompt: 'Review', requestKey: 'retry-1' }
    const worker = new LocalCoding(join(dir, 'jobs'), undefined, async () => answer([]))
    const task = await done(worker, (await worker.start(input)).id)
    expect((await worker.start(input)).id).toBe(task.id)
    const restarted = new LocalCoding(join(dir, 'jobs'))
    await restarted.initialize()
    expect(restarted.get(task.id).status).toBe('completed')
    expect((await restarted.start(input)).id).toBe(task.id)
    await expect(restarted.start({ ...input, prompt: 'Different work' })).rejects.toMatchObject({ status: 409 })
  })
})
