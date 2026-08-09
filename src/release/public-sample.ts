import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import type { SceneDocument } from '../domain/schema'
import { exportScene } from '../persistence/export'

export const PUBLIC_SAMPLE_TIMESTAMP = '2026-08-06T00:00:00.000Z'

function createPublicSampleIdFactory() {
  let index = 0
  return () => `future-workstation-${String(++index).padStart(4, '0')}`
}

export function createPublicSampleScene(): SceneDocument {
  const scene = createFutureWorkstationScene({
    idFactory: createPublicSampleIdFactory(),
    now: () => PUBLIC_SAMPLE_TIMESTAMP,
  })
  scene.metadata.name = 'Future Workstation Apartment'
  scene.metadata.description = 'Deterministic public sample for the local-first planner.'
  scene.metadata.tags = ['sample', 'future-workstation', 'apartment']
  return scene
}

export function exportPublicSampleScene(): string {
  return exportScene(createPublicSampleScene())
}

export function isCanonicalPublicSample(value: string): boolean {
  return value === exportPublicSampleScene()
}
