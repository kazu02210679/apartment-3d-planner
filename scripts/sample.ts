import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exportPublicSampleScene } from '../src/release/public-sample'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const samplePath = resolve(
  repositoryRoot,
  'public/samples/future-workstation-apartment.json',
)
const generated = exportPublicSampleScene()
const mode = process.argv[2] ?? 'check'

if (mode === 'generate') {
  mkdirSync(dirname(samplePath), { recursive: true })
  writeFileSync(samplePath, generated, 'utf8')
  process.stdout.write('Generated public Future Workstation sample.\n')
} else if (mode === 'check') {
  let committed: string
  try {
    committed = readFileSync(samplePath, 'utf8')
  } catch {
    throw new Error(
      'The committed public sample is missing. Run npm run sample:generate.',
    )
  }
  if (committed !== generated) {
    throw new Error('The committed public sample is stale. Run npm run sample:generate.')
  }
  process.stdout.write('Public Future Workstation sample is canonical.\n')
} else {
  throw new Error(`Unknown sample command: ${mode}`)
}
