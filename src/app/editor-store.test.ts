import { describe, expect, it, vi } from 'vitest'

import { createEmptyScene } from '../domain/scene'
import { createEditorStore } from './editor-store'

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
    snapshot.scene.metadata.name = 'changed outside the store'
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
})
