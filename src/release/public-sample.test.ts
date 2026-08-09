import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportPublicSampleScene, isCanonicalPublicSample } from './public-sample'
import { importScene } from '../persistence/import'

const samplePath = resolve(
  process.cwd(),
  'public/samples/future-workstation-apartment.json',
)

describe('public Future Workstation sample', () => {
  it('is the deterministic canonical export of the real template', () => {
    const committed = readFileSync(samplePath, 'utf8')
    const imported = importScene(committed)

    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.scene.metadata.name).toContain('Future Workstation')
    expect(isCanonicalPublicSample(committed)).toBe(true)
    expect(
      isCanonicalPublicSample(exportPublicSampleScene().replace(/\n/g, '\r\n')),
    ).toBe(true)
  })
})
