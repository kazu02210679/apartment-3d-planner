import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EventManager, RootState, RootStore } from '@react-three/fiber'
import { Mesh, type Intersection } from 'three'

const canvasTestState = vi.hoisted(() => ({
  eventsProp: undefined as unknown,
  createPointerEvents: vi.fn(),
  baseEventFilter: vi.fn(),
}))

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    events,
    onPointerMissed,
  }: {
    readonly children: React.ReactNode
    readonly events?: unknown
    readonly onPointerMissed?: () => void
  }) => {
    canvasTestState.eventsProp = events
    return (
      <div data-testid="r3f-canvas" onClick={onPointerMissed}>
        {children}
      </div>
    )
  },
  events: canvasTestState.createPointerEvents,
  useThree: () => ({
    scene: { name: 'scene-canvas-test-scene' },
    camera: { name: 'scene-canvas-test-camera' },
    gl: { name: 'scene-canvas-test-renderer' },
  }),
}))
vi.mock('./SceneRoot', () => ({
  SceneRoot: ({
    store,
    onResizeStart,
  }: {
    readonly store: { beginInteraction: (label: string) => boolean }
    readonly onResizeStart?: () => void
  }) => (
    <div
      data-testid="resize-handle"
      onPointerDown={() => {
        if (store.beginInteraction('resize entity')) onResizeStart?.()
      }}
    />
  ),
}))

import { createEditorStore } from '../app/editor-store'
import { createEmptyScene } from '../domain/scene'
import { SceneCanvas } from './SceneCanvas'

describe('SceneCanvas', () => {
  it('installs and executes the production resize-handle event factory at the Canvas seam', () => {
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami'),
    })
    const rootStore = {} as RootStore
    const rootState = {} as RootState
    const nearEntity = new Mesh()
    const firstHandleObject = new Mesh()
    firstHandleObject.userData.resizeHandle = true
    const farEntity = new Mesh()
    const secondHandleObject = new Mesh()
    secondHandleObject.userData.resizeHandle = true
    const nearEntityHit = { distance: 2, object: nearEntity } as unknown as Intersection
    const firstHandleHit = {
      distance: 7,
      object: firstHandleObject,
    } as unknown as Intersection
    const farEntityHit = { distance: 11, object: farEntity } as unknown as Intersection
    const secondHandleHit = {
      distance: 17,
      object: secondHandleObject,
    } as unknown as Intersection
    const intersections = [nearEntityHit, firstHandleHit, farEntityHit, secondHandleHit]
    const originalIntersections = [...intersections]
    const baseFilteredIntersections = [
      farEntityHit,
      secondHandleHit,
      nearEntityHit,
      firstHandleHit,
    ]
    let receivedByBaseFilter: Intersection[] | undefined
    canvasTestState.eventsProp = undefined
    canvasTestState.baseEventFilter.mockReset()
    canvasTestState.createPointerEvents.mockReset()
    canvasTestState.baseEventFilter.mockImplementation(
      (items: Intersection[], state: RootState) => {
        receivedByBaseFilter = items
        expect(state).toBe(rootState)
        return baseFilteredIntersections
      },
    )
    canvasTestState.createPointerEvents.mockReturnValue({
      enabled: true,
      priority: 1,
      filter: canvasTestState.baseEventFilter,
    })

    render(<SceneCanvas store={store} webglAvailable={() => true} />)

    expect(canvasTestState.eventsProp).toEqual(expect.any(Function))
    const eventsFactory = canvasTestState.eventsProp as (
      store: RootStore,
    ) => EventManager<HTMLElement>
    const eventManager = eventsFactory(rootStore)
    const filteredIntersections = eventManager.filter!(intersections, rootState)

    expect(canvasTestState.createPointerEvents).toHaveBeenCalledWith(rootStore)
    expect(canvasTestState.baseEventFilter).toHaveBeenCalledTimes(1)
    expect(receivedByBaseFilter).not.toBe(intersections)
    expect(receivedByBaseFilter).toEqual(originalIntersections)
    expect(filteredIntersections).toEqual([
      secondHandleHit,
      firstHandleHit,
      farEntityHit,
      nearEntityHit,
    ])
    expect(filteredIntersections.map(({ distance }) => distance)).toEqual([17, 7, 11, 2])
    expect(filteredIntersections.map(({ object }) => object)).toEqual([
      secondHandleObject,
      firstHandleObject,
      farEntity,
      nearEntity,
    ])
    expect(intersections).toEqual(originalIntersections)
    expect(intersections).not.toBe(filteredIntersections)
  })

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

  it('only handles End when the edit canvas itself is focused', () => {
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
    const canvas = screen.getByTestId('scene-canvas')

    expect(canvas).toHaveAttribute('tabindex', '0')
    expect(canvas).toHaveAttribute('aria-label', '3D editing canvas')

    act(() => fireEvent.keyDown(input, { key: 'End' }))
    expect(placeEntity).not.toHaveBeenCalled()

    act(() => fireEvent.keyDown(document.body, { key: 'End' }))
    expect(placeEntity).not.toHaveBeenCalled()

    act(() => canvas.focus())
    act(() => fireEvent.keyDown(canvas, { key: 'End' }))
    expect(placeEntity).toHaveBeenCalledWith(entityId, 'nearest')

    placeEntity.mockClear()
    act(() => store.setMode('preview'))
    expect(canvas).toHaveAttribute('tabindex', '-1')
    act(() => fireEvent.keyDown(canvas, { key: 'End' }))
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

  it('ignores resize-generated misses until the next real pointerdown', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.selectEntity(entityId)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    const handle = screen.getByTestId('resize-handle')
    const canvas = screen.getByTestId('r3f-canvas')

    act(() => {
      fireEvent.pointerDown(handle)
      fireEvent.pointerMove(handle)
      fireEvent.pointerUp(handle)
      fireEvent.click(canvas)
    })

    expect(store.getSnapshot().selectedEntityId).toBe(entityId)

    act(() => {
      fireEvent.pointerDown(canvas)
      fireEvent.click(canvas)
    })
    expect(store.getSnapshot().selectedEntityId).toBeNull()
  })

  it('clears a stale suppression latch after a later pointerdown before a miss', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.selectEntity(entityId)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    const handle = screen.getByTestId('resize-handle')
    const canvas = screen.getByTestId('r3f-canvas')

    act(() => {
      fireEvent.pointerDown(handle)
      fireEvent.pointerUp(handle)
      fireEvent.pointerDown(canvas)
      fireEvent.click(canvas)
    })

    expect(store.getSnapshot().selectedEntityId).toBeNull()
  })

  it('clears selection for an ordinary miss without an interaction', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.selectEntity(entityId)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)
    const canvas = screen.getByTestId('r3f-canvas')
    fireEvent.pointerDown(canvas)
    fireEvent.click(canvas)

    expect(store.getSnapshot().selectedEntityId).toBeNull()
  })
})
