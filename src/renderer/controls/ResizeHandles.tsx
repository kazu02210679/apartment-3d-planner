import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import { toRendererDimensions } from '../adapters'
import type { Dimensions } from '../../domain/schema'
import type { InteractionController } from './interaction-controller'

interface ResizeHandlesProps {
  readonly entityId: string
  readonly entityObject: Object3D | null
  readonly dimensions: Dimensions
  readonly enabled: boolean
  readonly controller: InteractionController
}

const HANDLE_SIZE = 0.045

function startResizeEvidencePhase(phase: string): number | null {
  return (
    window as typeof window & {
      __apartmentEvidenceProbe?: { startPhase: (name: string) => number | null }
    }
  ).__apartmentEvidenceProbe?.startPhase(phase) ?? null
}

function endResizeEvidencePhase(token: number | null): void {
  ;(
    window as typeof window & {
      __apartmentEvidenceProbe?: { endPhase: (value: number | null) => void }
    }
  ).__apartmentEvidenceProbe?.endPhase(token)
}

function cleanupResizeEvidenceState(): void {
  const evidenceWindow = window as typeof window & {
    __apartmentEvidenceProbe?: { endPhase: (value: number | null) => void }
    __apartmentResizeFineGrainedEvidence?: {
      kind: 'pointerdown' | 'commit'
      handlerToLayoutToken: number | null
      layoutToRenderToken: number | null
    }
  }
  const state = evidenceWindow.__apartmentResizeFineGrainedEvidence
  if (!state) return
  if (state.handlerToLayoutToken !== null)
    evidenceWindow.__apartmentEvidenceProbe?.endPhase(state.handlerToLayoutToken)
  if (state.layoutToRenderToken !== null)
    evidenceWindow.__apartmentEvidenceProbe?.endPhase(state.layoutToRenderToken)
  delete evidenceWindow.__apartmentResizeFineGrainedEvidence
}

function armResizeLayoutBoundary(kind: 'pointerdown' | 'commit'): void {
  const evidenceWindow = window as typeof window & {
    __apartmentEvidenceProbe?: { startPhase: (name: string) => number | null }
    __apartmentResizeFineGrainedEvidence?: {
      kind: 'pointerdown' | 'commit'
      handlerToLayoutToken: number | null
      layoutToRenderToken: number | null
    }
  }
  const probe = evidenceWindow.__apartmentEvidenceProbe
  if (!probe) return
  cleanupResizeEvidenceState()
  const handlerToLayoutToken = probe.startPhase(
    `resize-${kind}-handler-return-to-layout`,
  )
  if (handlerToLayoutToken === null) return
  evidenceWindow.__apartmentResizeFineGrainedEvidence = {
    kind,
    handlerToLayoutToken,
    layoutToRenderToken: null,
  }
}

interface WorldVector {
  readonly x: number
  readonly y: number
  readonly z: number
}

interface PointerPoint extends WorldVector {
  clone(): { sub(point: WorldVector): { dot(axis: WorldVector): number } }
}

function worldAxis(object: Object3D, axis: 0 | 1 | 2): WorldVector {
  const elements = object.matrixWorld.elements
  const offset = axis * 4
  const x = elements[offset]!
  const y = elements[offset + 1]!
  const z = elements[offset + 2]!
  const length = Math.hypot(x, y, z)
  return { x: x / length, y: y / length, z: z / length }
}

function coordinateOnWorldAxis(
  ray: { readonly origin: WorldVector; readonly direction: WorldVector } | undefined,
  axisOrigin: WorldVector,
  axis: WorldVector,
): number | null {
  if (!ray) return null
  const between = {
    x: axisOrigin.x - ray.origin.x,
    y: axisOrigin.y - ray.origin.y,
    z: axisOrigin.z - ray.origin.z,
  }
  const axisRayDot =
    axis.x * ray.direction.x + axis.y * ray.direction.y + axis.z * ray.direction.z
  const denominator = 1 - axisRayDot * axisRayDot
  if (Math.abs(denominator) < 1e-6) return null
  const axisBetweenDot = axis.x * between.x + axis.y * between.y + axis.z * between.z
  const rayBetweenDot =
    ray.direction.x * between.x +
    ray.direction.y * between.y +
    ray.direction.z * between.z
  return (axisRayDot * rayBetweenDot - axisBetweenDot) / denominator
}

