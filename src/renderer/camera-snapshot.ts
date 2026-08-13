import type { Camera, Vector3 } from 'three'

export interface OrbitTargetRef {
  current: Vector3 | null
}

export interface CameraSnapshotControls {
  readonly target: Vector3
  update(): void
}

export interface CameraSnapshot {
  readonly position: readonly [number, number, number]
  readonly quaternion: readonly [number, number, number, number]
  readonly zoom: number
  readonly projectionMatrix: readonly number[]
  readonly projectionMatrixInverse: readonly number[]
  readonly target: readonly [number, number, number]
}

export interface CameraSnapshotRef {
  current: CameraSnapshot | null
}

function tuple3(values: readonly number[]): [number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
}

function tuple4(values: readonly number[]): [number, number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0]
}

function readZoom(camera: Camera): number {
  const cameraWithZoom = camera as Camera & { readonly zoom?: unknown }
  return typeof cameraWithZoom.zoom === 'number' ? cameraWithZoom.zoom : 1
}

function writeZoom(camera: Camera, zoom: number): void {
  const cameraWithZoom = camera as Camera & { zoom?: number }
  if (typeof cameraWithZoom.zoom === 'number') cameraWithZoom.zoom = zoom
}

export function captureCameraSnapshot(
  camera: Camera,
  controls: CameraSnapshotControls,
): CameraSnapshot {
  return {
    position: tuple3(camera.position.toArray()),
    quaternion: tuple4(camera.quaternion.toArray()),
    zoom: readZoom(camera),
    projectionMatrix: [...camera.projectionMatrix.toArray()],
    projectionMatrixInverse: [...camera.projectionMatrixInverse.toArray()],
    target: tuple3(controls.target.toArray()),
  }
}

export function restoreCameraSnapshot(
  camera: Camera,
  controls: CameraSnapshotControls,
  snapshot: CameraSnapshot,
): void {
  camera.position.fromArray(snapshot.position)
  camera.quaternion.fromArray(snapshot.quaternion)
  writeZoom(camera, snapshot.zoom)
  camera.projectionMatrix.fromArray(snapshot.projectionMatrix)
  camera.projectionMatrixInverse.fromArray(snapshot.projectionMatrixInverse)
  controls.target.fromArray(snapshot.target)
  controls.update()

  // OrbitControls.update() derives the orientation from position and target.
  // Restore the exact transient orientation after it has synchronized its
  // internal spherical state, including any camera roll.
  camera.position.fromArray(snapshot.position)
  camera.quaternion.fromArray(snapshot.quaternion)
  writeZoom(camera, snapshot.zoom)
  camera.projectionMatrix.fromArray(snapshot.projectionMatrix)
  camera.projectionMatrixInverse.fromArray(snapshot.projectionMatrixInverse)
}
