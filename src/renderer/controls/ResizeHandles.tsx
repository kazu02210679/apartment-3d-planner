import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
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

export function ResizeHandles({
  entityId,
  entityObject,
  dimensions,
  enabled,
  controller,
}: ResizeHandlesProps) {
  const pointer = useRef<
    { readonly origin: PointerPoint; readonly axis: WorldVector } | undefined
  >(undefined)
  const axis = useRef<0 | 1 | 2 | null>(null)
  const capture = useRef<
    | {
        readonly target: { releasePointerCapture(pointerId: number): void }
        readonly pointerId: number
      }
    | undefined
  >(undefined)
  if (!enabled) return null
  const size = toRendererDimensions(dimensions)
  const begin = (index: 0 | 1 | 2) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (!entityObject || !controller.start(entityId, 'resize')) return
    const target = event.target as unknown as {
      setPointerCapture(pointerId: number): void
      releasePointerCapture(pointerId: number): void
    }
    target.setPointerCapture(event.pointerId)
    capture.current = { target, pointerId: event.pointerId }
    pointer.current = {
      // Freeze the start frame. The entity's document transform moves as the
      // positive handle preserves its opposite face, so every move must be
      // measured in the original world coordinate frame.
      origin: event.unprojectedPoint.clone() as PointerPoint,
      axis: worldAxis(entityObject, index),
    }
    axis.current = index
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    if (!controller.active || !pointer.current || axis.current === null) return
    event.stopPropagation()
    controller.resizeByLocalDelta(
      axis.current,
      (event.unprojectedPoint as PointerPoint)
        .clone()
        .sub(pointer.current.origin)
        .dot(pointer.current.axis),
    )
  }
  const clearPointer = () => {
    capture.current?.target.releasePointerCapture(capture.current.pointerId)
    capture.current = undefined
    pointer.current = undefined
    axis.current = null
  }
  const finish = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (controller.active) controller.commit()
    clearPointer()
  }
  const cancel = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (controller.active) controller.cancel()
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
