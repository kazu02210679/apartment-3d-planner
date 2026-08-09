import { describe, expect, it } from 'vitest'

import type { Entity } from '../../domain/schema'
import { resolveRenderableEntity } from './EntityRenderer'

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    kind: 'display',
    name: 'Monitor',
    parentId: null,
    transform: {
      position: { x: 250, y: 950, z: -100 },
      rotation: { x: 0, y: 90, z: 0 },
    },
    dimensions: { width: 1, depth: 1, height: 1 },
    catalog: {
      itemId: 'display.monitor',
      revision: '1',
      presetId: 'monitor-27',
      extensions: {},
    },
    overrides: {},
    ports: [],
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
    ...overrides,
  }
}

describe('resolveRenderableEntity', () => {
  it('uses the catalog geometry and dimensions instead of stale persisted fallback dimensions', () => {
    const renderable = resolveRenderableEntity(entity(), false, false)

    expect(renderable).toMatchObject({
      dimensions: { width: 598, depth: 220, height: 456 },
      geometry: { kind: 'panel-with-stand' },
      transform: {
        position: [0.25, 0.95, -0.1],
        rotation: [0, 1.57079633, 0],
      },
      state: { selected: false, locked: false, outOfBounds: false },
    })
  })

  it('does not render hidden entities and preserves editor state flags for visible entities', () => {
    expect(resolveRenderableEntity(entity({ visible: false }), true, true)).toBeNull()

    const fallback = resolveRenderableEntity(
      entity({
        catalog: undefined,
        kind: 'group',
        dimensions: { width: 1000, depth: 500, height: 400 },
        visible: true,
        locked: true,
      }),
      true,
      true,
    )

    expect(fallback).toMatchObject({
      dimensions: { width: 1000, depth: 500, height: 400 },
      geometry: { kind: 'box' },
      state: { selected: true, locked: true, outOfBounds: true },
    })
  })
})
