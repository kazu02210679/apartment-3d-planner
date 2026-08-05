import { describe, expect, it, vi } from 'vitest'

import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { createEmptyScene } from '../domain/scene'
import { normalizeScene } from '../domain/normalize'
import type { SceneDocument } from '../domain/schema'
import { createAutosaveCoordinator } from './autosave'
import { exportScene } from './export'
import { importScene } from './import'
import { createMemoryStorage, SceneStorage } from './storage'

function makeScene(name = 'Test scene'): SceneDocument {
  let nextId = 0
  const scene = createEmptyScene('6-tatami', {
    idFactory: () => `test-${++nextId}`,
    now: () => '2026-08-06T00:00:00.000Z',
  })
  scene.metadata.name = name
  return scene
}

describe('transactional local persistence', () => {
  it('saves, rotates, reloads, falls back, and preserves bytes on failed writes', () => {
    const adapter = createMemoryStorage()
    const storage = new SceneStorage(adapter, 'test-scenes')
    const first = makeScene('first')
    const second = makeScene('second')

    const firstSave = storage.save(first)
    expect(firstSave.ok).toBe(true)
    if (firstSave.ok) firstSave.scene.metadata.name = 'mutated result'
    expect(storage.reload()).toMatchObject({
      ok: true,
      scene: { metadata: { name: 'first' } },
    })
    expect(storage.save(second).ok).toBe(true)

    const rotated = JSON.parse(adapter.getItem('test-scenes') ?? '')
    expect(rotated.current.metadata.name).toBe('second')
    expect(rotated.lastKnownGood.metadata.name).toBe('first')

    adapter.setItem('test-scenes', JSON.stringify({ ...rotated, lastKnownGood: '{bad' }))
    expect(storage.reload()).toMatchObject({
      ok: true,
      scene: { metadata: { name: 'second' } },
    })

    adapter.setItem('test-scenes', JSON.stringify({ ...rotated, current: '{bad' }))
    expect(storage.reload()).toMatchObject({
      ok: true,
      scene: { metadata: { name: 'first' } },
    })

    const bytesBeforeFailure = adapter.getItem('test-scenes')
    adapter.failWrites = true
    expect(storage.save(makeScene('failed')).ok).toBe(false)
    expect(adapter.getItem('test-scenes')).toBe(bytesBeforeFailure)
  })

  it('debounces and coalesces autosaves, reports failure, and recovers later', () => {
    vi.useFakeTimers()
    try {
      const adapter = createMemoryStorage()
      const storage = new SceneStorage(adapter)
      const coordinator = createAutosaveCoordinator(storage, { debounceMs: 250 })
      coordinator.schedule(makeScene('old'))
      coordinator.schedule(makeScene('new'))
      expect(coordinator.getStatus().state).toBe('pending')
      vi.advanceTimersByTime(249)
      expect(adapter.getItem('home-lab-scene')).toBeNull()
      vi.advanceTimersByTime(1)
      expect(
        JSON.parse(adapter.getItem('home-lab-scene') ?? '').current.metadata.name,
      ).toBe('new')
      expect(coordinator.getStatus().state).toBe('saved')

      adapter.failWrites = true
      coordinator.schedule(makeScene('failed'))
      expect(coordinator.flush().state).toBe('error')
      const digestAfterFailure = coordinator.getStatus().lastSuccessfulDigest
      expect(digestAfterFailure).toBeDefined()
      adapter.failWrites = false
      coordinator.schedule(makeScene('recovered'))
      expect(coordinator.flush().state).toBe('saved')
      expect(coordinator.getStatus().lastSuccessfulDigest).not.toBe(digestAfterFailure)
      coordinator.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exports deterministic readable JSON and imports a defensive equivalent scene', () => {
    const scene = makeScene()
    const exported = exportScene(scene)
    expect(exported.endsWith('\n')).toBe(true)
    expect(exported).toBe(exportScene(normalizeScene(JSON.parse(exported))))
    expect(exported).toContain('\n  "format": "home-lab-scene"')

    const result = importScene(exported)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scene).toEqual(normalizeScene(scene))
    result.scene.metadata.name = 'mutated copy'
    expect(importScene(exported).ok).toBe(true)
  })

  it('accepts the 31-entity workstation fixture and keeps network-like strings inert', () => {
    const scene = createFutureWorkstationScene({
      idFactory: (() => {
        let i = 0
        return () => `workstation-${++i}`
      })(),
      now: () => '2026-08-06T00:00:00.000Z',
    })
    scene.extensions = {
      text: '<script>alert(1)</script>',
      url: 'https://example.test/data',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const result = importScene(exportScene(scene))
      expect(result.ok).toBe(true)
      expect(fetchSpy).not.toHaveBeenCalled()
      if (result.ok) expect(result.scene.extensions).toEqual(scene.extensions)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
