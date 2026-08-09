import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isCanonicalPublicSample } from '../src/release/public-sample'
import { scanRepositoryFiles } from '../src/release/repository-check'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
const files = new Map<string, string>()
const binaryPaths = new Set<string>()

for (const path of tracked) {
  const bytes = readFileSync(resolve(repositoryRoot, path))
  if (bytes.includes(0) || bytes.some((byte) => byte < 9 || (byte > 13 && byte < 32))) {
    binaryPaths.add(path)
  }
  try {
    files.set(path, new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    binaryPaths.add(path)
    files.set(path, '')
  }
}

const samplePath = 'public/samples/future-workstation-apartment.json'
const violations = scanRepositoryFiles(files, binaryPaths)
if (!isCanonicalPublicSample(files.get(samplePath) ?? '')) {
  violations.push(`${samplePath}:stale-or-noncanonical-sample`)
}

if (violations.length > 0) {
  for (const violation of [...new Set(violations)].sort())
    process.stderr.write(`${violation}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Repository public-release checks passed.\n')
}
