import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { toRendererDimensions } from '../adapters'
import type { Dimensions } from '../../domain/schema'
import type { InteractionController } from './interaction-controller'

interface ResizeHandlesProps {
  readonly entityId: string
  readonly dimensions: Dimensions
  readonly enabled: boolean
  readonly controller: InteractionController
}

const HANDLE_SIZE = 0.045

export function ResizeHandles({
  entityId,
  dimensions,
  enabled,
  controller,
}: ResizeHandlesProps) {
  const initial = useRef<readonly [number, number, number] | null>(null)
  const axis = useRef<0 | 1 | 2 | null>(null)
  if (!enabled) return null
  const size = toRendererDimensions(dimensions)
  const begin = (index: 0 | 1 | 2) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (!controller.start(entityId, 'resize')) return
    ;(
      event.target as unknown as { setPointerCapture(pointerId: number): void }
    ).setPointerCapture(event.pointerId)
    initial.current = size
    axis.current = index
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    if (!controller.active || !initial.current || axis.current === null) return
    event.stopPropagation()
    const next = [...initial.current] as [number, number, number]
    next[axis.current] = Math.max(HANDLE_SIZE, next[axis.current] + event.delta * 0.003)
    controller.updateDimensions(next)
  }
  const finish = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (controller.active) controller.commit()
    ;(
      event.target as unknown as { releasePointerCapture(pointerId: number): void }
    ).releasePointerCapture(event.pointerId)
    initial.current = null
    axis.current = null
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
