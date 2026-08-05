import { describe, expect, it, vi } from 'vitest'

import { createEmptyScene } from '../domain/scene'
import { createMemoryStorage, SceneStorage } from '../persistence/storage'
import { createEditorStore, getResolvedCatalog } from './editor-store'

function ids() {
  let index = 0
  return () => `test-${++index}`
}

describe('EditorStore', () => {
  it('provides defensive snapshots and exactly one notification per completed action', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const notify = vi.fn()
    store.subscribe(notify)

    const snapshot = store.getSnapshot()
    expect(() => {
      snapshot.scene.metadata.name = 'changed outside the store'
    }).toThrow()
    expect(store.getSnapshot().scene.metadata.name).not.toBe('changed outside the store')

    store.selectRoom()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().selectedEntityId).toBeNull()
  })

  it('adds through command history, selects by stable id, and falls back to room after delete', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })

    store.addCatalogItem('display.monitor')
    const selectedId = store.getSnapshot().selectedEntityId
    expect(selectedId).toBeTruthy()
    expect(
      store.getSnapshot().scene.entities.some((entity) => entity.id === selectedId),
    ).toBe(true)
    expect(store.getSnapshot().canUndo).toBe(true)

    store.deleteEntity(selectedId!)
    expect(store.getSnapshot().selectedEntityId).toBeNull()
    expect(store.getSnapshot().selectedRoomId).toBe(store.getSnapshot().scene.room.id)

    expect(store.undo()).toBe(true)
    expect(store.getSnapshot().scene.entities).toHaveLength(1)
    expect(store.redo()).toBe(true)
    expect(store.getSnapshot().scene.entities).toHaveLength(0)
  })

  it('applies room presets and custom dimensions through one command while keeping entities', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const entityBefore = store.getSnapshot().scene.entities

    store.setRoomPreset('12-tatami')
    expect(store.getSnapshot().scene.room).toMatchObject({
      preset: '12-tatami',
      width: 3600,
      depth: 5400,
      height: 2400,
    })

    store.setRoomDimensions({ width: 1000, depth: 1000, height: 1000 })
    expect(store.getSnapshot().scene.room.preset).toBeNull()
    expect(store.getSnapshot().scene.entities).toEqual(entityBefore)
  })

  it('keeps catalog references while switching monitor sizes and L-desk presets', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const monitorId = store.addCatalogItem('display.monitor')!
    const originalReference = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)?.catalog
    store.setCatalogPreset(monitorId, 'monitor-24')
    store.setCatalogCustomDimensions(monitorId, { width: 700, depth: 220, height: 520 })
    const custom = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    expect(custom.catalog).toMatchObject({
      itemId: originalReference?.itemId,
      revision: originalReference?.revision,
    })
    expect(custom.catalog?.presetId).toBeUndefined()
    expect(custom.dimensions.width).toBe(700)
    store.setCatalogPreset(monitorId, 'monitor-32')
    const standard = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    expect(standard.catalog?.presetId).toBe('monitor-32')
    expect(standard.dimensions.width).not.toBe(700)

    const deskId = store.addCatalogItem('desk.l-shaped-sit-stand')!
    store.setCatalogPreset(deskId, 'standing')
    store.setCatalogPreset(deskId, 'free-height')
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === deskId)?.id,
    ).toBe(deskId)
  })

  it('keeps custom monitor dimensions and panel geometry resolved, then clears both on preset reset', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const monitorId = store.addCatalogItem('display.monitor')!
    store.setCatalogCustomDimensions(monitorId, { width: 700, depth: 220, height: 520 })
    const custom = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    expect(custom.overrides).toMatchObject({
      dimensions: { width: 700, height: 520 },
      geometry: { panel: { width: 700, height: 400 } },
    })
    expect(getResolvedCatalog(custom)?.geometry).toMatchObject({
      kind: 'panel-with-stand',
      panel: { width: 700, height: 400 },
    })

    store.setCatalogPreset(monitorId, 'monitor-24')
    const reset = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === monitorId)!
    expect(reset.overrides).not.toHaveProperty('dimensions')
    expect(reset.overrides).not.toHaveProperty('geometry')
    expect(getResolvedCatalog(reset)?.geometry).toMatchObject({
      kind: 'panel-with-stand',
      panel: { width: 531, height: 299 },
    })
  })

  it('groups additive stable-ID selections in one action and does not steal selection after delete', () => {
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
    })
    const firstId = store.addCatalogItem('desk.straight')!
    const secondId = store.addCatalogItem('seating.chair')!
    store.selectEntity(firstId)
    store.selectEntity(secondId, true)
    const notifications = vi.fn()
    store.subscribe(notifications)
    const groupId = store.groupEntities([firstId, secondId])!
    expect(notifications).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().selectedEntityId).toBe(groupId)
    expect(
      store.getSnapshot().scene.entities.filter((entity) => entity.parentId === groupId),
    ).toHaveLength(2)
    expect(store.undo()).toBe(true)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === firstId)
        ?.parentId,
    ).toBeNull()

    store.selectEntity(firstId)
    store.deleteEntity(firstId)
    store.selectEntity(secondId)
    store.undo()
    expect(store.getSnapshot().selectedEntityId).toBe(secondId)
    expect(
      store.getSnapshot().scene.entities.some((entity) => entity.id === firstId),
    ).toBe(true)
  })

  it('copies exposed arrays and publishes autosave status asynchronously without extra scene notifications', () => {
    vi.useFakeTimers()
    try {
      const idFactory = ids()
      const storage = new SceneStorage(createMemoryStorage(), 'editor-test')
      const store = createEditorStore({
        initialScene: createEmptyScene('6-tatami', {
          idFactory,
          now: () => '2026-01-01',
        }),
        idFactory,
        storage,
        autosaveOptions: { debounceMs: 10 },
      })
      const exposed = store.getSnapshot()
      expect(Object.isFrozen(exposed.selectedEntityIds)).toBe(true)
      expect(Object.isFrozen(exposed.outOfBoundsEntityIds)).toBe(true)
      expect(Object.isFrozen(exposed.saveStatus)).toBe(true)
      expect(() => (exposed.selectedEntityIds as string[]).push('outside')).toThrow()
      expect(() => (exposed.outOfBoundsEntityIds as string[]).push('outside')).toThrow()
      const status = exposed.saveStatus as { state: string }
      expect(() => {
        status.state = 'error'
      }).toThrow()
      expect(store.getSnapshot().selectedEntityIds).toEqual([])
      expect(store.getSnapshot().outOfBoundsEntityIds).toEqual([])
      expect(store.getSnapshot().saveStatus.state).toBe('idle')

      const notifications = vi.fn()
      store.subscribe(notifications)
      store.addCatalogItem('display.monitor')
      expect(notifications).toHaveBeenCalledTimes(1)
      expect(store.getSnapshot().saveStatus.state).toBe('pending')
      vi.advanceTimersByTime(10)
      expect(store.getSnapshot().saveStatus.state).toBe('saved')
      expect(notifications).toHaveBeenCalledTimes(2)
      store.selectRoom()
      expect(notifications).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses an injected autosave coordinator without saving selection-only actions', () => {
    let status: { state: 'idle' | 'pending' } = { state: 'idle' }
    const autosave = {
      schedule: vi.fn(() => {
        status = { state: 'pending' }
      }),
      flush: vi.fn(() => status),
      dispose: vi.fn(),
      getStatus: () => ({ ...status }),
    }
    const idFactory = ids()
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
      idFactory,
      autosave,
    })
    const notifications = vi.fn()
    store.subscribe(notifications)

    store.addCatalogItem('display.monitor')
    expect(autosave.schedule).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().saveStatus.state).toBe('pending')
    store.selectRoom()
    expect(autosave.schedule).toHaveBeenCalledTimes(1)
    expect(notifications).toHaveBeenCalledTimes(2)
  })
})
