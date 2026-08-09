import { Edges } from '@react-three/drei'

import type { RendererVector3 } from '../adapters'
import type { RendererMaterial } from '../materials'

interface GenericBoxProps {
  readonly dimensions: RendererVector3
  readonly material: RendererMaterial
  readonly outlineColor?: string
}

export function GenericBox({ dimensions, material, outlineColor }: GenericBoxProps) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={dimensions} />
      <meshStandardMaterial {...material} />
      {outlineColor ? <Edges color={outlineColor} threshold={15} /> : null}
    </mesh>
  )
}
