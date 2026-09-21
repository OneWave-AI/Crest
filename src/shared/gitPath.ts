const GIT_ESCAPES: Record<string, number> = {
  a: 0x07, b: 0x08, t: 0x09, n: 0x0a, v: 0x0b, f: 0x0c, r: 0x0d,
  '"': 0x22, '\\': 0x5c
}

/**
 * Undo git's path quoting (core.quotePath).
 *
 * Two things make this more than a few .replace() calls. Git escapes
 * non-ASCII as octal per UTF-8 BYTE -- `café.tsx` arrives as
 * `"caf\303\251.tsx"` -- so the result has to be assembled as bytes and
 * decoded once at the end, not char by char. And the unescaping has to be a
 * single left-to-right pass: replacing \n before \\ turns a file genuinely
 * named `a\nb.txt` (backslash, letter n) into one with a real newline, and
 * then no such file exists.
 */
export function unquoteGitPath(filePath: string): string {
  if (!filePath.startsWith('"') || !filePath.endsWith('"') || filePath.length < 2) {
    return filePath
  }

  const body = filePath.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      // Non-ASCII can also arrive unescaped; push its UTF-8 bytes as-is.
      for (const b of Buffer.from(body[i], 'utf-8')) bytes.push(b)
      continue
    }

    const next = body[i + 1]
    if (next === undefined) {
      bytes.push(0x5c) // trailing backslash, nothing to escape
      break
    }

    const octal = body.slice(i + 1, i + 4)
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8))
      i += 3
      continue
    }

    const simple = GIT_ESCAPES[next]
    if (simple !== undefined) {
      bytes.push(simple)
      i += 1
      continue
    }

    // Unknown escape: keep both characters rather than silently dropping one.
    bytes.push(0x5c)
    for (const b of Buffer.from(next, 'utf-8')) bytes.push(b)
    i += 1
  }

  return Buffer.from(bytes).toString('utf-8')
}
