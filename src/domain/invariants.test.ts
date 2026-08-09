import { describe, expect, it } from 'vitest'

import { createEmptyScene, resizeRoom } from './scene'
import { type SceneDocument } from './schema'
import { validateSceneInvariants } from './invariants'
import { normalizeScene } from './normalize'

const fixedTimestamp = '2026-08-06T00:00:00.000Z'

function makeScene(): SceneDocument {
  let nextId = 0

  return createEmptyScene('6-tatami', {
    idFactory: () => `invariant-id-${++nextId}`,
    now: () => fixedTimestamp,
  })
}

function makeEntity(
  id: string,
  position: { x: number; y: number; z: number },
  parentId: string | null = null,
): SceneDocument['entities'][number] {
  return {
    id,
    kind: 'desk',
    name: `Entity ${id}`,
    parentId,
    transform: {
      position,
      rotation: { x: 0, y: 0, z: 0 },
    },
    dimensions: { width: 100, depth: 100, height: 100 },
    catalog: { itemId: 'desk.basic', revision: '1', extensions: {} },
    overrides: { material: 'oak' },
    ports: [
      {
        id: `${id}-power`,
        name: 'Power',
        kind: 'power',
        position: { x: 0, y: 0, z: 0 },
        extensions: {},
      },
    ],
    properties: { wattage: 60 },
    visible: true,
    locked: false,
    extensions: { source: 'test' },
  }
}

