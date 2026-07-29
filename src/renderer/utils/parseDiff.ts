/**
 * Minimal unified-diff parser, plus a patch builder that can emit a single hunk
 * as a standalone patch. `git apply` accepts the result verbatim, which is what
 * makes per-hunk stage / unstage / discard possible without any diff library.
 *
 * Line numbers shift once a hunk is applied, so callers must re-read the diff
 * after every apply rather than reusing a stale parse.
 */

export type DiffLineType = 'context' | 'add' | 'del' | 'nonewline'

export interface DiffLine {
  type: DiffLineType
  /** Line content without the leading +/-/space marker */
  text: string
  /** Original line, marker included — used verbatim when rebuilding a patch */
  raw: string
  oldLine?: number
  newLine?: number
}

export interface DiffHunk {
  /** The literal `@@ -a,b +c,d @@ ...` line */
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
  insertions: number
  deletions: number
}

export interface ParsedDiff {
  /** Everything above the first hunk (`diff --git`, `index`, `---`, `+++`) */
  header: string[]
  hunks: DiffHunk[]
  binary: boolean
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export function parseUnifiedDiff(diff: string): ParsedDiff {
  const result: ParsedDiff = { header: [], hunks: [], binary: false }
  if (!diff) return result

  const lines = diff.split('\n')
  let current: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (/^(Binary files|GIT binary patch)/.test(line)) {
      result.binary = true
      continue
    }

    const match = line.match(HUNK_HEADER)
    if (match) {
      current = {
        header: line,
        oldStart: parseInt(match[1], 10),
        oldLines: match[2] === undefined ? 1 : parseInt(match[2], 10),
        newStart: parseInt(match[3], 10),
        newLines: match[4] === undefined ? 1 : parseInt(match[4], 10),
        lines: [],
        insertions: 0,
        deletions: 0
      }
      oldLine = current.oldStart
      newLine = current.newStart
      result.hunks.push(current)
      continue
    }

    if (!current) {
      // Trailing blank from the final split is not part of the header
      if (line !== '' || result.header.length === 0) result.header.push(line)
      continue
    }

    if (line.startsWith('\\')) {
      // "\ No newline at end of file" — belongs to the hunk, counts as no line
      current.lines.push({ type: 'nonewline', text: line.slice(2), raw: line })
      continue
    }

    if (line.startsWith('+')) {
      current.lines.push({ type: 'add', text: line.slice(1), raw: line, newLine })
      current.insertions++
      newLine++
      continue
    }

    if (line.startsWith('-')) {
      current.lines.push({ type: 'del', text: line.slice(1), raw: line, oldLine })
      current.deletions++
      oldLine++
      continue
    }

    if (line.startsWith(' ')) {
      current.lines.push({ type: 'context', text: line.slice(1), raw: line, oldLine, newLine })
      oldLine++
      newLine++
      continue
    }

    // A bare empty line inside a hunk is a context line whose space git dropped
    if (line === '') {
      const consumed = current.lines.reduce(
        (n, l) => n + (l.type === 'context' || l.type === 'del' ? 1 : 0),
        0
      )
      if (consumed >= current.oldLines) break // past the end of this hunk
      current.lines.push({ type: 'context', text: '', raw: ' ', oldLine, newLine })
      oldLine++
      newLine++
    }
  }

  // Drop the trailing header noise git emits for empty diffs
  result.header = result.header.filter((line) => line.length > 0)

  return result
}

/**
 * Rebuild a one-hunk patch. The header lines are reused as-is so the paths
 * still match what git expects, and the hunk is emitted byte-identical to the
 * source diff — no line-count recalculation, so nothing can drift.
 */
export function buildHunkPatch(parsed: ParsedDiff, hunk: DiffHunk): string {
  const header = parsed.header.filter(
    (line) =>
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
  )

  const body = hunk.lines.map((line) => line.raw)
  return [...header, hunk.header, ...body].join('\n') + '\n'
}

/** Total insertions/deletions across a parsed diff */
export function diffStats(parsed: ParsedDiff): { insertions: number; deletions: number } {
  return parsed.hunks.reduce(
    (acc, hunk) => ({
      insertions: acc.insertions + hunk.insertions,
      deletions: acc.deletions + hunk.deletions
    }),
    { insertions: 0, deletions: 0 }
  )
}

export interface SplitRow {
  left?: DiffLine
  right?: DiffLine
}

/**
 * Pair a hunk's lines into side-by-side rows: context lines sit on both sides,
 * and each run of deletions is zipped against the run of additions that follows.
 */
export function toSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0

  while (i < hunk.lines.length) {
    const line = hunk.lines[i]

    if (line.type === 'context') {
      rows.push({ left: line, right: line })
      i++
      continue
    }

    if (line.type === 'nonewline') {
      i++
      continue
    }

    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < hunk.lines.length && hunk.lines[i].type === 'del') dels.push(hunk.lines[i++])
    while (i < hunk.lines.length && hunk.lines[i].type === 'add') adds.push(hunk.lines[i++])

    // Nothing consumed (e.g. an add-only run) — take one line and move on
    if (dels.length === 0 && adds.length === 0) {
      rows.push({ right: line })
      i++
      continue
    }

    for (let j = 0; j < Math.max(dels.length, adds.length); j++) {
      rows.push({ left: dels[j], right: adds[j] })
    }
  }

  return rows
}