export function ResizeHandles({
  entityId,
  entityObject,
  dimensions,
  enabled,
  controller,
}: ResizeHandlesProps) {
  const pointer = useRef<
    | {
        readonly origin: PointerPoint
        readonly axis: WorldVector
        readonly axisOrigin: WorldVector
        readonly axisCoordinate: number | null
      }
    | undefined
  >(undefined)
  const axis = useRef<0 | 1 | 2 | null>(null)
  const capture = useRef<
    | {
        readonly target: { releasePointerCapture(pointerId: number): void }
        readonly pointerId: number
      }
    | undefined
  >(undefined)
  const clearPointer = useCallback(() => {
    capture.current?.target.releasePointerCapture(capture.current.pointerId)
    capture.current = undefined
    pointer.current = undefined
    axis.current = null
  }, [])
  useEffect(() => {
    if (!enabled) return
    const cancel = () => {
      if (controller.active) controller.cancel()
      cleanupResizeEvidenceState()
      clearPointer()
    }
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !controller.active) return
      cancel()
    }
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', cancelOnEscape)
    return () => {
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', cancelOnEscape)
    }
  }, [clearPointer, controller, enabled])
  useEffect(
    () => () => {
      if (controller.active) controller.cancel()
      cleanupResizeEvidenceState()
      clearPointer()
    },
    [clearPointer, controller],
  )
  if (!enabled) return null
  const size = toRendererDimensions(dimensions)
  const begin = (index: 0 | 1 | 2) => (event: ThreeEvent<PointerEvent>) => {
    cleanupResizeEvidenceState()
    const phase = startResizeEvidencePhase('resize-pointerdown-app-handler')
    let started = false
    try {
      event.stopPropagation()
      if (!entityObject || !controller.start(entityId, 'resize', entityObject)) return
      const target = event.target as unknown as {
        setPointerCapture(pointerId: number): void
        releasePointerCapture(pointerId: number): void
      }
      target.setPointerCapture(event.pointerId)
      capture.current = { target, pointerId: event.pointerId }
      const currentAxis = worldAxis(entityObject, index)
      const elements = entityObject.matrixWorld.elements
      const axisOrigin = { x: elements[12]!, y: elements[13]!, z: elements[14]! }
      pointer.current = {
        // Freeze the start frame. The entity's document transform moves as the
        // positive handle preserves its opposite face, so every move must be
        // measured in the original world coordinate frame.
        origin: event.unprojectedPoint.clone() as PointerPoint,
        axis: currentAxis,
        axisOrigin,
        axisCoordinate: coordinateOnWorldAxis(event.ray, axisOrigin, currentAxis),
      }
      axis.current = index
      started = true
    } finally {
      endResizeEvidencePhase(phase)
      if (started) armResizeLayoutBoundary('pointerdown')
    }
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    if (!controller.active || !pointer.current || axis.current === null) return
    event.stopPropagation()
    const coordinate = coordinateOnWorldAxis(
      event.ray,
      pointer.current.axisOrigin,
      pointer.current.axis,
    )
    const delta =
      coordinate !== null && pointer.current.axisCoordinate !== null
        ? coordinate - pointer.current.axisCoordinate
        : (event.unprojectedPoint as PointerPoint)
            .clone()
            .sub(pointer.current.origin)
            .dot(pointer.current.axis)
    controller.resizeByLocalDelta(axis.current, delta)
  }
  const finish = (event: ThreeEvent<PointerEvent>) => {
    cleanupResizeEvidenceState()
    const phase = startResizeEvidencePhase('resize-commit-app-handler')
    const wasActive = controller.active
    try {
      event.stopPropagation()
      if (controller.active) controller.commit()
      clearPointer()
    } finally {
      endResizeEvidencePhase(phase)
      if (wasActive) armResizeLayoutBoundary('commit')
    }
  }
  const cancel = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (controller.active) controller.cancel()
    cleanupResizeEvidenceState()
    clearPointer()
  }
  const lostCapture = (event: ThreeEvent<PointerEvent>) => {
    const interrupted = controller.active || capture.current !== undefined
    event.stopPropagation()
    if (controller.active) controller.cancel()
    if (interrupted) cleanupResizeEvidenceState()
    clearPointer()
  }
  const handle = (
    position: readonly [number, number, number],
    index: 0 | 1 | 2,
    name: string,
  ) => (
    <mesh
      key={name}
      name={name}
      position={position}
      onPointerDown={begin(index)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={lostCapture}
    >
      <boxGeometry args={[HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE]} />
      <meshBasicMaterial color="#d7f36b" />
    </mesh>
  )
  return (
    <group name="resize-handles">
      {handle([size[0] / 2, 0, 0], 0, 'resize-width-handle')}
      {handle([0, size[1] / 2, 0], 1, 'resize-height-handle')}
      {handle([0, 0, size[2] / 2], 2, 'resize-depth-handle')}
    </group>
  )
}
