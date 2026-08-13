import { PerspectiveCamera } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  captureCameraSnapshot,
  restoreCameraSnapshot,
  type CameraSnapshotControls,
} from './camera-snapshot'

function createControls(): CameraSnapshotControls {
  return {
    target: new PerspectiveCamera().position,
    update: vi.fn(),
  }
}

describe('camera snapshot', () => {
  it('round-trips camera position, orientation, zoom, projection, and orbit target', () => {
    const sourceCamera = new PerspectiveCamera(45, 1.5, 0.1, 100)
    sourceCamera.position.set(3.2, 4.1, 5.7)
    sourceCamera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize()
    sourceCamera.zoom = 1.7
    sourceCamera.updateProjectionMatrix()
    const sourceControls = createControls()
    sourceControls.target.set(0.4, 0.8, -0.6)

    const snapshot = captureCameraSnapshot(sourceCamera, sourceControls)

    const restoredCamera = new PerspectiveCamera(45, 1.5, 0.1, 100)
    const restoredControls = createControls()
    restoreCameraSnapshot(restoredCamera, restoredControls, snapshot)

    expect(restoredCamera.position.toArray()).toEqual(sourceCamera.position.toArray())
    expect(restoredCamera.quaternion.toArray()).toEqual(sourceCamera.quaternion.toArray())
    expect(restoredCamera.zoom).toBe(sourceCamera.zoom)
    expect(restoredCamera.projectionMatrix.toArray()).toEqual(
      sourceCamera.projectionMatrix.toArray(),
    )
    expect(restoredCamera.projectionMatrixInverse.toArray()).toEqual(
      sourceCamera.projectionMatrixInverse.toArray(),
    )
    expect(restoredControls.target.toArray()).toEqual(sourceControls.target.toArray())
    expect(restoredControls.update).toHaveBeenCalledOnce()
  })
})
