import {
  Canvas,
  events as createPointerEvents,
  type EventManager,
  type RootState,
  type RootStore,
} from '@react-three/fiber'
import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

import type { EditorStore } from '../app/editor-store'
import {
  isPlacementEntityEligible,
  solvePlacement,
  type PlacementAction,
} from '../domain/placement'
import { FallbackPanel } from './FallbackPanel'
import { RendererEvidenceBridge } from './EvidenceBridge'
import type { CameraSnapshot, OrbitTargetRef } from './camera-snapshot'
import {
  getRendererProfile,
  isWebGLAvailable,
  previewTierForFrameWindow,
  type PreviewQualityTier,
} from './quality'
import { SceneRoot, type CameraIntent } from './SceneRoot'
import { createInteractionController } from './controls/interaction-controller'
import { prioritizeResizeHandleIntersections } from './controls/handle-raycast'
import { toRendererTransform } from './adapters'
import { PCFShadowMap, type Intersection } from 'three'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

class RendererErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <FallbackPanel /> : this.props.children
  }
}

interface SceneCanvasProps {
  readonly store: EditorStore
  readonly webglAvailable?: () => boolean
}

function createResizeHandleEvents(store: RootStore): EventManager<HTMLElement> {
  const eventManager = createPointerEvents(store)
  return {
    ...eventManager,
    filter: (items: Intersection[], state: RootState) =>
      prioritizeResizeHandleIntersections(
        eventManager.filter?.([...items], state) ?? items,
      ),
  }
}

