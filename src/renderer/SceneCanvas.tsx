import { Canvas } from '@react-three/fiber'
import { Component, useState, useSyncExternalStore, type ReactNode } from 'react'

import type { EditorStore } from '../app/editor-store'
import { FallbackPanel } from './FallbackPanel'
import { isWebGLAvailable } from './quality'
import { SceneRoot, type CameraIntent } from './SceneRoot'

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

  return (
    <div className="scene-canvas" data-testid="scene-canvas">
      <nav className="scene-camera-controls" aria-label="Camera controls">
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
