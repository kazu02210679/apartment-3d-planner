import type { GeometryDescriptor } from '../../catalog/types'
import { resolveDeskLayoutGeometry } from '../../catalog/dimensions'
import { millimetresToRendererLength, type RendererVector3 } from '../adapters'
import { BoxPart, BoundsOutline, CylinderPart, type ModelProps } from './ModelPrimitives'

// eslint-disable-next-line react-refresh/only-export-components
export function resolveDeskLayout(
  dimensions: RendererVector3,
  geometry?: GeometryDescriptor,
) {
  const [width, height, depth] = dimensions
  const layout = resolveDeskLayoutGeometry(
    { width: width * 1000, height: height * 1000, depth: depth * 1000 },
    geometry,
  )
  const rendererTop = (part: (typeof layout)['main']) => ({
    size: [
      millimetresToRendererLength(part.size.width),
      millimetresToRendererLength(part.size.height),
      millimetresToRendererLength(part.size.depth),
    ] as RendererVector3,
    position: [
      millimetresToRendererLength(part.position.x),
      millimetresToRendererLength(part.position.y),
      millimetresToRendererLength(part.position.z),
    ] as RendererVector3,
  })
  return {
    origin: [0, 0, 0] as RendererVector3,
    topY: millimetresToRendererLength(layout.topY),
    main: rendererTop(layout.main),
    return: layout.return ? rendererTop(layout.return) : undefined,
    footprint: [
      millimetresToRendererLength(layout.footprint.width),
      millimetresToRendererLength(layout.footprint.depth),
    ] as const,
  }
}

export function LDesk({
  dimensions,
  material,
  outlineColor,
  geometry,
}: ModelProps & { readonly geometry?: GeometryDescriptor }) {
  const [, height] = dimensions
  const layout = resolveDeskLayout(dimensions, geometry)
  const top = layout.main.size[1]
  const [footprintWidth, footprintDepth] = layout.footprint
  const leg = Math.min(0.055, footprintWidth * 0.05, footprintDepth * 0.08)
  const topY = layout.topY
  const legY = -top / 2
  const accentHeight = Math.min(0.04, height * 0.08)
  const accentDepth = Math.min(0.1, footprintDepth * 0.18)
  return (
    <group name="detailed-l-desk">
      <BoxPart
        size={layout.main.size}
        position={layout.main.position}
        material={material}
      />
      {layout.return ? (
        <BoxPart
          size={layout.return.size}
          position={layout.return.position}
          material={material}
        />
      ) : null}
      {([-1, 1] as const)
        .flatMap((x) => ([-1, 1] as const).map((z) => [x, z] as const))
        .map(([x, z]) => (
          <CylinderPart
            key={`${x}-${z}`}
            radius={leg / 2}
            height={height - top}
            position={[
              x * (footprintWidth / 2 - leg),
              legY,
              z * (footprintDepth / 2 - leg),
            ]}
            material={material}
            color="#263547"
          />
        ))}
      <BoxPart
        size={[footprintWidth * 0.45, accentHeight, accentDepth]}
        position={[
          0,
          topY - top - accentHeight / 2,
          footprintDepth / 2 - accentDepth / 2,
        ]}
        material={material}
        color="#1b2737"
      />
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
