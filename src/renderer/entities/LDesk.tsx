import type { GeometryDescriptor } from '../../catalog/types'
import { BoxPart, BoundsOutline, CylinderPart, type ModelProps } from './ModelPrimitives'

export function LDesk({
  dimensions,
  material,
  outlineColor,
  geometry,
}: ModelProps & { readonly geometry?: GeometryDescriptor }) {
  const [width, height, depth] = dimensions
  const top = Math.min(0.06, height * 0.12)
  const leg = Math.min(0.055, width * 0.05, depth * 0.08)
  const returnSide =
    geometry?.kind === 'l-desk' && geometry.returnSide === 'left' ? -1 : 1
  const topY = height / 2 - top / 2
  const mainDepth = depth * 0.54
  const returnWidth = width * 0.42
  const legY = -top / 2
  return (
    <group name="detailed-l-desk">
      <BoxPart
        size={[width, top, mainDepth]}
        position={[0, topY, -depth * 0.23]}
        material={material}
      />
      <BoxPart
        size={[returnWidth, top, depth * 0.54]}
        position={[returnSide * (width / 2 - returnWidth / 2), topY, depth * 0.23]}
        material={material}
      />
      {([-1, 1] as const)
        .flatMap((x) => ([-1, 1] as const).map((z) => [x, z] as const))
        .map(([x, z]) => (
          <CylinderPart
            key={`${x}-${z}`}
            radius={leg / 2}
            height={Math.max(0.04, height - top)}
            position={[x * (width / 2 - leg), legY, z * (depth / 2 - leg)]}
            material={material}
            color="#263547"
          />
        ))}
      <BoxPart
        size={[width * 0.45, Math.min(0.04, height * 0.08), Math.min(0.1, depth * 0.18)]}
        position={[0, topY - top * 1.6, depth * 0.18]}
        material={material}
        color="#1b2737"
      />
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