describe('SceneDocument graph invariants', () => {
  it('rejects duplicate IDs instead of making selection and connections ambiguous', () => {
    const scene = makeScene()
    scene.entities.push(makeEntity('duplicate-id', { x: 0, y: 500, z: 0 }))
    scene.entities.push(makeEntity('duplicate-id', { x: 200, y: 500, z: 0 }))

    expect(() => validateSceneInvariants(scene)).toThrow('duplicate-id')
  })

  it('rejects a missing parent instead of leaving an orphaned hierarchy reference', () => {
    const scene = makeScene()
    scene.entities.push(
      makeEntity('child-id', { x: 0, y: 500, z: 0 }, 'missing-parent-id'),
    )

    expect(() => validateSceneInvariants(scene)).toThrow('missing-parent')
  })

  it('rejects parent cycles instead of allowing recursive scene traversal', () => {
    const scene = makeScene()
    scene.entities.push(makeEntity('parent-a', { x: 0, y: 500, z: 0 }, 'parent-b'))
    scene.entities.push(makeEntity('parent-b', { x: 200, y: 500, z: 0 }, 'parent-a'))

    expect(() => validateSceneInvariants(scene)).toThrow('parent-cycle')
  })

  it('rejects dangling connection ports instead of persisting an unresolvable endpoint', () => {
    const scene = makeScene()
    scene.entities.push(makeEntity('entity-a', { x: 0, y: 500, z: 0 }))
    scene.entities.push(makeEntity('entity-b', { x: 200, y: 500, z: 0 }))
    scene.connections.push({
      id: 'connection-id',
      endpoints: [
        { entityId: 'entity-a', portId: 'entity-a-power' },
        { entityId: 'entity-b', portId: 'missing-port-id' },
      ],
      kind: 'power',
      properties: {},
      extensions: {},
    })

    expect(() => validateSceneInvariants(scene)).toThrow('dangling-port')
  })

  it('validates cable routing at invariant boundaries and reserves it for cable entities', () => {
    const invalidCable = makeEntity('cable', { x: 0, y: 500, z: 0 })
    invalidCable.catalog = { itemId: 'cable.generic', revision: '1', extensions: {} }
    invalidCable.properties = {
      routing: { version: 1, kind: 'power', diameterMm: -1, waypoints: [] },
    }
    const cableScene = makeScene()
    cableScene.entities.push(invalidCable)
    expect(() => validateSceneInvariants(cableScene)).toThrow('invalid-routing')

    const invalidNonCable = makeEntity('non-cable', { x: 0, y: 500, z: 0 })
    invalidNonCable.properties = {
      routing: { version: 1, kind: 'generic', diameterMm: 8, waypoints: [] },
    }
    const nonCableScene = makeScene()
    nonCableScene.entities.push(invalidNonCable)
    expect(() => validateSceneInvariants(nonCableScene)).toThrow('routing-on-noncable')
  })

  it('blocks a new canonical attachment when a cable end belongs to a legacy net', () => {
    const cable = makeEntity('cable', { x: 0, y: 500, z: 0 })
    cable.catalog = { itemId: 'cable.generic', revision: '1', extensions: {} }
    cable.ports = [
      { id: 'end-a', name: 'A', kind: 'power', extensions: { catalogPortId: 'end-a' } },
      { id: 'end-b', name: 'B', kind: 'power', extensions: { catalogPortId: 'end-b' } },
    ]
    const firstTarget = makeEntity('first-target', { x: 0, y: 500, z: 0 })
    const secondTarget = makeEntity('second-target', { x: 0, y: 500, z: 0 })
    const scene = makeScene()
    scene.entities.push(cable, firstTarget, secondTarget)
    scene.connections.push(
      {
        id: 'legacy-net',
        endpoints: [
          { entityId: 'cable', portId: 'end-a' },
          { entityId: 'first-target', portId: 'first-target-power' },
          { entityId: 'second-target', portId: 'second-target-power' },
        ],
        properties: {},
        extensions: {},
      },
      {
        id: 'competing-canonical',
        endpoints: [
          { entityId: 'cable', portId: 'end-a' },
          { entityId: 'second-target', portId: 'second-target-power' },
        ],
        properties: {},
        extensions: {},
      },
    )

    expect(() => validateSceneInvariants(scene)).toThrow('duplicate-cable-attachment')
  })

  it('rejects duplicate endpoint pairs and incompatible canonical cable targets', () => {
    const cable = makeEntity('cable', { x: 0, y: 500, z: 0 })
    cable.catalog = { itemId: 'cable.generic', revision: '1', extensions: {} }
    cable.ports = [
      { id: 'end-a', name: 'A', kind: 'power', extensions: { catalogPortId: 'end-a' } },
      { id: 'end-b', name: 'B', kind: 'power', extensions: { catalogPortId: 'end-b' } },
    ]
    cable.properties = {
      routing: { version: 1, kind: 'power', diameterMm: 8, waypoints: [] },
    }
    const target = makeEntity('target', { x: 0, y: 500, z: 0 })
    target.ports[0] = { ...target.ports[0]!, kind: 'display' }
    const scene = makeScene()
    scene.entities.push(cable, target)
    scene.connections.push({
      id: 'wrong-kind',
      endpoints: [
        { entityId: 'cable', portId: 'end-a' },
        { entityId: 'target', portId: 'target-power' },
      ],
      properties: {},
      extensions: {},
    })

    expect(() => validateSceneInvariants(scene)).toThrow('incompatible-cable-attachment')
  })

  it('normalizes equivalent documents deterministically without adding renderer state', () => {
    const scene = makeScene()
    scene.entities.push(makeEntity('entity-b', { x: 200, y: 500, z: 0 }))
    scene.entities.push(makeEntity('entity-a', { x: 0, y: 500, z: 0 }))

    const normalized = normalizeScene(scene)
    const roundTripped = normalizeScene(JSON.parse(JSON.stringify(scene)))

    expect(normalized.entities.map((entity) => entity.id)).toEqual([
      'entity-a',
      'entity-b',
    ])
    expect(normalized).toEqual(roundTripped)
    expect(normalized).not.toHaveProperty('renderer')
    expect(normalized).not.toHaveProperty('ui')
  })

  it('omits absent catalog keys during normalization so JSON round trips preserve shape', () => {
    const scene = makeScene()
    const entity = makeEntity('catalog-less-id', { x: 0, y: 500, z: 0 })
    delete entity.catalog
    scene.entities.push(entity)

    const normalized = normalizeScene(scene)

    expect(normalized.entities[0]).not.toHaveProperty('catalog')
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
  })

  it('resizes only the room and returns IDs that are outside the new bounds', () => {
    const scene = makeScene()
    scene.entities.push(makeEntity('inside-id', { x: 0, y: 500, z: 0 }))
    scene.entities.push(makeEntity('outside-id', { x: 1200, y: 500, z: 0 }))
    const entitiesBeforeResize = structuredClone(scene.entities)
    const connectionsBeforeResize = structuredClone(scene.connections)

    const outOfBoundsIds = resizeRoom(scene, {
      width: 1000,
      depth: 3600,
      height: 2400,
    })

    expect(scene.room).toMatchObject({ width: 1000, depth: 3600, height: 2400 })
    expect(outOfBoundsIds).toEqual(['outside-id'])
    expect(scene.entities).toEqual(entitiesBeforeResize)
    expect(scene.connections).toEqual(connectionsBeforeResize)
  })

  it('maps unequal width, depth, and height to the correct world axes at zero rotation', () => {
    const scene = makeScene()
    const entity = makeEntity('unequal-axis-id', { x: 0, y: 100, z: 0 })
    entity.dimensions = { width: 100, depth: 100, height: 2300 }
    scene.entities.push(entity)

    const outOfBoundsIds = resizeRoom(scene, {
      width: 2700,
      depth: 3600,
      height: 2400,
    })

    expect(outOfBoundsIds).toEqual(['unequal-axis-id'])
  })

  it('composes parent translation before checking a child against room bounds', () => {
    const scene = makeScene()
    const parent = makeEntity('translation-parent-id', { x: 1200, y: 0, z: 0 })
    const child = makeEntity('translation-child-id', { x: 300, y: 0, z: 0 }, parent.id)
    scene.entities.push(parent, child)

    const outOfBoundsIds = resizeRoom(scene, {
      width: 2700,
      depth: 3600,
      height: 2400,
    })

    expect(outOfBoundsIds).toEqual(['translation-child-id'])
  })

  it('composes parent rotation before applying a child world-space extent', () => {
    const scene = makeScene()
    const parent = makeEntity('rotation-parent-id', { x: 0, y: 0, z: 0 })
    parent.transform.rotation.z = 90
    const child = makeEntity('rotation-child-id', { x: 1150, y: 0, z: 0 }, parent.id)
    child.dimensions = { width: 300, depth: 100, height: 100 }
    scene.entities.push(parent, child)

    const outOfBoundsIds = resizeRoom(scene, {
      width: 2700,
      depth: 3600,
      height: 2400,
    })

    expect(outOfBoundsIds).toEqual(['rotation-child-id'])
  })
})
