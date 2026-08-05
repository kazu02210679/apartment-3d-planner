import { describe, expect, it } from 'vitest'

import { createCommandStore } from './command-store'
import { createEmptyScene } from '../domain/scene'
import type { Entity } from '../domain/schema'

function entity(): Entity {
  return {
    id: 'one',
    kind: 'generic',
    name: 'One',
    parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    dimensions: { width: 10, depth: 10, height: 10 },
    overrides: {},
    ports: [],
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

function store() {
  const initial = createEmptyScene('6-tatami', {
    idFactory: (() => {
      let index = 0
      return () => `id-${++index}`
    })(),
    now: () => '2026-08-06T00:00:00.000Z',
  })
  initial.entities.push(entity())
  return createCommandStore(initial)
}

describe('CommandStore interactions', () => {
  it('shows live updates and commits them as exactly one undo entry', () => {
    const subject = store()
    subject.beginInteraction('drag', { entityId: 'one' })
    subject.updateInteraction({
      type: 'set-transform',
      entityId: 'one',
      transform: { position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    })
    subject.updateInteraction({
      type: 'set-transform',
      entityId: 'one',
      transform: { position: { x: 20, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    })
    expect(subject.scene.entities[0].transform.position.x).toBe(20)
    expect(subject.history.undo).toHaveLength(0)
    subject.commitInteraction()
    expect(subject.history.undo).toHaveLength(1)
    subject.undo()
    expect(subject.scene.entities[0].transform.position.x).toBe(0)
  })

  it('cancels to the exact initial snapshot and records no history', () => {
    const subject = store()
    const before = JSON.stringify(subject.scene)
    subject.beginInteraction('drag', { entityId: 'one' })
    subject.updateInteraction({ type: 'rename-entity', entityId: 'one', name: 'Live' })
    subject.cancelInteraction()
    expect(JSON.stringify(subject.scene)).toBe(before)
    expect(subject.history.undo).toHaveLength(0)
  })

  it('does not create history for a no-op commit and rejects invalid/nested operations atomically', () => {
    const subject = store()
    const before = JSON.stringify(subject.snapshot())
    subject.beginInteraction('noop', { entityId: 'one' })
    expect(() => subject.beginInteraction('nested', { entityId: 'one' })).toThrow(
      'active',
    )
    expect(() =>
      subject.execute({ type: 'rename-entity', entityId: 'one', name: 'No' }),
    ).toThrow('active')
    expect(() =>
      subject.updateInteraction({
        type: 'rename-entity',
        entityId: 'missing',
        name: 'No',
      }),
    ).toThrow('missing')
    expect(JSON.stringify(subject.snapshot())).toBe(before)
    subject.commitInteraction()
    expect(subject.history.undo).toHaveLength(0)
  })
})
