import { Canvas } from '@react-three/fiber'
import { Component, useState, useSyncExternalStore, type ReactNode } from 'react'

import type { EditorStore } from '../app/editor-store'
import { FallbackPanel } from './FallbackPanel'
import { isWebGLAvailable } from './quality'
import { SceneRoot, type CameraIntent } from './SceneRoot'
import { createInteractionController } from './controls/interaction-controller'
import { toRendererTransform } from './adapters'

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

export function SceneCanvas({
  store,
  webglAvailable = isWebGLAvailable,
}: SceneCanvasProps) {
  const snapshot = useSnapshot(store)
  const available = webglAvailable()
  const [cameraIntent, setCameraIntent] = useState<CameraIntent>('idle')
  const requestCameraIntent = (intent: CameraIntent) => {
    setCameraIntent('idle')
    queueMicrotask(() => setCameraIntent(intent))
  }
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
    <div className="scene-canvas" data-testid="scene-canvas">
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
            className="scene-canvas__webgl"
            camera={{ fov: 45, near: 0.1, far: 100, position: [4.8, 3.8, 4.8] }}
            dpr={[1, 2]}
            fallback={<FallbackPanel />}
            gl={{ antialias: true, alpha: false }}
            shadows
            onPointerMissed={() => store.clearSelection()}
          >
            <SceneRoot
              scene={snapshot.scene}
              selectedEntityIds={snapshot.selectedEntityIds}
              outOfBoundsEntityIds={snapshot.outOfBoundsEntityIds}
              cameraIntent={cameraIntent}
              store={store}
              mode={snapshot.mode}
              activeTool={snapshot.activeTool}
              onEntitySelect={(id) => store.selectEntity(id)}
              onEmptyHit={() => store.clearSelection()}
            />
          </Canvas>
        </RendererErrorBoundary>
      ) : (
        <FallbackPanel />
      )}
    </div>
  )
}
