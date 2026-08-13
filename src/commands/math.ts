import type { Entity, Transform, Vector3 } from '../domain/schema'
import { degreesToRadians, radiansToDegrees } from '../domain/units'

export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export interface WorldTransform {
  readonly position: Vector3
  readonly rotation: Matrix3
}

export function rotationMatrix(rotation: Vector3): Matrix3 {
  const x = degreesToRadians(rotation.x)
  const y = degreesToRadians(rotation.y)
  const z = degreesToRadians(rotation.z)
  const a = Math.cos(x)
  const b = Math.sin(x)
  const c = Math.cos(y)
  const d = Math.sin(y)
  const e = Math.cos(z)
  const f = Math.sin(z)
  return [
    c * e,
    -c * f,
    d,
    a * f + b * e * d,
    a * e - b * f * d,
    -b * c,
    b * f - a * e * d,
    b * e + a * f * d,
    a * c,
  ]
}

export function multiplyMatrix(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ]
}

function transpose(matrix: Matrix3): Matrix3 {
  return [
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8],
  ]
}
export function transformPoint(matrix: Matrix3, point: Vector3): Vector3 {
  return {
    x: matrix[0] * point.x + matrix[1] * point.y + matrix[2] * point.z,
    y: matrix[3] * point.x + matrix[4] * point.y + matrix[5] * point.z,
    z: matrix[6] * point.x + matrix[7] * point.y + matrix[8] * point.z,
  }
}
export function inverseTransformPoint(matrix: Matrix3, point: Vector3): Vector3 {
  return transformPoint(transpose(matrix), point)
}
function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }
}
function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }
}

export function matrixToEuler(matrix: Matrix3): Vector3 {
  const y = Math.asin(Math.max(-1, Math.min(1, matrix[2])))
  const standard = Math.abs(matrix[2]) < 0.9999999
  const x =
    standard
      ? Math.atan2(-matrix[5], matrix[8])
      : Math.atan2(matrix[7], matrix[4])
  const z = standard ? Math.atan2(-matrix[1], matrix[0]) : 0
  return { x: radiansToDegrees(x), y: radiansToDegrees(y), z: radiansToDegrees(z) }
}

export function getWorldTransform(
  entityId: string,
  entities: readonly Entity[],
): WorldTransform {
  const byId = new Map(entities.map((entity) => [entity.id, entity]))
  const cache = new Map<string, WorldTransform>()
  const visit = (id: string, visiting = new Set<string>()): WorldTransform => {
    const cached = cache.get(id)
    if (cached) return cached
    if (visiting.has(id)) throw new Error(`Cannot calculate a cyclic hierarchy at ${id}.`)
    const entity = byId.get(id)
    if (!entity) throw new Error(`Entity ${id} is missing.`)
    visiting.add(id)
    const local = rotationMatrix(entity.transform.rotation)
    const world =
      entity.parentId === null
        ? { position: { ...entity.transform.position }, rotation: local }
        : (() => {
            const parent = visit(entity.parentId!, visiting)
            return {
              position: add(
                parent.position,
                transformPoint(parent.rotation, entity.transform.position),
              ),
              rotation: multiplyMatrix(parent.rotation, local),
            }
          })()
    visiting.delete(id)
    cache.set(id, world)
    return world
  }
  return visit(entityId)
}

export function localTransformForWorld(
  world: WorldTransform,
  parent: WorldTransform | undefined,
): Transform {
  if (!parent)
    return { position: { ...world.position }, rotation: matrixToEuler(world.rotation) }
  const inverse = transpose(parent.rotation)
  return {
    position: transformPoint(inverse, subtract(world.position, parent.position)),
    rotation: matrixToEuler(multiplyMatrix(inverse, world.rotation)),
  }
}
