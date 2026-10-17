import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const CRYPTO_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](?:node:)?crypto['"]/
const RELATIVE_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g
const NODE_CIPHER = /\b(?:createCipheriv|createDecipheriv|hkdfSync)\b/
const REQUIRED = ['index.js', 'index.cjs', 'index.d.ts']

function filesUnder(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

function resolveRelative(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of ['.js', '.cjs', '.mjs']) {
    if (existsSync(base + ext)) return base + ext
  }
  throw new Error(`${fromFile} imports missing file ${specifier}`)
}

function importClosure(entry) {
  const seen = []
  const queue = [entry]
  const visited = new Set()
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)
    seen.push(file)
    const text = readFileSync(file, 'utf8')
    RELATIVE_IMPORT.lastIndex = 0
    for (const match of text.matchAll(RELATIVE_IMPORT)) {
      const specifier = match[1]
      if (!specifier) continue
      queue.push(resolveRelative(file, specifier))
    }
  }
  return seen
}

function assertNoNodeCrypto(path) {
  const text = readFileSync(path, 'utf8')
  if (CRYPTO_IMPORT.test(text)) {
    throw new Error(`${path} imports node:crypto or crypto`)
  }
  if (NODE_CIPHER.test(text)) {
    throw new Error(`${path} contains Node crypto helpers from encrypt.ts`)
  }
}

function assertRecoveryDir(dir) {
  for (const name of REQUIRED) {
    const path = join(dir, name)
    try {
      statSync(path)
    } catch {
      throw new Error(`missing ${path}`)
    }
  }

  const bundled = new Set([
    ...importClosure(join(dir, 'index.js')),
    ...importClosure(join(dir, 'index.cjs')),
    ...filesUnder(dir).filter((path) => /\.(?:d\.ts|d\.cts)$/.test(path)),
  ])
  for (const path of bundled) assertNoNodeCrypto(path)

  for (const mapPath of filesUnder(dir).filter((path) => path.endsWith('.map'))) {
    const map = JSON.parse(readFileSync(mapPath, 'utf8'))
    const sources = Array.isArray(map.sources) ? map.sources : []
    if (sources.some((source) => String(source).endsWith('encrypt.ts'))) {
      throw new Error(`${mapPath} includes src/recovery/encrypt.ts`)
    }
  }

  const esm = readFileSync(join(dir, 'index.js'), 'utf8')
  const dts = readFileSync(join(dir, 'index.d.ts'), 'utf8')
  if (!esm.includes('encryptBundleWithWebCrypto') || !dts.includes('encryptBundleWithWebCrypto')) {
    throw new Error(`${dir} is missing the browser sealer export`)
  }
}

function packAndCheck(root) {
  const dest = mkdtempSync(join(tmpdir(), 'zappi-sdk-pack-'))
  try {
    const stdout = execFileSync('npm', ['pack', '--json', '--pack-destination', dest], {
      cwd: root,
      encoding: 'utf8',
    })
    const jsonStart = stdout.indexOf('[')
    if (jsonStart < 0) throw new Error('npm pack did not return JSON')
    const packed = JSON.parse(stdout.slice(jsonStart))
    const filename = packed[0]?.filename
    if (typeof filename !== 'string' || filename.length === 0) {
      throw new Error('npm pack did not report a filename')
    }
    const extract = mkdtempSync(join(tmpdir(), 'zappi-sdk-extract-'))
    try {
      execFileSync('tar', ['-xzf', join(dest, filename), '-C', extract])
      assertRecoveryDir(join(extract, 'package/dist/recovery'))
      console.log(`recovery browser pack ok: ${filename}`)
    } finally {
      rmSync(extract, { recursive: true, force: true })
    }
  } finally {
    rmSync(dest, { recursive: true, force: true })
  }
}

const root = process.cwd()
assertRecoveryDir(join(root, 'dist/recovery'))
if (process.argv.includes('--pack')) packAndCheck(root)
else console.log('recovery browser dist ok')
