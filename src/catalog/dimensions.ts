import type { Dimensions, Vector3 } from '../domain/schema'
import type { GeometryDescriptor } from './types'

export const MILLIMETRES_PER_INCH = 25.4

export function calculateSixteenByNinePanelDimensions(
  diagonalInches: number,
): Pick<Dimensions, 'width' | 'height'> {
  const diagonalMillimetres = diagonalInches * MILLIMETRES_PER_INCH
  const ratioLength = Math.sqrt(16 ** 2 + 9 ** 2)

  return {
    width: Math.round((diagonalMillimetres * 16) / ratioLength),
    height: Math.round((diagonalMillimetres * 9) / ratioLength),
  }
}

export interface DeskTopLayout {
  readonly size: Readonly<{ width: number; height: number; depth: number }>
  readonly position: Vector3
}

export interface ResolvedDeskLayout {
  readonly topY: number
  readonly main: DeskTopLayout
  readonly return?: DeskTopLayout
  readonly footprint: Readonly<{ width: number; depth: number }>
}

function horizontalBounds(parts: readonly DeskTopLayout[]) {
  const x = parts.flatMap((part) => [
    part.position.x - part.size.width / 2,
    part.position.x + part.size.width / 2,
  ])
  const z = parts.flatMap((part) => [
    part.position.z - part.size.depth / 2,
    part.position.z + part.size.depth / 2,
  ])
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minZ: Math.min(...z),
    maxZ: Math.max(...z),
  }
}

/** Resolves desk tops in millimetres for both renderer layout and placement support. */
export function resolveDeskLayoutGeometry(
  dimensions: Dimensions,
  geometry?: GeometryDescriptor,
): ResolvedDeskLayout {
  const top = Math.min(60, dimensions.height * 0.12)
  const topY = dimensions.height / 2 - top / 2
  if (geometry?.kind !== 'l-desk') {
    return {
      topY,
      main: {
        size: { width: dimensions.width, height: top, depth: dimensions.depth },
        position: { x: 0, y: topY, z: 0 },
      },
      footprint: { width: dimensions.width, depth: dimensions.depth },
    }
  }
  const side = geometry.returnSide === 'left' ? -1 : 1
  const overlap = Math.min(50, geometry.mainTop.depth / 4, geometry.returnTop.depth / 4)
  const naturalMain: DeskTopLayout = {
    size: { width: geometry.mainTop.width, height: top, depth: geometry.mainTop.depth },
    position: { x: 0, y: topY, z: 0 },
  }
  const naturalReturn: DeskTopLayout = {
    size: {
      width: geometry.returnTop.width,
      height: top,
      depth: geometry.returnTop.depth,
    },
    position: {
      x: side * (geometry.mainTop.width / 2 - geometry.returnTop.width / 2),
      y: topY,
      z: geometry.mainTop.depth / 2 + geometry.returnTop.depth / 2 - overlap,
    },
  }
  const bounds = horizontalBounds([naturalMain, naturalReturn])
  const naturalWidth = bounds.maxX - bounds.minX
  const naturalDepth = bounds.maxZ - bounds.minZ
  const scale = Math.min(
    1,
    dimensions.width / naturalWidth,
    dimensions.depth / naturalDepth,
  )
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const fit = (part: DeskTopLayout): DeskTopLayout => ({
    size: {
      width: part.size.width * scale,
      height: part.size.height,
      depth: part.size.depth * scale,
    },
    position: {
      x: (part.position.x - centerX) * scale,
      y: part.position.y,
      z: (part.position.z - centerZ) * scale,
    },
  })
  return {
    topY,
    main: fit(naturalMain),
    return: fit(naturalReturn),
    footprint: { width: naturalWidth * scale, depth: naturalDepth * scale },
  }
}
