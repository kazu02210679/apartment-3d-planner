import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  useThree: () => ({
    scene: { name: 'scene-canvas-test-scene' },
    camera: { name: 'scene-canvas-test-camera' },
    gl: { name: 'scene-canvas-test-renderer' },
  }),
}))
vi.mock('./SceneRoot', () => ({ SceneRoot: () => null }))

import { createEditorStore } from '../app/editor-store'
import { createEmptyScene } from '../domain/scene'
import { SceneCanvas } from './SceneCanvas'

describe('SceneCanvas', () => {
  it('keeps renderer evidence dormant unless the exact query switch is enabled', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })

    window.history.replaceState({}, '', '/')
    const ordinary = render(<SceneCanvas store={store} webglAvailable={() => true} />)
    expect(window.__apartmentRendererEvidence).toBeUndefined()
    ordinary.unmount()

    window.history.replaceState({}, '', '/?evidence=1')
    const evidence = render(<SceneCanvas store={store} webglAvailable={() => true} />)
    expect(window.__apartmentRendererEvidence).toBeDefined()
    evidence.unmount()
    expect(window.__apartmentRendererEvidence).toBeUndefined()
    window.history.replaceState({}, '', '/')
  })

  it('keeps exact numeric editing available when WebGL is unavailable', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })

    render(<SceneCanvas store={store} webglAvailable={() => false} />)

    expect(screen.getByRole('status')).toHaveTextContent('3D rendering is unavailable')
    expect(
      screen.getByText('Exact numeric editing remains available.'),
    ).toBeInTheDocument()
  })

  it('disables the accessible direct nudge for a locked selected entity', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.setLocked(entityId, true)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)

    expect(screen.getByRole('button', { name: '選択対象を右へ移動' })).toBeDisabled()
  })

  it('disables the accessible direct nudge for a hidden selected entity', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.setVisibility(entityId, false)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)

    expect(screen.getByRole('button', { name: '選択対象を右へ移動' })).toBeDisabled()
  })

  it('limits the edit context menu to the three placement corrections', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    store.addCatalogItem('power.strip')

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    fireEvent.contextMenu(screen.getByTestId('scene-canvas'), {
      clientX: 40,
      clientY: 50,
    })

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: '範囲内に戻す' })).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: '最寄りの支持面に置く' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '床に置く' })).toBeInTheDocument()
  })

  it('only handles End on the edit canvas, never from form controls or preview', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    const placeEntity = vi.spyOn(store, 'placeEntity')

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    const input = document.createElement('input')
    document.body.append(input)

    act(() => fireEvent.keyDown(input, { key: 'End' }))
    expect(placeEntity).not.toHaveBeenCalled()

    act(() => fireEvent.keyDown(document.body, { key: 'End' }))
    expect(placeEntity).toHaveBeenCalledWith(entityId, 'nearest')

    placeEntity.mockClear()
    act(() => store.setMode('preview'))
    act(() => fireEvent.keyDown(input, { key: 'End' }))
    expect(placeEntity).not.toHaveBeenCalled()

    input.remove()
  })

  it('disables every placement correction when no safe target exists', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('sleep.bed-futon')!
    expect(store.setDimensions(entityId, { width: 2000, depth: 4000, height: 350 })).toBe(
      true,
    )

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    act(() =>
      fireEvent.contextMenu(screen.getByTestId('scene-canvas'), {
        clientX: 40,
        clientY: 50,
      }),
    )

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(
      screen
        .getAllByRole('menuitem')
        .every((item) => (item as HTMLButtonElement).disabled),
    ).toBe(true)
  })
})
