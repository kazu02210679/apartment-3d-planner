import { Edges } from '@react-three/drei'
import { createContext, useContext, type ReactNode } from 'react'

import type { RendererVector3 } from '../adapters'
import type { RendererMaterial } from '../materials'

export interface ModelProps {
  readonly dimensions: RendererVector3
  readonly material: RendererMaterial
  readonly outlineColor?: string
}

const ModelBoundsContext = createContext<RendererVector3 | undefined>(undefined)

export function ModelBoundsProvider({
  dimensions,
  children,
}: {
  readonly dimensions: RendererVector3
  readonly children: ReactNode
}) {
  return (
    <ModelBoundsContext.Provider value={dimensions}>
      {children}
    </ModelBoundsContext.Provider>
  )
}

function clamp(value: number, half: number, extent: number) {
  return Math.max(-half + extent, Math.min(half - extent, value))
}

// eslint-disable-next-line react-refresh/only-export-components
export function fitBoxToBounds(
  size: RendererVector3,
  position: RendererVector3,
  bounds: RendererVector3,
): { readonly size: RendererVector3; readonly position: RendererVector3 } {
  const fittedSize: RendererVector3 = [
    Math.min(size[0], bounds[0]),
    Math.min(size[1], bounds[1]),
    Math.min(size[2], bounds[2]),
  ]
  return {
    size: fittedSize,
    position: [
      clamp(position[0], bounds[0] / 2, fittedSize[0] / 2),
      clamp(position[1], bounds[1] / 2, fittedSize[1] / 2),
      clamp(position[2], bounds[2] / 2, fittedSize[2] / 2),
    ],
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function fitCylinderToBounds(
  radius: number,
  height: number,
  position: RendererVector3,
  bounds: RendererVector3,
  rotation?: RendererVector3,
): { readonly position: RendererVector3 } {
  const xAxis = Math.abs(Math.sin(rotation?.[2] ?? 0)) > 0.9
  const zAxis = Math.abs(Math.sin(rotation?.[0] ?? 0)) > 0.9
  const extents: RendererVector3 = xAxis
    ? [height / 2, radius, radius]
    : zAxis
      ? [radius, radius, height / 2]
      : [radius, height / 2, radius]
  return {
    position: [
      clamp(position[0], bounds[0] / 2, Math.min(extents[0], bounds[0] / 2)),
      clamp(position[1], bounds[1] / 2, Math.min(extents[1], bounds[1] / 2)),
      clamp(position[2], bounds[2] / 2, Math.min(extents[2], bounds[2] / 2)),
    ] as RendererVector3,
  }
}

export function BoxPart({
  size,
  position = [0, 0, 0] as RendererVector3,
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
  const bounds = useContext(ModelBoundsContext)
  const fitted = bounds
    ? fitBoxToBounds(size, position, bounds)
    : { size: size as RendererVector3, position: position as RendererVector3 }
  return (
    <mesh castShadow receiveShadow position={fitted.position}>
      <boxGeometry args={fitted.size} />
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
  const bounds = useContext(ModelBoundsContext)
  const fitted = bounds
    ? fitCylinderToBounds(radius, height, position, bounds, rotation)
    : { position: position as RendererVector3 }
  return (
    <mesh
      castShadow
      receiveShadow
      position={fitted.position}
      rotation={rotation as RendererVector3 | undefined}
    >
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
