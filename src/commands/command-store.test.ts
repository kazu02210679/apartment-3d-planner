import { describe, expect, it } from 'vitest'

import { createCommandStore, type SceneCommand } from './command-store'
import { createEmptyScene } from '../domain/scene'
import { normalizeScene } from '../domain/normalize'
import type { Entity, SceneDocument } from '../domain/schema'

function ids(): () => string {
  let index = 0
  return () => `generated-${++index}`
}

function entity(id: string, parentId: string | null = null): Entity {
  return {
    id,
    kind: 'generic',
    name: id,
    parentId,
    transform: {
      position: { x: 0, y: 100, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    dimensions: { width: 100, depth: 100, height: 100 },
    overrides: {},
    ports: [
      { id: `${id}-a`, name: 'A', extensions: {} },
      { id: `${id}-b`, name: 'B', extensions: {} },
    ],
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

function scene(): SceneDocument {
  return createEmptyScene('6-tatami', {
    idFactory: (() => {
      let index = 0
      return () => `scene-${++index}`
    })(),
    now: () => '2026-08-06T00:00:00.000Z',
  })
}

function digest(value: SceneDocument): string {
  return JSON.stringify(normalizeScene(value))
}

function expectWorldTransformClose(
  actual: ReturnType<ReturnType<typeof createCommandStore>['worldTransform']>,
  expected: ReturnType<ReturnType<typeof createCommandStore>['worldTransform']>,
): void {
  for (const axis of ['x', 'y', 'z'] as const)
    expect(actual.position[axis]).toBeCloseTo(expected.position[axis], 9)
  actual.rotation.forEach((value, index) =>
    expect(value).toBeCloseTo(expected.rotation[index], 9),
  )
}

describe('CommandStore', () => {
  it('executes every persistent command and undo then redo reproduce its normalized digest', () => {
    const initial = scene()
    initial.entities.push(entity('one'), entity('two'))
    const cases: readonly [string, SceneCommand][] = [
      ['add generic entity', { type: 'add-entity', entity: entity('three') }],
      [
        'add catalog entity',
        { type: 'add-catalog-entity', itemId: 'power.strip', id: 'catalog' },
      ],
      ['rename', { type: 'rename-entity', entityId: 'one', name: 'Renamed' }],
      [
        'duplicate',
        {
          type: 'duplicate-entity',
          entityId: 'one',
          id: 'copy',
          portIds: ['copy-a', 'copy-b'],
        },
      ],
      ['delete', { type: 'delete-entity', entityId: 'two' }],
      ['visibility', { type: 'set-visibility', entityId: 'one', visible: false }],
      ['lock', { type: 'set-locked', entityId: 'one', locked: true }],
      [
        'transform',
        {
          type: 'set-transform',
          entityId: 'one',
          transform: {
            position: { x: 5, y: 6, z: 7 },
            rotation: { x: 10, y: 20, z: 30 },
          },
        },
      ],
      [
        'dimensions',
        {
          type: 'set-dimensions',
          entityId: 'one',
          dimensions: { width: 120, depth: 130, height: 140 },
        },
      ],
      [
        'room resize',
        { type: 'resize-room', dimensions: { width: 500, depth: 500, height: 500 } },
      ],
      ['reparent', { type: 'reparent-entity', entityId: 'two', parentId: 'one' }],
      ['group', { type: 'group-entities', group: entity('group'), entityIds: ['two'] }],
      ['ungroup', { type: 'ungroup-entity', entityId: 'two' }],
      [
        'catalog preset',
        {
          type: 'set-catalog',
          entityId: 'one',
          itemId: 'desk.l-shaped-sit-stand',
          presetId: 'standing',
        },
      ],
      [
        'add connection',
        {
          type: 'add-connection',
          connection: {
            id: 'wire',
            kind: 'power',
            endpoints: [
              { entityId: 'one', portId: 'one-a' },
              { entityId: 'two', portId: 'two-a' },
            ],
            properties: {},
            extensions: {},
          },
        },
      ],
      [
        'update connection',
        {
          type: 'update-connection',
          connectionId: 'wire',
          connection: {
            id: 'wire',
            kind: 'data',
            endpoints: [
              { entityId: 'one', portId: 'one-b' },
              { entityId: 'two', portId: 'two-b' },
            ],
            properties: {},
            extensions: {},
          },
        },
      ],
      ['delete connection', { type: 'delete-connection', connectionId: 'wire' }],
    ]

    for (const [name, command] of cases) {
      const store = createCommandStore(initial, { idFactory: ids() })
      if (command.type === 'update-connection' || command.type === 'delete-connection') {
        store.execute({
          type: 'add-connection',
          connection: {
            id: 'wire',
            endpoints: [
              { entityId: 'one', portId: 'one-a' },
              { entityId: 'two', portId: 'two-a' },
            ],
            properties: {},
            extensions: {},
          },
        })
      }
      if (command.type === 'ungroup-entity')
        store.execute({ type: 'reparent-entity', entityId: 'two', parentId: 'one' })
      const before = digest(store.scene)
      store.execute(command)
      const after = digest(store.scene)
      expect(after, name).not.toBe(before)
      store.undo()
      expect(digest(store.scene), `${name} undo`).toBe(before)
      store.redo()
      expect(digest(store.scene), `${name} redo`).toBe(after)
    }
  })

  it('clears redo after executing a replacement command and returns defensive snapshots', () => {
    const store = createCommandStore(scene())
    store.execute({ type: 'add-entity', entity: entity('one') })
    store.undo()
    store.execute({ type: 'add-entity', entity: entity('two') })
    expect(store.redo()).toBe(false)
    const read = store.scene
    read.entities[0].name = 'mutated by caller'
    expect(store.scene.entities[0].name).toBe('two')
  })

  it('keeps scene and history byte-for-byte unchanged after an invalid command', () => {
    const store = createCommandStore(scene())
    const before = JSON.stringify(store.snapshot())
    expect(() =>
      store.execute({ type: 'rename-entity', entityId: 'missing', name: 'nope' }),
    ).toThrow('missing')
    expect(JSON.stringify(store.snapshot())).toBe(before)
  })

  it('rejects missing delete and duplicate roots atomically', () => {
    const store = createCommandStore(scene())
    const before = JSON.stringify(store.snapshot())

    expect(() => store.execute({ type: 'delete-entity', entityId: 'missing' })).toThrow(
      'missing',
    )
    expect(JSON.stringify(store.snapshot())).toBe(before)
    expect(() =>
      store.execute({ type: 'duplicate-entity', entityId: 'missing' }),
    ).toThrow('missing')
    expect(JSON.stringify(store.snapshot())).toBe(before)
  })

  it('rejects locked persistent edits while allowing unlock', () => {
    const initial = scene()
    const locked = entity('locked')
    locked.locked = true
    initial.entities.push(locked)
    const store = createCommandStore(initial)
    expect(() =>
      store.execute({ type: 'rename-entity', entityId: 'locked', name: 'No' }),
    ).toThrow('locked')
    expect(() => store.execute({ type: 'delete-entity', entityId: 'locked' })).toThrow(
      'locked',
    )
    store.execute({ type: 'set-locked', entityId: 'locked', locked: false })
    store.execute({ type: 'rename-entity', entityId: 'locked', name: 'Yes' })
    expect(store.scene.entities[0].name).toBe('Yes')
  })

  it('deletes a subtree and removes every affected connection atomically', () => {
    const initial = scene()
    initial.entities.push(entity('parent'), entity('child', 'parent'), entity('other'))
    initial.connections.push({
      id: 'affected',
      endpoints: [
        { entityId: 'child', portId: 'child-a' },
        { entityId: 'other', portId: 'other-a' },
      ],
      properties: {},
      extensions: {},
    })
    const store = createCommandStore(initial)
    store.execute({ type: 'delete-entity', entityId: 'parent' })
    expect(store.scene.entities.map((candidate) => candidate.id)).toEqual(['other'])
    expect(store.scene.connections).toEqual([])
  })

  it('duplicates a subtree with unique IDs and remaps internal parents and connection endpoints', () => {
    const initial = scene()
    initial.entities.push(entity('parent'), entity('child', 'parent'), entity('other'))
    initial.connections.push({
      id: 'internal',
      endpoints: [
        { entityId: 'parent', portId: 'parent-a' },
        { entityId: 'child', portId: 'child-a' },
      ],
      properties: {},
      extensions: {},
    })
    const store = createCommandStore(initial, { idFactory: ids() })
    store.execute({ type: 'duplicate-entity', entityId: 'parent' })
    const copied = store.scene.entities.filter((candidate) =>
      candidate.id.startsWith('generated-'),
    )
    expect(copied).toHaveLength(2)
    expect(
      copied.some(
        (candidate) =>
          candidate.parentId === copied[0].id || candidate.parentId === copied[1].id,
      ),
    ).toBe(true)
    expect(store.scene.connections).toHaveLength(2)
    const copiedConnection = store.scene.connections.find(
      (connection) => connection.id !== 'internal',
    )
    expect(
      copiedConnection?.endpoints.every((endpoint) =>
        endpoint.entityId.startsWith('generated-'),
      ),
    ).toBe(true)
    expect(
      new Set(copied.flatMap((candidate) => candidate.ports.map((port) => port.id))).size,
    ).toBe(4)
  })

  it('assigns explicit duplicate root and port IDs to the requested root despite normalized child-first ordering', () => {
    const initial = scene()
    initial.entities.push(entity('z-parent'), entity('a-child', 'z-parent'))
    const store = createCommandStore(initial, { idFactory: ids() })

    store.execute({
      type: 'duplicate-entity',
      entityId: 'z-parent',
      id: 'copied-root',
      portIds: ['copied-root-a', 'copied-root-b'],
    })

    const copiedRoot = store.scene.entities.find(
      (candidate) => candidate.id === 'copied-root',
    )
    const copiedChild = store.scene.entities.find(
      (candidate) => candidate.parentId === 'copied-root',
    )
    expect(copiedRoot?.ports.map((port) => port.id)).toEqual([
      'copied-root-a',
      'copied-root-b',
    ])
    expect(copiedChild?.id).toMatch(/^generated-/)
  })

  it('rejects missing parents and cycles without changing state', () => {
    const initial = scene()
    initial.entities.push(entity('parent'), entity('child', 'parent'))
    const store = createCommandStore(initial)
    const before = digest(store.scene)
    expect(() =>
      store.execute({ type: 'reparent-entity', entityId: 'parent', parentId: 'child' }),
    ).toThrow('cycle')
    expect(() =>
      store.execute({ type: 'reparent-entity', entityId: 'child', parentId: 'missing' }),
    ).toThrow('missing')
    expect(digest(store.scene)).toBe(before)
  })

  it('preserves world transforms when grouping, reparenting, and ungrouping', () => {
    const initial = scene()
    const parent = entity('parent')
    parent.transform = {
      position: { x: 100, y: 50, z: 25 },
      rotation: { x: 15, y: -20, z: 90 },
    }
    const child = entity('child')
    child.transform = {
      position: { x: 20, y: -35, z: 45 },
      rotation: { x: -10, y: 25, z: 10 },
    }
    initial.entities.push(parent, child)
    const store = createCommandStore(initial)
    const original = store.worldTransform('child')
    store.execute({ type: 'reparent-entity', entityId: 'child', parentId: 'parent' })
    expectWorldTransformClose(store.worldTransform('child'), original)
    store.execute({ type: 'ungroup-entity', entityId: 'child' })
    expectWorldTransformClose(store.worldTransform('child'), original)
    const group = entity('group')
    group.transform = {
      position: { x: -60, y: 30, z: 80 },
      rotation: { x: 30, y: 20, z: -45 },
    }
    store.execute({ type: 'group-entities', group, entityIds: ['child'] })
    expectWorldTransformClose(store.worldTransform('child'), original)
    store.execute({ type: 'ungroup-entity', entityId: 'child' })
    expectWorldTransformClose(store.worldTransform('child'), original)
  })

  it('resizes only the room while preserving entities and reporting out-of-bounds IDs', () => {
    const initial = scene()
    const inside = entity('inside')
    const outside = entity('outside')
    outside.transform.position.x = 400
    initial.entities.push(inside, outside)
    const store = createCommandStore(initial)
    const entitiesBefore = store.scene.entities

    const result = store.execute({
      type: 'resize-room',
      dimensions: { width: 500, depth: 500, height: 500 },
    })

    expect(store.scene.entities).toEqual(entitiesBefore)
    expect(result.outOfBoundsEntityIds).toEqual(['outside'])
  })

  it('resolves catalog presets and overrides through the catalog contract', () => {
    const store = createCommandStore(scene())
    store.execute({
      type: 'add-catalog-entity',
      itemId: 'desk.l-shaped-sit-stand',
      id: 'desk',
      portIds: ['desk-port'],
    })
    store.execute({
      type: 'set-catalog',
      entityId: 'desk',
      presetId: 'standing',
      overrides: { dimensions: { width: 1900 } },
    })
    const desk = store.scene.entities[0]
    expect(desk.catalog).toMatchObject({
      itemId: 'desk.l-shaped-sit-stand',
      presetId: 'standing',
    })
    expect(desk.dimensions).toEqual({ width: 1900, depth: 1400, height: 1100 })
  })
})
