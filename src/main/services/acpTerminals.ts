/**
 * Client-side terminal support for ACP.
 *
 * When we advertise `terminal: true`, the agent stops running commands inside its
 * own process and asks *us* to run them. That is what makes command output show up
 * as a live block inside the tool call that spawned it, and it means Crest owns the
 * process tree — we can show it, cap it, and kill it.
 */

import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { AcpTerminalState } from '../../shared/acp'

const DEFAULT_OUTPUT_BYTE_LIMIT = 1024 * 1024

interface TerminalRecord {
  id: string
  command: string
  proc: ChildProcess
  output: string
  truncated: boolean
  byteLimit: number
  exitCode: number | null
  signal: string | null
  running: boolean
  waiters: ((value: { exitCode: number | null; signal: string | null }) => void)[]
}

export declare interface AcpTerminalRegistry {
  on(event: 'changed', listener: (state: AcpTerminalState) => void): this
}

export class AcpTerminalRegistry extends EventEmitter {
  private readonly terminals = new Map<string, TerminalRecord>()
  private nextId = 1

  create(params: {
    command: string
    args?: string[]
    cwd?: string | null
    env?: { name: string; value: string }[]
    outputByteLimit?: number | null
    defaultCwd: string
  }): string {
    const id = `term-${this.nextId++}`
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const entry of params.env ?? []) env[entry.name] = entry.value

    const proc = spawn(params.command, params.args ?? [], {
      cwd: params.cwd || params.defaultCwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own the process group so kill() takes the children with it.
      detached: process.platform !== 'win32'
    })

    const record: TerminalRecord = {
      id,
      command: [params.command, ...(params.args ?? [])].join(' '),
      proc,
      output: '',
      truncated: false,
      byteLimit: params.outputByteLimit ?? DEFAULT_OUTPUT_BYTE_LIMIT,
      exitCode: null,
      signal: null,
      running: true,
      waiters: []
    }
    this.terminals.set(id, record)

    const append = (chunk: Buffer | string): void => {
      const text = chunk.toString()
      record.output += text
      // Keep the tail; the head of a runaway build log is rarely the interesting part.
      if (Buffer.byteLength(record.output, 'utf-8') > record.byteLimit) {
        record.truncated = true
        record.output = record.output.slice(-record.byteLimit)
      }
      this.emitChanged(record)
    }

    proc.stdout?.on('data', append)
    proc.stderr?.on('data', append)

    proc.on('error', (err) => {
      record.output += `\n${err.message}\n`
      this.finish(record, null, null)
    })
    proc.on('exit', (code, signal) => {
      this.finish(record, code, signal ? String(signal) : null)
    })

    this.emitChanged(record)
    return id
  }

  private finish(record: TerminalRecord, exitCode: number | null, signal: string | null): void {
    if (!record.running) return
    record.running = false
    record.exitCode = exitCode
    record.signal = signal
    for (const waiter of record.waiters) waiter({ exitCode, signal })
    record.waiters = []
    this.emitChanged(record)
  }

  private emitChanged(record: TerminalRecord): void {
    this.emit('changed', this.snapshot(record))
  }

  private snapshot(record: TerminalRecord): AcpTerminalState {
    return {
      terminalId: record.id,
      command: record.command,
      output: record.output,
      truncated: record.truncated,
      exitCode: record.exitCode,
      signal: record.signal,
      running: record.running
    }
  }

  output(terminalId: string): { output: string; truncated: boolean; exitStatus: { exitCode: number | null; signal: string | null } | null } {
    const record = this.require(terminalId)
    return {
      output: record.output,
      truncated: record.truncated,
      exitStatus: record.running ? null : { exitCode: record.exitCode, signal: record.signal }
    }
  }

  waitForExit(terminalId: string): Promise<{ exitCode: number | null; signal: string | null }> {
    const record = this.require(terminalId)
    if (!record.running) {
      return Promise.resolve({ exitCode: record.exitCode, signal: record.signal })
    }
    return new Promise((resolve) => record.waiters.push(resolve))
  }

  kill(terminalId: string): void {
    const record = this.require(terminalId)
    if (!record.running) return
    this.killProcessTree(record)
  }

  /** Release frees the record; the tool call that referenced it keeps its output. */
  release(terminalId: string): void {
    const record = this.terminals.get(terminalId)
    if (!record) return
    if (record.running) this.killProcessTree(record)
    this.terminals.delete(terminalId)
  }

  killAll(): void {
    for (const id of [...this.terminals.keys()]) this.release(id)
  }

  private killProcessTree(record: TerminalRecord): void {
    try {
      if (process.platform !== 'win32' && record.proc.pid) {
        process.kill(-record.proc.pid, 'SIGTERM')
      } else {
        record.proc.kill('SIGTERM')
      }
    } catch {
      // Process already gone — the exit handler will settle the record.
      record.proc.kill('SIGKILL')
    }
  }

  private require(terminalId: string): TerminalRecord {
    const record = this.terminals.get(terminalId)
    if (!record) throw new Error(`Unknown terminal: ${terminalId}`)
    return record
  }
}
