import { getCatalogDefinition } from '../catalog/catalog'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import type { Entity, SceneDocument } from '../domain/schema'

export function createPerformanceScene(count: number): SceneDocument {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('Performance scene count must be an integer from 1 through 100.')
  let next = 0
  const nextId = () => `performance-${++next}`
  const scene = createFutureWorkstationScene({
    idFactory: nextId,
    now: () => '2026-08-06T00:00:00.000Z',
  })
  const definition = getCatalogDefinition('table.side')
  const columns = Math.ceil(Math.sqrt(count))
  const additions = Array.from({ length: count }, (_, index): Entity => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      id: nextId(),
      kind: definition.category,
      name: `Performance table ${String(index + 1).padStart(3, '0')}`,
      parentId: null,
      transform: {
        position: {
          x: (column - (columns - 1) / 2) * 250,
          y: definition.defaultDimensions.height / 2,
          z: (row - (Math.ceil(count / columns) - 1) / 2) * 250,
        },
        rotation: { x: 0, y: 0, z: 0 },
      },
      dimensions: { ...definition.defaultDimensions },
      catalog: { itemId: definition.id, revision: definition.revision, extensions: {} },
      overrides: {},
      ports: definition.ports.map((port) => ({
        id: nextId(),
        name: port.displayName.en,
        kind: port.kind,
        ...(port.position ? { position: { ...port.position } } : {}),
        ...(port.direction ? { direction: { ...port.direction } } : {}),
        extensions: { ...port.extensions, catalogPortId: port.id },
      })),
      properties: {},
      visible: true,
      locked: false,
      extensions: {},
    }
  })
  scene.entities.push(...additions)
  return scene
}
