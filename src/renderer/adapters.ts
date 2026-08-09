import type { Dimensions, Transform, Vector3 } from '../domain/schema'
import { degreesToRadians, radiansToDegrees } from '../domain/units'

export type RendererVector3 = readonly [number, number, number]

export interface RendererTransform {
  readonly position: RendererVector3
  readonly rotation: RendererVector3
}

const METRES_PER_MILLIMETRE = 0.001
const RENDERER_PRECISION = 8
const PERSISTED_PRECISION = 3

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function millimetresToRendererLength(millimetres: number): number {
  return round(millimetres * METRES_PER_MILLIMETRE, RENDERER_PRECISION)
}

export function rendererLengthToMillimetres(rendererLength: number): number {
  return round(rendererLength / METRES_PER_MILLIMETRE, PERSISTED_PRECISION)
}

function toRendererVector(vector: Vector3): RendererVector3 {
  return [
    millimetresToRendererLength(vector.x),
    millimetresToRendererLength(vector.y),
    millimetresToRendererLength(vector.z),
  ]
}

function toPersistedVector(vector: RendererVector3): Vector3 {
  return {
    x: rendererLengthToMillimetres(vector[0]),
    y: rendererLengthToMillimetres(vector[1]),
    z: rendererLengthToMillimetres(vector[2]),
  }
}

export function toRendererDimensions(dimensions: Dimensions): RendererVector3 {
  return [
    millimetresToRendererLength(dimensions.width),
    millimetresToRendererLength(dimensions.height),
    millimetresToRendererLength(dimensions.depth),
  ]
}

export function toSceneDimensions(dimensions: RendererVector3): Dimensions {
  return {
    width: rendererLengthToMillimetres(dimensions[0]),
    depth: rendererLengthToMillimetres(dimensions[2]),
    height: rendererLengthToMillimetres(dimensions[1]),
  }
}

export function toRendererTransform(transform: Transform): RendererTransform {
  return {
    position: toRendererVector(transform.position),
    rotation: [
      round(degreesToRadians(transform.rotation.x), RENDERER_PRECISION),
      round(degreesToRadians(transform.rotation.y), RENDERER_PRECISION),
      round(degreesToRadians(transform.rotation.z), RENDERER_PRECISION),
    ],
  }
}

export function toSceneTransform(transform: RendererTransform): Transform {
  return {
    position: toPersistedVector(transform.position),
    rotation: {
      x: round(radiansToDegrees(transform.rotation[0]), PERSISTED_PRECISION),
      y: round(radiansToDegrees(transform.rotation[1]), PERSISTED_PRECISION),
      z: round(radiansToDegrees(transform.rotation[2]), PERSISTED_PRECISION),
    },
  }
}
