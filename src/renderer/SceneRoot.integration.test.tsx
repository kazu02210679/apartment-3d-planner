import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/drei', () => ({
  Edges: ({ color }: { readonly color: string }) => (
    <lineSegments name={`outline-${color}`} />
  ),
  OrbitControls: () => <group name="orbit-controls" />,
  TransformControls: () => <group name="transform-gizmo" />,
}))
vi.mock('./controls/ResizeHandles', () => ({
  ResizeHandles: () => <group name="resize-handles" />,
}))
vi.mock('./controls/TransformGizmo', () => ({
  TransformGizmo: () => <group name="transform-gizmo" />,
}))

import { createEditorStore } from '../app/editor-store'
import { createEmptyScene } from '../domain/scene'
import { SceneRoot } from './SceneRoot'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createStore() {
  let nextId = 0
  return createEditorStore({
    initialScene: createEmptyScene('6-tatami', {
      idFactory: () => `scene-id-${++nextId}`,
      now: () => '2026-01-01T00:00:00.000Z',
    }),
  })
}

function rootProps(store: ReturnType<typeof createStore>) {
  const snapshot = store.getSnapshot()
  return {
    scene: snapshot.scene,
    selectedEntityIds: snapshot.selectedEntityIds,
    outOfBoundsEntityIds: snapshot.outOfBoundsEntityIds,
    cameraIntent: 'idle' as const,
    store,
    mode: snapshot.mode,
    activeTool: snapshot.activeTool,
    onEntitySelect: (id: string) => store.selectEntity(id),
    onEmptyHit: () => store.clearSelection(),
  }
}

describe('SceneRoot renderer integration', () => {
  it('renders routed cable geometry in editor and preview without mutating the scene', async () => {
    const store = createStore()
    const cableId = store.addCatalogItem('cable.generic')!
    const before = store.exportJson()
    const renderer = await create(<SceneRoot {...rootProps(store)} />)

    expect(renderer.scene.findByProps({ name: `cable-route-${cableId}` })).toBeDefined()
    store.setMode('preview')
    await renderer.update(<SceneRoot {...rootProps(store)} />)
    expect(renderer.scene.findByProps({ name: `cable-route-${cableId}` })).toBeDefined()
    expect(store.exportJson()).toBe(before)
  })

  it('shows eligible cable markers only in edit cable mode and routes marker clicks through the store', async () => {
    const store = createStore()
    const cableId = store.addCatalogItem('cable.generic')!
    const targetId = store.addCatalogItem('power.strip')!
    const cable = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === cableId)!
    const target = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === targetId)!
    const end = cable.ports.find((port) => port.extensions.catalogPortId === 'end-a')!
    const targetPort = target.ports.find((port) => port.kind === 'power')!
    store.setActiveTool('cable')
    const renderer = await create(<SceneRoot {...rootProps(store)} />)

    expect(
      renderer.scene.findByProps({ name: `port-marker-${cableId}-${end.id}` }),
    ).toBeDefined()
    expect(
      renderer.scene.findByProps({ name: `port-marker-${targetId}-${targetPort.id}` }),
    ).toBeDefined()
    store.setMode('preview')
    await renderer.update(<SceneRoot {...rootProps(store)} />)
    expect(() =>
      renderer.scene.findByProps({ name: `port-marker-${cableId}-${end.id}` }),
    ).toThrow()
  })

  it('commits a direct waypoint drag as one cable-routing interaction', async () => {
    const store = createStore()
    const cableId = store.addCatalogItem('cable.generic')!
    store.addCableWaypoint(cableId)
    store.setActiveTool('cable')
    const waypoint = (
      store.getSnapshot().scene.entities.find((entity) => entity.id === cableId)!
        .properties.routing as unknown as { waypoints: readonly { id: string }[] }
    ).waypoints[0]!
    const renderer = await create(<SceneRoot {...rootProps(store)} />)
    const handle = renderer.scene.findByProps({
      name: `cable-waypoint-${cableId}-${waypoint.id}`,
    })
    const target = { setPointerCapture: vi.fn() }
    const event = (x: number) => ({
      stopPropagation: vi.fn(),
      pointerId: 1,
      target,
      unprojectedPoint: { x, y: 0, z: 0 },
    })

    await handle.props.onPointerDown(event(0))
    await handle.props.onPointerMove(event(0.2))
    await handle.props.onPointerUp(event(0.2))

    const moved = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === cableId)!
    expect(
      (
        moved.properties.routing as unknown as {
          waypoints: readonly { position: { x: number } }[]
        }
      ).waypoints[0]!.position.x,
    ).toBe(200)
    expect(store.undo()).toBe(true)
  })

  it('renders selected editor controls and detailed model state styling while omitting hidden entities', async () => {
    const store = createStore()
    const deskId = store.addCatalogItem('desk.l-shaped-sit-stand')!
    const lockedId = store.addCatalogItem('power.strip')!
    store.setLocked(lockedId, true)
    const outOfBoundsId = store.addCatalogItem('printer.generic')!
    const hiddenId = store.addCatalogItem('computer.mini-pc')!
    store.setVisibility(hiddenId, false)
    store.selectEntity(deskId)
    store.setActiveTool('move')
    const snapshot = store.getSnapshot()
    const renderer = await create(
      <SceneRoot {...rootProps(store)} outOfBoundsEntityIds={[outOfBoundsId]} />,
    )

    expect(renderer.scene.findByProps({ name: 'transform-gizmo' })).toBeDefined()
    expect(renderer.scene.findByProps({ name: `outline-#d7f36b` })).toBeDefined()
    expect(renderer.scene.findByProps({ name: `outline-#7fc4ff` })).toBeDefined()
    expect(renderer.scene.findByProps({ name: `outline-#ff8d91` })).toBeDefined()
    expect(() => renderer.scene.findByProps({ name: hiddenId })).toThrow()
    expect(snapshot.selectedEntityIds).toEqual([deskId])
  })

  it('renders resize handles only for selected edit-mode resize and omits all direct controls in preview', async () => {
    const store = createStore()
    const deskId = store.addCatalogItem('desk.l-shaped-sit-stand')!
    store.selectEntity(deskId)
    store.setActiveTool('resize')
    const renderer = await create(<SceneRoot {...rootProps(store)} />)

    expect(renderer.scene.findByProps({ name: 'resize-handles' })).toBeDefined()

    store.setMode('preview')
    store.setActiveTool('move')
    await renderer.update(<SceneRoot {...rootProps(store)} />)

    expect(() => renderer.scene.findByProps({ name: 'resize-handles' })).toThrow()
    expect(() => renderer.scene.findByProps({ name: 'transform-gizmo' })).toThrow()
  })
})