export function SceneCanvas({
  store,
  webglAvailable = isWebGLAvailable,
}: SceneCanvasProps) {
  const snapshot = useSnapshot(store)
  const [previewTier, setPreviewTier] = useState<PreviewQualityTier>('high')
  const profile = getRendererProfile(snapshot.mode, previewTier)
  const available = webglAvailable()
  const evidenceEnabled =
    typeof window !== 'undefined' && window.location.search === '?evidence=1'
  useLayoutEffect(() => {
    if (!evidenceEnabled) return
    const fineGrained = window.__apartmentResizeFineGrainedEvidence
    if (
      !fineGrained ||
      fineGrained.handlerToLayoutToken === null ||
      (fineGrained.kind === 'pointerdown') !== snapshot.interactionActive
    )
      return
    window.__apartmentEvidenceProbe?.endPhase(fineGrained.handlerToLayoutToken)
    fineGrained.handlerToLayoutToken = null
    fineGrained.layoutToRenderToken =
      window.__apartmentEvidenceProbe?.startPhase(
        `resize-${fineGrained.kind}-layout-to-first-render`,
      ) ?? null
  }, [evidenceEnabled, snapshot.interactionActive])
  const canvasRef = useRef<HTMLDivElement>(null)
  const cameraSnapshotRef = useRef<CameraSnapshot | null>(null)
  const orbitTargetRef = useRef<OrbitTargetRef['current']>(null)
  const [placementMenu, setPlacementMenu] = useState<
    { readonly entityId: string; readonly left: number; readonly top: number } | undefined
  >()
  const [cameraIntent, setCameraIntent] = useState<CameraIntent>('idle')
  useEffect(() => {
    setPreviewTier('high')
    if (snapshot.mode !== 'preview' || typeof requestAnimationFrame === 'undefined')
      return
    let warmupFrames = 0
    let lastTime: number | undefined
    let windowSamples: number[] = []
    let frameHandle = 0
    const measure = (time: number) => {
      if (lastTime !== undefined) {
        const interval = time - lastTime
        if (warmupFrames < 60) warmupFrames += 1
        else {
          windowSamples.push(interval)
          if (windowSamples.length === 60) {
            const samples = windowSamples
            windowSamples = []
            setPreviewTier((current) => previewTierForFrameWindow(current, samples))
          }
        }
      }
      lastTime = time
      frameHandle = requestAnimationFrame(measure)
    }
    frameHandle = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frameHandle)
  }, [snapshot.mode])
  const requestCameraIntent = (intent: CameraIntent) => {
    setCameraIntent('idle')
    queueMicrotask(() => setCameraIntent(intent))
  }
  const onCameraIntentConsumed = useCallback((consumedIntent: CameraIntent) => {
    if (consumedIntent === 'idle') return
    setCameraIntent((currentIntent) =>
      currentIntent === consumedIntent ? 'idle' : currentIntent,
    )
  }, [])
  const selectEntity = useCallback(
    (id: string) => {
      if (snapshot.mode === 'edit') store.selectEntity(id)
    },
    [snapshot.mode, store],
  )
  const clearSelection = useCallback(() => {
    if (snapshot.mode === 'edit') store.clearSelection()
  }, [snapshot.mode, store])
  const pointerMissSuppressionRef = useRef(false)
  const onCanvasPointerDownCapture = useCallback(() => {
    pointerMissSuppressionRef.current = false
  }, [])
  const onResizeStart = useCallback(() => {
    pointerMissSuppressionRef.current = true
  }, [])
  const onCanvasPointerMissed = useCallback(() => {
    if (pointerMissSuppressionRef.current) return
    clearSelection()
  }, [clearSelection])
  const openPlacementMenu = useCallback(
    (entityId: string, clientX: number, clientY: number) => {
      const currentSnapshot = store.getSnapshot()
      if (
        currentSnapshot.mode !== 'edit' ||
        !isPlacementEntityEligible(currentSnapshot.scene, entityId) ||
        !canvasRef.current
      )
        return
      const bounds = canvasRef.current.getBoundingClientRect()
      setPlacementMenu({
        entityId,
        left: Math.max(8, clientX - bounds.left),
        top: Math.max(8, clientY - bounds.top),
      })
    },
    [store],
  )
  const onEntityContextMenu = useCallback(
    (entityId: string, event: MouseEvent) => {
      if (store.getSnapshot().mode !== 'edit') return
      event.preventDefault()
      openPlacementMenu(entityId, event.clientX, event.clientY)
    },
    [openPlacementMenu, store],
  )
  const onCanvasContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (snapshot.mode !== 'edit' || !snapshot.selectedEntityId) return
      event.preventDefault()
      openPlacementMenu(snapshot.selectedEntityId, event.clientX, event.clientY)
    },
    [openPlacementMenu, snapshot.mode, snapshot.selectedEntityId],
  )
  const applyPlacement = (placement: PlacementAction) => {
    if (!placementMenu) return
    store.placeEntity(placementMenu.entityId, placement)
    setPlacementMenu(undefined)
  }
  const placementAvailability: Record<PlacementAction, boolean> = placementMenu
    ? {
        'in-bounds':
          solvePlacement(snapshot.scene, {
            entityId: placementMenu.entityId,
            kind: 'in-bounds',
          }).status !== 'unavailable',
        nearest:
          solvePlacement(snapshot.scene, {
            entityId: placementMenu.entityId,
            kind: 'nearest',
          }).status !== 'unavailable',
        floor:
          solvePlacement(snapshot.scene, {
            entityId: placementMenu.entityId,
            kind: 'floor',
          }).status !== 'unavailable',
      }
    : { 'in-bounds': false, nearest: false, floor: false }
  const onCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== 'End' ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229 ||
        event.defaultPrevented ||
        snapshot.mode !== 'edit' ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        placementMenu ||
        document.activeElement !== event.currentTarget ||
        !snapshot.selectedEntityId
      )
        return
      if (
        store.placeEntity(snapshot.selectedEntityId, event.shiftKey ? 'floor' : 'nearest')
      )
        event.preventDefault()
    },
    [placementMenu, snapshot.mode, snapshot.selectedEntityId, store],
  )
  useEffect(() => {
    if (snapshot.mode !== 'edit') setPlacementMenu(undefined)
  }, [snapshot.mode])
  const nudgeSelected = () => {
    const id = snapshot.selectedEntityId
    const entity = id
      ? snapshot.scene.entities.find((candidate) => candidate.id === id)
      : undefined
    if (!id || !entity || entity.locked || !entity.visible || snapshot.mode !== 'edit')
      return
    const controller = createInteractionController(store)
    if (!controller.start(id, 'move')) return
    const transform = toRendererTransform(entity.transform)
    controller.updateTransform([
      transform.position[0] + 0.01,
      transform.position[1],
      transform.position[2],
    ])
    controller.commit()
  }

  return (
    <div
      ref={canvasRef}
      className="scene-canvas"
      data-testid="scene-canvas"
      data-renderer-profile={profile.id}
      role="region"
      aria-label="3D editing canvas"
      tabIndex={snapshot.mode === 'edit' ? 0 : -1}
      onKeyDown={onCanvasKeyDown}
      onContextMenu={onCanvasContextMenu}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest('[data-placement-menu]'))
          setPlacementMenu(undefined)
      }}
      onPointerDownCapture={onCanvasPointerDownCapture}
    >
      <nav className="scene-camera-controls" aria-label="Camera controls">
        <button
          type="button"
          aria-label="選択対象を右へ移動"
          disabled={
            !available ||
            snapshot.mode !== 'edit' ||
            !snapshot.selectedEntityId ||
            !snapshot.scene.entities.some(
              (entity) =>
                entity.id === snapshot.selectedEntityId &&
                entity.visible &&
                !entity.locked,
            )
          }
          onClick={nudgeSelected}
        >
          右へ移動
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!available}
          onClick={() => requestCameraIntent('zoom-in')}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!available}
          onClick={() => requestCameraIntent('zoom-out')}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Top view"
          disabled={!available}
          onClick={() => requestCameraIntent('top')}
        >
          Top
        </button>
        <button
          type="button"
          aria-label="Reset camera"
          disabled={!available}
          onClick={() => requestCameraIntent('reset')}
        >
          Reset
        </button>
      </nav>
      {available ? (
        <RendererErrorBoundary>
          <Canvas
            key={`renderer-antialias-${profile.antialias ? 'on' : 'off'}`}
            className="scene-canvas__webgl"
            camera={{ fov: 45, near: 0.1, far: 100, position: [4.8, 3.8, 4.8] }}
            dpr={profile.dpr}
            fallback={<FallbackPanel />}
            gl={{ antialias: profile.antialias, alpha: false }}
            shadows={{ enabled: true, type: PCFShadowMap }}
            events={createResizeHandleEvents}
            onPointerMissed={onCanvasPointerMissed}
          >
            {evidenceEnabled ? (
              <RendererEvidenceBridge
                profile={profile}
                store={store}
                onForcePreviewTier={setPreviewTier}
                orbitTargetRef={orbitTargetRef}
              />
            ) : null}
            <SceneRoot
              scene={snapshot.scene}
              selectedEntityIds={snapshot.selectedEntityIds}
              outOfBoundsEntityIds={snapshot.outOfBoundsEntityIds}
              cameraIntent={cameraIntent}
              onIntentConsumed={onCameraIntentConsumed}
              cameraSnapshotRef={cameraSnapshotRef}
              orbitTargetRef={orbitTargetRef}
              store={store}
              mode={snapshot.mode}
              profile={profile}
              activeTool={snapshot.activeTool}
              onEntitySelect={selectEntity}
              onEmptyHit={onCanvasPointerMissed}
              onResizeStart={onResizeStart}
              onEntityContextMenu={onEntityContextMenu}
            />
          </Canvas>
        </RendererErrorBoundary>
      ) : (
        <FallbackPanel />
      )}
      {placementMenu ? (
        <div
          className="placement-menu"
          data-placement-menu="true"
          role="menu"
          aria-label="配置修正"
          style={{ left: placementMenu.left, top: placementMenu.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!placementAvailability['in-bounds']}
            onClick={() => applyPlacement('in-bounds')}
          >
            範囲内に戻す
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!placementAvailability.nearest}
            onClick={() => applyPlacement('nearest')}
          >
            最寄りの支持面に置く
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!placementAvailability.floor}
            onClick={() => applyPlacement('floor')}
          >
            床に置く
          </button>
        </div>
      ) : null}
    </div>
  )
}
