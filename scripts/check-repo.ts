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

for (const path of tracked) {
  files.set(path, readFileSync(resolve(repositoryRoot, path), 'utf8'))
}

const samplePath = 'public/samples/future-workstation-apartment.json'
const violations = scanRepositoryFiles(files)
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
