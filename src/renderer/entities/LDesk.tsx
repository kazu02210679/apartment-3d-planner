import type { GeometryDescriptor } from '../../catalog/types'
import { millimetresToRendererLength, type RendererVector3 } from '../adapters'
import {
  BoxPart,
  BoundsOutline,
  CylinderPart,
  ModelBoundsProvider,
  type ModelProps,
} from './ModelPrimitives'

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
    }
  const mainWidth = Math.min(width, millimetresToRendererLength(geometry.mainTop.width))
  const mainDepth = Math.min(depth, millimetresToRendererLength(geometry.mainTop.depth))
  const returnWidth = Math.min(
    width,
    millimetresToRendererLength(geometry.returnTop.width),
  )
  const returnDepth = Math.min(
    depth,
    millimetresToRendererLength(geometry.returnTop.depth),
  )
  const side = geometry.returnSide === 'left' ? -1 : 1
  return {
    origin: [0, 0, 0] as RendererVector3,
    topY,
    main: {
      size: [mainWidth, top, mainDepth] as RendererVector3,
      position: [0, topY, -depth / 2 + mainDepth / 2] as RendererVector3,
    },
    return: {
      size: [returnWidth, top, returnDepth] as RendererVector3,
      position: [
        side * (width / 2 - returnWidth / 2),
        topY,
        -depth / 2 + mainDepth + returnDepth / 2 - 0.05,
      ] as RendererVector3,
    },
  }
}

export function LDesk({
  dimensions,
  material,
  outlineColor,
  geometry,
}: ModelProps & { readonly geometry?: GeometryDescriptor }) {
  const [width, height, depth] = dimensions
  const layout = resolveDeskLayout(dimensions, geometry)
  const top = layout.main.size[1]
  const leg = Math.min(0.055, width * 0.05, depth * 0.08)
  const topY = layout.topY
  const legY = -top / 2
  return (
    <group name="detailed-l-desk">
      <ModelBoundsProvider dimensions={dimensions}>
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
              height={Math.max(0.04, height - top)}
              position={[x * (width / 2 - leg), legY, z * (depth / 2 - leg)]}
              material={material}
              color="#263547"
            />
          ))}
        <BoxPart
          size={[
            width * 0.45,
            Math.min(0.04, height * 0.08),
            Math.min(0.1, depth * 0.18),
          ]}
          position={[0, topY - top * 1.6, depth * 0.18]}
          material={material}
          color="#1b2737"
        />
        <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
      </ModelBoundsProvider>
    </group>
  )
}
