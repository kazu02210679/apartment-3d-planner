import { Edges } from '@react-three/drei'

import type { RendererVector3 } from '../adapters'
import type { RendererMaterial } from '../materials'

export interface ModelProps {
  readonly dimensions: RendererVector3
  readonly material: RendererMaterial
  readonly outlineColor?: string
}

export function BoxPart({
  size,
  position = [0, 0, 0],
  color,
  material,
  emissive,
}: {
  readonly size: RendererVector3
  readonly position?: RendererVector3
  readonly color?: string
  readonly material?: RendererMaterial
  readonly emissive?: string
}) {
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        {...material}
        color={color ?? material?.color}
        emissive={emissive}
      />
    </mesh>
  )
}

export function CylinderPart({
  radius,
  height,
  position,
  material,
  color,
  rotation,
}: {
  readonly radius: number
  readonly height: number
  readonly position: RendererVector3
  readonly material: RendererMaterial
  readonly color?: string
  readonly rotation?: RendererVector3
}) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, height, 12]} />
      <meshStandardMaterial {...material} color={color ?? material.color} />
    </mesh>
  )
}

export function BoundsOutline({
  dimensions,
  outlineColor,
}: Pick<ModelProps, 'dimensions' | 'outlineColor'>) {
  if (!outlineColor) return null
  return (
    <mesh>
      <boxGeometry args={dimensions} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color={outlineColor} threshold={15} />
    </mesh>
  )
}
