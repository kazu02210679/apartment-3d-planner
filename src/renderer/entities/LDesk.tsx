import type { GeometryDescriptor } from '../../catalog/types'
import { millimetresToRendererLength, type RendererVector3 } from '../adapters'
import { BoxPart, BoundsOutline, CylinderPart, type ModelProps } from './ModelPrimitives'

interface DeskTop {
  readonly size: RendererVector3
  readonly position: RendererVector3
}

function horizontalBounds(parts: readonly DeskTop[]) {
  const x = parts.flatMap((part) => [
    part.position[0] - part.size[0] / 2,
    part.position[0] + part.size[0] / 2,
  ])
  const z = parts.flatMap((part) => [
    part.position[2] - part.size[2] / 2,
    part.position[2] + part.size[2] / 2,
  ])
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minZ: Math.min(...z),
    maxZ: Math.max(...z),
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveDeskLayout(
  dimensions: RendererVector3,
  geometry?: GeometryDescriptor,
) {
  const [width, height, depth] = dimensions
  const top = Math.min(0.06, height * 0.12)
  const topY = height / 2 - top / 2
  if (geometry?.kind !== 'l-desk')
    return {
      origin: [0, 0, 0] as RendererVector3,
      topY,
      main: {
        size: [width, top, depth] as RendererVector3,
        position: [0, topY, 0] as RendererVector3,
      },
      footprint: [width, depth] as const,
    }
  const mainWidth = millimetresToRendererLength(geometry.mainTop.width)
  const mainDepth = millimetresToRendererLength(geometry.mainTop.depth)
  const returnWidth = millimetresToRendererLength(geometry.returnTop.width)
  const returnDepth = millimetresToRendererLength(geometry.returnTop.depth)
  const side = geometry.returnSide === 'left' ? -1 : 1
  const overlap = Math.min(0.05, mainDepth / 4, returnDepth / 4)
  const naturalMain: DeskTop = {
    size: [mainWidth, top, mainDepth],
    position: [0, topY, 0],
  }
  const naturalReturn: DeskTop = {
    size: [returnWidth, top, returnDepth],
    position: [
      side * (mainWidth / 2 - returnWidth / 2),
      topY,
      mainDepth / 2 + returnDepth / 2 - overlap,
    ],
  }
  const bounds = horizontalBounds([naturalMain, naturalReturn])
  const naturalWidth = bounds.maxX - bounds.minX
  const naturalDepth = bounds.maxZ - bounds.minZ
  const scale = Math.min(1, width / naturalWidth, depth / naturalDepth)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const fit = (part: DeskTop): DeskTop => ({
    size: [part.size[0] * scale, part.size[1], part.size[2] * scale],
    position: [
      (part.position[0] - centerX) * scale,
      part.position[1],
      (part.position[2] - centerZ) * scale,
    ],
  })
  return {
    origin: [0, 0, 0] as RendererVector3,
    topY,
    main: fit(naturalMain),
    return: fit(naturalReturn),
    footprint: [naturalWidth * scale, naturalDepth * scale] as const,
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
