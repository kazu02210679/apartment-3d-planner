import { describe, expect, it } from 'vitest'

import { findOutOfBoundsEntityIds, validateSceneInvariants } from '../domain/invariants'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { createPerformanceScene } from './performance-scene'

describe('createPerformanceScene', () => {
  it('preserves the Future Workstation template and appends 100 deterministic simple root entities', () => {
    const first = createPerformanceScene(100)
    const second = createPerformanceScene(100)
    let templateIndex = 0
    const template = createFutureWorkstationScene({
      idFactory: () => `performance-${++templateIndex}`,
      now: () => '2026-08-06T00:00:00.000Z',
    })

    expect(first).toEqual(second)
    expect(first.entities).toHaveLength(template.entities.length + 100)
    expect(first.entities.slice(0, template.entities.length)).toEqual(template.entities)
    const additions = first.entities.slice(template.entities.length)
    expect(additions).toHaveLength(100)
    expect(additions.every((entity) => entity.parentId === null)).toBe(true)
    expect(
      additions.every(
        (entity) =>
          Math.abs(entity.transform.position.x) + entity.dimensions.width / 2 <=
            first.room.width / 2 &&
          Math.abs(entity.transform.position.y) + entity.dimensions.height / 2 <=
            first.room.height / 2 &&
          Math.abs(entity.transform.position.z) + entity.dimensions.depth / 2 <=
            first.room.depth / 2,
      ),
    ).toBe(true)
    expect(findOutOfBoundsEntityIds(first)).toEqual([])
    expect(new Set(first.entities.map((entity) => entity.id)).size).toBe(
      template.entities.length + 100,
    )
    expect(
      new Set(first.entities.flatMap((entity) => entity.ports.map((port) => port.id)))
        .size,
    ).toBe(first.entities.flatMap((entity) => entity.ports).length)
    expect(() => validateSceneInvariants(first)).not.toThrow()
  })
})
