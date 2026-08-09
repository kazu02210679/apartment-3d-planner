import { describe, expect, it, vi } from 'vitest'

import { createEditorStore } from '../../app/editor-store'
import { createEmptyScene } from '../../domain/scene'
import type { Entity } from '../../domain/schema'
import { createInteractionController } from './interaction-controller'

function storeWithEntity(
  entity: Entity,
  autosave?: NonNullable<Parameters<typeof createEditorStore>[0]>['autosave'],
) {
  let index = 0
  const idFactory = () => `fixture-${++index}`
  const scene = createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' })
  scene.entities.push(entity)
  return createEditorStore({ initialScene: scene, idFactory, autosave })
}

function genericEntity(id = 'chair'): Entity {
  return {
    id,
    kind: 'generic',
    name: 'Chair',
    parentId: null,
    transform: { position: { x: 0, y: 500, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    dimensions: { width: 500, depth: 500, height: 1000 },
    overrides: {},
    ports: [],
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

describe('interaction controller', () => {
  it('snaps a renderer move, publishes it live, and commits one undoable interaction', () => {
    let sceneIndex = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-${++sceneIndex}`,
        now: () => '2026-01-01',
      }),
      idFactory: (() => {
        let index = 0
        return () => `id-${++index}`
      })(),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.setTranslationSnap(10)
    const controller = createInteractionController(store)

    expect(controller.start(entityId, 'move')).toBe(true)
    expect(controller.updateTransform([1.014, 0.001, -0.023])).toBe(true)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position,
    ).toEqual({ x: 1010, y: 17.5, z: -20 })
    expect(controller.commit()).toBe(true)
    expect(store.undo()).toBe(true)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position,
    ).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('cancels an active drag exactly without history or autosave', () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    }
    const store = storeWithEntity(genericEntity(), autosave)
    const controller = createInteractionController(store)

    expect(controller.start('chair', 'move')).toBe(true)
    controller.updateTransform([0.6, 0.5, -0.4])
    expect(store.getSnapshot().scene.entities[0].transform.position).toEqual({
      x: 600,
      y: 500,
      z: -400,
    })
    expect(controller.cancel()).toBe(true)
    expect(store.getSnapshot().scene.entities[0].transform.position).toEqual({
      x: 0,
      y: 500,
      z: 0,
    })
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(autosave.schedule).not.toHaveBeenCalled()
  })

  it('does not create history or autosave for a click without movement', () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    }
    const store = storeWithEntity(genericEntity(), autosave)
    const controller = createInteractionController(store)

    expect(controller.start('chair', 'move')).toBe(true)
    expect(controller.commit()).toBe(false)
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(autosave.schedule).not.toHaveBeenCalled()
  })

  it('normalizes angular snapping and rejects locked direct manipulation', () => {
    const store = storeWithEntity(genericEntity())
    const controller = createInteractionController(store)
    store.setRotationSnap(15)

    expect(controller.start('chair', 'rotate')).toBe(true)
    controller.updateTransform([0, 0.5, 0], [0, 0.19, -0.1])
    expect(controller.commit()).toBe(true)
    expect(store.getSnapshot().scene.entities[0].transform.rotation).toEqual({
      x: 0,
      y: 15,
      z: 0,
    })
    store.setLocked('chair', true)
    expect(controller.start('chair', 'move')).toBe(false)
  })

  it('uses the catalog-aware resize transaction so a preset monitor becomes Custom', () => {
    let index = 0
    const idFactory = () => `catalog-${++index}`
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const monitorId = store.addCatalogItem('display.monitor')!
    const before = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    const controller = createInteractionController(store)

    expect(controller.start(monitorId, 'resize')).toBe(true)
    expect(controller.updateDimensions([0.8, 0.6, 0.25])).toBe(true)
    expect(controller.commit()).toBe(true)
    const monitor = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    expect(monitor.catalog?.presetId).toBeUndefined()
    expect(monitor.ports).toEqual(before.ports)
    expect(monitor.overrides.dimensions).toEqual({ width: 800, depth: 250, height: 600 })
  })
})
