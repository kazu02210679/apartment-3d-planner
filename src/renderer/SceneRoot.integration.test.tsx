import { create } from '@react-three/test-renderer'
import { act, useImperativeHandle, useMemo, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

type MockOrbitControls = {
  readonly target: { readonly set: ReturnType<typeof vi.fn> }
  readonly dollyIn: ReturnType<typeof vi.fn>
  readonly dollyOut: ReturnType<typeof vi.fn>
  readonly reset: ReturnType<typeof vi.fn>
  readonly update: ReturnType<typeof vi.fn>
}

const cameraIntentTestState = vi.hoisted(() => ({
  lastControls: undefined as MockOrbitControls | undefined,
}))

vi.mock('@react-three/drei', () => ({
  Edges: ({ color }: { readonly color: string }) => (
    <lineSegments name={`outline-${color}`} />
  ),
  OrbitControls: ({
    enabled,
    ref,
  }: {
    readonly enabled: boolean
    readonly ref?: React.Ref<MockOrbitControls>
  }) => {
    const controls = useMemo(
      () => ({
        target: { set: vi.fn() },
        dollyIn: vi.fn(),
        dollyOut: vi.fn(),
        reset: vi.fn(),
        update: vi.fn(),
      }),
      [],
    )
    cameraIntentTestState.lastControls = controls
    useImperativeHandle(ref, () => controls, [controls])
    return <group name="orbit-controls" userData={{ orbitEnabled: enabled }} />
  },
  ContactShadows: () => <group name="contact-shadows" />,
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
import type { AutosaveCoordinator } from '../persistence/autosave'
import { CameraControls, SceneRoot, type CameraIntent } from './SceneRoot'
import { getRendererProfile } from './quality'

vi.mock('./PreviewEnvironment', () => ({
  PreviewEnvironment: ({
    profile,
  }: {
    readonly profile: { readonly qualityTier: string }
  }) => <group name={`preview-environment-${profile.qualityTier}`} />,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createStore(autosave?: AutosaveCoordinator) {
  let nextId = 0
  return createEditorStore({
    initialScene: createEmptyScene('6-tatami', {
      idFactory: () => `scene-id-${++nextId}`,
      now: () => '2026-01-01T00:00:00.000Z',
    }),
    autosave,
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
    profile: getRendererProfile(snapshot.mode),
    onEntitySelect: (id: string) => store.selectEntity(id),
    onEmptyHit: () => store.clearSelection(),
  }
}

describe('SceneRoot renderer integration', () => {
  it.each([
    ['top', 'target.set'] as const,
    ['reset', 'reset'] as const,
    ['zoom-in', 'dollyIn'] as const,
    ['zoom-out', 'dollyOut'] as const,
  ])(
    'consumes %s camera intent once across a controls remount',
    async (intent, method) => {
      function IntentHarness({ version }: { readonly version: number }) {
        const [currentIntent, setCurrentIntent] = useState<CameraIntent>(intent)
        return (
          <CameraControls
            key={version}
            intent={currentIntent}
            enabled
            onIntentConsumed={(consumed) =>
              setCurrentIntent((current) => (current === consumed ? 'idle' : current))
            }
          />
        )
      }

      const renderer = await create(<IntentHarness version={1} />)
      const firstControls = cameraIntentTestState.lastControls!
      expect(firstControls[method.split('.')[0] as keyof MockOrbitControls]).toBeDefined()
      const firstMethod =
        method === 'target.set'
          ? firstControls.target.set
          : firstControls[method as keyof Omit<MockOrbitControls, 'target'>]
      expect(firstMethod).toHaveBeenCalled()

      await renderer.update(<IntentHarness version={2} />)
      const remountedControls = cameraIntentTestState.lastControls!
      const remountedMethod =
        method === 'target.set'
          ? remountedControls.target.set
          : remountedControls[method as keyof Omit<MockOrbitControls, 'target'>]
      expect(remountedMethod).not.toHaveBeenCalled()
      await renderer.unmount()
    },
  )

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
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    } satisfies AutosaveCoordinator
    const store = createStore(autosave)
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
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() }
    const event = (x: number) => ({
      stopPropagation: vi.fn(),
      pointerId: 1,
      target,
      unprojectedPoint: { x, y: 0, z: 0 },
    })
    autosave.schedule.mockClear()

    await act(async () => {
      await handle.props.onPointerDown(event(0))
    })
    await renderer.update(<SceneRoot {...rootProps(store)} />)
    expect(
      renderer.scene.findByProps({ name: 'orbit-controls' }).props.userData.orbitEnabled,
    ).toBe(false)
    await act(async () => {
      await handle.props.onPointerMove(event(0.2))
      await handle.props.onPointerUp(event(0.2))
    })
    await renderer.update(<SceneRoot {...rootProps(store)} />)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(
      renderer.scene.findByProps({ name: 'orbit-controls' }).props.userData.orbitEnabled,
    ).toBe(true)
    expect(autosave.schedule).toHaveBeenCalledTimes(1)

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

  it('cancels a waypoint pointer gesture without autosaving and restores orbit', async () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    } satisfies AutosaveCoordinator
    const store = createStore(autosave)
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
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() }
    const event = (x: number) => ({
      stopPropagation: vi.fn(),
      pointerId: 9,
      target,
      unprojectedPoint: { x, y: 0, z: 0 },
    })
    autosave.schedule.mockClear()

    await act(async () => {
      await handle.props.onPointerDown(event(0))
      await handle.props.onPointerMove(event(0.2))
      await handle.props.onPointerCancel(event(0.2))
    })
    await renderer.update(<SceneRoot {...rootProps(store)} />)

    const routing = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === cableId)!.properties
      .routing as unknown as { waypoints: readonly { position: { x: number } }[] }
    expect(routing.waypoints[0]!.position.x).toBe(0)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(9)
    expect(
      renderer.scene.findByProps({ name: 'orbit-controls' }).props.userData.orbitEnabled,
    ).toBe(true)
    expect(autosave.schedule).not.toHaveBeenCalled()
  })

  it('cancels an active waypoint drag on Escape, mode switch, and root unmount', async () => {
    const autosave = {
      schedule: vi.fn(),
      flush: vi.fn(() => ({ state: 'idle' as const })),
      dispose: vi.fn(),
      getStatus: () => ({ state: 'idle' as const }),
    } satisfies AutosaveCoordinator
    const store = createStore(autosave)
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
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() }
    const event = (x: number) => ({
      stopPropagation: vi.fn(),
      pointerId: 5,
      target,
      unprojectedPoint: { x, y: 0, z: 0 },
    })
    autosave.schedule.mockClear()

    await act(async () => {
      await handle.props.onPointerDown(event(0))
      await handle.props.onPointerMove(event(0.2))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(target.releasePointerCapture).toHaveBeenCalledWith(5)
    expect(autosave.schedule).not.toHaveBeenCalled()
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === cableId)!
        .properties.routing,
    ).toMatchObject({
      waypoints: [{ id: waypoint.id, position: { x: 0, y: 0, z: 0 } }],
    })

    const resetHandle = renderer.scene.findByProps({
      name: `cable-waypoint-${cableId}-${waypoint.id}`,
    })
    await act(async () => {
      await resetHandle.props.onPointerDown(event(0))
      await resetHandle.props.onPointerMove(event(0.2))
    })
    store.setMode('preview')
    await act(async () => {
      await renderer.update(<SceneRoot {...rootProps(store)} />)
    })
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(2)
    expect(autosave.schedule).not.toHaveBeenCalled()
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === cableId)!
        .properties.routing,
    ).toMatchObject({
      waypoints: [{ id: waypoint.id, position: { x: 0, y: 0, z: 0 } }],
    })

    store.setMode('edit')
    await act(async () => {
      await renderer.update(<SceneRoot {...rootProps(store)} />)
    })
    const finalHandle = renderer.scene.findByProps({
      name: `cable-waypoint-${cableId}-${waypoint.id}`,
    })
    await act(async () => {
      await finalHandle.props.onPointerDown(event(0))
      await finalHandle.props.onPointerMove(event(0.2))
      await renderer.unmount()
    })
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(3)
    expect(autosave.schedule).not.toHaveBeenCalled()
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === cableId)!
        .properties.routing,
    ).toMatchObject({
      waypoints: [{ id: waypoint.id, position: { x: 0, y: 0, z: 0 } }],
    })
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

  it('propagates the caller-selected renderer profile instead of resetting preview to high', async () => {
    const store = createStore()
    store.setMode('preview')
    const profile = getRendererProfile('preview', 'safe')
    const renderer = await create(<SceneRoot {...rootProps(store)} profile={profile} />)

    expect(renderer.scene.findByProps({ name: 'preview-environment-safe' })).toBeDefined()
    expect(() => renderer.scene.findByProps({ name: 'contact-shadows' })).toThrow()
  })
})
