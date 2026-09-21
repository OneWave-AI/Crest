import { describe, it, expect } from 'vitest'
import { unquoteGitPath } from './gitPath'

describe('unquoteGitPath', () => {
  it('leaves an unquoted path alone', () => {
    expect(unquoteGitPath('src/main/index.ts')).toBe('src/main/index.ts')
  })

  it('decodes octal escapes as UTF-8 bytes', () => {
    // git emits `"caf\303\251.tsx"` for café.tsx -- octal per UTF-8 byte, so
    // the pair has to be decoded together, not one character at a time.
    expect(unquoteGitPath(String.raw`"caf\303\251.tsx"`)).toBe('café.tsx')
  })

  it('decodes multi-byte CJK', () => {
    expect(unquoteGitPath(String.raw`"\346\226\207\346\241\243.md"`)).toBe('文档.md')
  })

  it('decodes a 4-byte emoji', () => {
    expect(unquoteGitPath(String.raw`"\360\237\232\200.ts"`)).toBe('🚀.ts')
  })

  it('keeps a literal backslash-n as two characters', () => {
    // The regression: unescaping \n before \\ turned a file named a\nb.txt
    // (backslash, letter n) into one with a real newline, which does not exist.
    expect(unquoteGitPath('"a\\\\nb.txt"')).toBe('a\\nb.txt')
  })

  it('decodes a real newline escape', () => {
    expect(unquoteGitPath(String.raw`"a\nb.txt"`)).toBe('a\nb.txt')
  })

  it('decodes an escaped quote', () => {
    expect(unquoteGitPath(String.raw`"say \"hi\".txt"`)).toBe('say "hi".txt')
  })

  it('decodes tab and carriage return', () => {
    expect(unquoteGitPath(String.raw`"a\tb\rc"`)).toBe('a\tb\rc')
  })

  it('handles a path that is only a quoted space', () => {
    expect(unquoteGitPath('" "')).toBe(' ')
  })

  it('keeps an unknown escape rather than dropping a character', () => {
    expect(unquoteGitPath(String.raw`"a\qb"`)).toBe('a\\qb')
  })

  it('survives a trailing backslash', () => {
    expect(unquoteGitPath('"ab\\"')).toBe('ab\\')
  })

  it('ignores a lone quote character', () => {
    expect(unquoteGitPath('"')).toBe('"')
  })

  it('round-trips a realistic mixed path', () => {
    expect(unquoteGitPath(String.raw`"src/caf\303\251/\346\226\207.tsx"`)).toBe('src/café/文.tsx')
  })
})
