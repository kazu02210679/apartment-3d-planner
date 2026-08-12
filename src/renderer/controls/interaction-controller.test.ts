import { describe, expect, it, vi } from 'vitest'

import { createEditorStore } from '../../app/editor-store'
import { SceneHistory } from '../../commands/history'
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

function rendererTarget() {
  return {
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }
}

describe('interaction controller', () => {
  it('emits evidence-only controller start and commit phases', () => {
    const phases: string[] = []
    let token = 0
    const evidenceWindow = window as typeof window & {
      __apartmentEvidenceProbe?: {
        startPhase: (phase: string) => number | null
        endPhase: (token: number | null) => void
      }
    }
    evidenceWindow.__apartmentEvidenceProbe = {
      startPhase: (phase) => {
        phases.push(`start:${phase}`)
        return ++token
      },
      endPhase: (value) => phases.push(`end:${value}`),
    }
    try {
      const store = storeWithEntity(genericEntity())
      const controller = createInteractionController(store)
      expect(controller.start('chair', 'resize', rendererTarget() as never)).toBe(true)
      controller.resizeByLocalDelta(0, 0.1)
      expect(controller.commit()).toBe(true)
      expect(phases).toEqual([
        'start:resize-controller-start',
        'start:resize-transaction',
        'end:2',
        'start:resize-begin-publish',
        'end:3',
        'end:1',
        'start:resize-controller-commit',
        'start:resize-history',
        'end:5',
        'start:resize-autosave-schedule',
        'end:6',
        'start:resize-commit-publish',
        'end:7',
        'end:4',
      ])
    } finally {
      delete evidenceWindow.__apartmentEvidenceProbe
    }
  })

  it('keeps transform updates renderer-local until one pointer-up commit', () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    }
    const store = storeWithEntity(genericEntity(), autosave)
    const notifications = vi.fn()
    store.subscribe(notifications)
    const target = {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }
    const controller = createInteractionController(store)

    expect(controller.start('chair', 'move', target as never)).toBe(true)
    notifications.mockClear()
    const before = store.getSnapshot().scene.entities[0]!.transform
    const getSnapshot = vi.spyOn(store, 'getSnapshot')
    const geometryCommand = vi.spyOn(store, 'updateInteractionGeometry')
    const historyRead = vi.spyOn(SceneHistory.prototype, 'snapshot')
    getSnapshot.mockClear()
    historyRead.mockClear()
    for (let index = 1; index <= 120; index += 1)
      expect(controller.updateTransform([index / 100, 0.5, 0])).toBe(true)

    expect(getSnapshot).not.toHaveBeenCalled()
    expect(geometryCommand).not.toHaveBeenCalled()
    expect(historyRead).not.toHaveBeenCalled()
    expect(notifications).not.toHaveBeenCalled()
    expect(autosave.schedule).not.toHaveBeenCalled()
    expect(store.getSnapshot().scene.entities[0]!.transform).toEqual(before)
    expect(target.position.x).toBeCloseTo(1.2)

    expect(controller.commit()).toBe(true)
    expect(geometryCommand).toHaveBeenCalledTimes(1)
    expect(notifications).toHaveBeenCalledTimes(1)
    expect(autosave.schedule).toHaveBeenCalledTimes(1)
  })

  it('keeps resize updates renderer-local and restores the target on cancel', () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    }
    const store = storeWithEntity(genericEntity(), autosave)
    const notifications = vi.fn()
    store.subscribe(notifications)
    const target = {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }
    const controller = createInteractionController(store)

    expect(controller.start('chair', 'resize', target as never)).toBe(true)
    notifications.mockClear()
    const before = store.getSnapshot().scene.entities[0]!
    const getSnapshot = vi.spyOn(store, 'getSnapshot')
    const geometryCommand = vi.spyOn(store, 'updateInteractionGeometry')
    const historyRead = vi.spyOn(SceneHistory.prototype, 'snapshot')
    getSnapshot.mockClear()
    historyRead.mockClear()
    for (let index = 1; index <= 120; index += 1)
      expect(controller.resizeByLocalDelta(0, index / 1000)).toBe(true)

    expect(getSnapshot).not.toHaveBeenCalled()
    expect(geometryCommand).not.toHaveBeenCalled()
    expect(historyRead).not.toHaveBeenCalled()
    expect(notifications).not.toHaveBeenCalled()
    expect(autosave.schedule).not.toHaveBeenCalled()
    expect(store.getSnapshot().scene.entities[0]).toEqual(before)
    expect(target.scale.x).toBeCloseTo(1.24)
    expect(target.position.x).toBeCloseTo(0.06)

    expect(controller.cancel()).toBe(true)
    expect(target).toEqual({
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    expect(autosave.schedule).not.toHaveBeenCalled()
  })

  it('commits a snapped renderer move once and makes it undoable', () => {
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
    const target = rendererTarget()

    expect(controller.start(entityId, 'move', target as never)).toBe(true)
    expect(controller.updateTransform([1.014, 0.001, -0.023])).toBe(true)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position,
    ).toEqual({ x: 0, y: 0, z: 0 })
    expect(target.position).toEqual({ x: 1.01, y: 0.0175, z: -0.02 })
    expect(controller.commit()).toBe(true)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position,
    ).toEqual({ x: 1010, y: 17.5, z: -20 })
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
    const target = rendererTarget()

    expect(controller.start('chair', 'move', target as never)).toBe(true)
    controller.updateTransform([0.6, 0.5, -0.4])
    expect(store.getSnapshot().scene.entities[0].transform.position).toEqual({
      x: 0,
      y: 500,
      z: 0,
    })
    expect(target.position).toEqual({ x: 0.6, y: 0.5, z: -0.4 })
    expect(controller.cancel()).toBe(true)
    expect(store.getSnapshot().scene.entities[0].transform.position).toEqual({
      x: 0,
      y: 500,
      z: 0,
    })
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(target.position).toEqual({ x: 0, y: 0.5, z: 0 })
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

  it('grows and shrinks a rotated entity from its positive local handle while preserving the opposite face', () => {
    const entity = genericEntity()
    entity.transform.rotation.z = 90
    const store = storeWithEntity(entity)
    const controller = createInteractionController(store)
    const target = rendererTarget()

    expect(controller.start('chair', 'resize', target as never)).toBe(true)
    expect(controller.resizeByLocalDelta(0, 0.1)).toBe(true)
    expect(target).toMatchObject({ position: { x: 0, y: 0.55, z: 0 }, scale: { x: 1.2 } })
    expect(controller.resizeByLocalDelta(0, -0.05)).toBe(true)
    expect(target).toMatchObject({ position: { x: 0, y: 0.475, z: 0 }, scale: { x: 0.9 } })
    expect(controller.commit()).toBe(true)
    expect(store.getSnapshot().scene.entities[0]).toMatchObject({
      dimensions: { width: 450, depth: 500, height: 1000 },
      transform: { position: { x: 0, y: 475, z: 0 } },
    })
    expect(store.undo()).toBe(true)
    expect(store.getSnapshot().scene.entities[0]).toMatchObject({
      dimensions: { width: 500, depth: 500, height: 1000 },
      transform: { position: { x: 0, y: 500, z: 0 } },
    })
  })
})
