import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/recovery')
const CRYPTO_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](?:node:)?crypto['"]/
const SPECIFIER = /(?:from|import)\s*(?:\(\s*)?['"](\.[^'"]+)['"]/g

function resolveImport(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier)
  return base.endsWith('.ts') ? base : `${base}.ts`
}

function walk(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return []
  seen.add(file)
  const text = readFileSync(file, 'utf8')
  const next = [...text.matchAll(SPECIFIER)].map((match) => resolveImport(file, match[1] ?? ''))
  return [file, ...next.flatMap((child) => walk(child, seen))]
}

describe('browser recovery entry', () => {
  it('does not reach encrypt.ts or node:crypto', () => {
    const files = walk(resolve(SRC, 'browser.ts'))
    expect(files.some((file) => file.endsWith('/encrypt.ts'))).toBe(false)
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(CRYPTO_IMPORT)
    }
  })
})
