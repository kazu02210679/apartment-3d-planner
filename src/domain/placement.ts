import { resolveCatalogInstance } from '../catalog/catalog'
import type {
  PlacementProfile,
  PlacementTargetClass,
  SupportSurfaceDefinition,
} from '../catalog/types'
import {
  getWorldTransform,
  inverseTransformPoint,
  localTransformForWorld,
  transformPoint,
  type Matrix3,
} from '../commands/math'
import type { Entity, SceneDocument, Transform, Vector3 } from './schema'

export type PlacementAction = 'nearest' | 'floor' | 'in-bounds'

export interface PlacementRequest {
  readonly entityId: string
  readonly kind: PlacementAction
}

export interface PlacementTarget {
  readonly kind: PlacementTargetClass
  readonly hostEntityId?: string
  readonly surfaceId?: string
}

export interface PlacementSolution {
  readonly status: 'changed' | 'noop' | 'unavailable'
  readonly transform?: Transform
  readonly worldDelta?: Vector3
  readonly target?: PlacementTarget
  readonly reason?: string
}

const EPSILON = 0.001
const SUPPORT_NORMAL_COSINE = Math.cos((5 * Math.PI) / 180)
const SEARCH_STEP = 100

interface Bounds {
  min: Vector3
  max: Vector3
}

interface SupportTarget {
  readonly target: PlacementTarget
  readonly host: Entity
  readonly surface: SupportSurfaceDefinition
  readonly hostPosition: Vector3
  readonly hostRotation: Matrix3
  readonly worldCenter: Vector3
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }
}

function distanceSquared(value: Vector3): number {
  return value.x * value.x + value.y * value.y + value.z * value.z
}

function descendants(scene: SceneDocument, rootId: string): Set<string> {
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const entity of scene.entities) {
      if (entity.parentId !== null && result.has(entity.parentId) && !result.has(entity.id)) {
        result.add(entity.id)
        changed = true
      }
    }
  }
  return result
}

function hasDisabledAncestor(scene: SceneDocument, entity: Entity): boolean {
  const byId = new Map(scene.entities.map((candidate) => [candidate.id, candidate]))
  const visited = new Set<string>()
  let parentId = entity.parentId
  while (parentId !== null) {
    if (visited.has(parentId)) return true
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) return true
    if (!parent.visible || parent.locked) return true
    parentId = parent.parentId
  }
  return false
}

export function isPlacementEntityEligible(scene: SceneDocument, entityId: string): boolean {
  const entity = scene.entities.find((candidate) => candidate.id === entityId)
  return Boolean(entity && entity.visible && !entity.locked && !hasDisabledAncestor(scene, entity))
}

function halfExtents(entity: Entity, rotation: Matrix3): Vector3 {
  const halfWidth = entity.dimensions.width / 2
  const halfHeight = entity.dimensions.height / 2
  const halfDepth = entity.dimensions.depth / 2
  return {
    x: Math.abs(rotation[0]) * halfWidth + Math.abs(rotation[1]) * halfHeight + Math.abs(rotation[2]) * halfDepth,
    y: Math.abs(rotation[3]) * halfWidth + Math.abs(rotation[4]) * halfHeight + Math.abs(rotation[5]) * halfDepth,
    z: Math.abs(rotation[6]) * halfWidth + Math.abs(rotation[7]) * halfHeight + Math.abs(rotation[8]) * halfDepth,
  }
}

function boundsFor(entity: Entity, entities: readonly Entity[], delta: Vector3 = { x: 0, y: 0, z: 0 }): Bounds {
  const world = getWorldTransform(entity.id, entities)
  const half = halfExtents(entity, world.rotation)
  const center = add(world.position, delta)
  return {
    min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
    max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
  }
}

function unionBounds(current: Bounds | undefined, next: Bounds): Bounds {
  if (!current) return { min: { ...next.min }, max: { ...next.max } }
  return {
    min: {
      x: Math.min(current.min.x, next.min.x),
      y: Math.min(current.min.y, next.min.y),
      z: Math.min(current.min.z, next.min.z),
    },
    max: {
      x: Math.max(current.max.x, next.max.x),
      y: Math.max(current.max.y, next.max.y),
      z: Math.max(current.max.z, next.max.z),
    },
  }
}

function subtreeBounds(
  scene: SceneDocument,
  subtree: ReadonlySet<string>,
  delta: Vector3 = { x: 0, y: 0, z: 0 },
): Bounds {
  let result: Bounds | undefined
  for (const entity of scene.entities) {
    if (!subtree.has(entity.id)) continue
    result = unionBounds(result, boundsFor(entity, scene.entities, delta))
  }
  if (!result) throw new Error('Placement subtree is empty.')
  return result
}

function intersects(left: Bounds, right: Bounds): boolean {
  return (
    Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x) > EPSILON &&
    Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y) > EPSILON &&
    Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z) > EPSILON
  )
}

function penetrationDepth(left: Bounds, right: Bounds): number {
  const overlapX = Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x)
  const overlapY = Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y)
  const overlapZ = Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z)
  return overlapX > EPSILON && overlapY > EPSILON && overlapZ > EPSILON
    ? Math.min(overlapX, overlapY, overlapZ)
    : 0
}

function roomContains(bounds: Bounds, scene: SceneDocument): boolean {
  return (
    bounds.min.x >= -scene.room.width / 2 - EPSILON &&
    bounds.max.x <= scene.room.width / 2 + EPSILON &&
    bounds.min.y >= -EPSILON &&
    bounds.max.y <= scene.room.height + EPSILON &&
    bounds.min.z >= -scene.room.depth / 2 - EPSILON &&
    bounds.max.z <= scene.room.depth / 2 + EPSILON
  )
}

function resolvedPlacement(entity: Entity): PlacementProfile {
  if (!entity.catalog) {
    return {
      contactPlane: 'bottom',
      allowedTargetClasses: ['floor'] as const,
      preferredTargetClass: 'floor' as const,
      supportSurfaces: [] as readonly SupportSurfaceDefinition[],
    }
  }
  try {
    return resolveCatalogInstance(entity).placement
  } catch {
    return {
      contactPlane: 'bottom',
      allowedTargetClasses: ['floor'] as const,
      preferredTargetClass: 'floor' as const,
      supportSurfaces: [] as readonly SupportSurfaceDefinition[],
    }
  }
}

function supportTargets(scene: SceneDocument, subtree: ReadonlySet<string>): SupportTarget[] {
  const targets: SupportTarget[] = []
  for (const host of scene.entities) {
    if (subtree.has(host.id) || !host.visible) continue
    const placement = resolvedPlacement(host)
    if (!placement.allowedTargetClasses.includes('support-surface')) continue
    let hostWorld
    try {
      hostWorld = getWorldTransform(host.id, scene.entities)
    } catch {
      continue
    }
    const normalY = hostWorld.rotation[4]
    if (normalY < SUPPORT_NORMAL_COSINE) continue
    for (const surface of placement.supportSurfaces) {
      const center = add(hostWorld.position, transformPoint(hostWorld.rotation, surface.center))
      targets.push({
        target: { kind: 'support-surface', hostEntityId: host.id, surfaceId: surface.id },
        host,
        surface,
        hostPosition: hostWorld.position,
        hostRotation: hostWorld.rotation,
        worldCenter: center,
      })
    }
  }
  return targets
}

function withinSupportRectangle(
  bounds: Bounds,
  target: SupportTarget,
): boolean {
  const localCorners = [
    { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
  ].map((corner) =>
    inverseTransformPoint(target.hostRotation, subtract(corner, target.hostPosition)),
  )
  const halfWidth = target.surface.width / 2
  const halfDepth = target.surface.depth / 2
  return localCorners.every(
    (corner) =>
      corner.x >= target.surface.center.x - halfWidth - EPSILON &&
      corner.x <= target.surface.center.x + halfWidth + EPSILON &&
      corner.z >= target.surface.center.z - halfDepth - EPSILON &&
      corner.z <= target.surface.center.z + halfDepth + EPSILON &&
      corner.y >= target.surface.center.y - EPSILON &&
      (target.surface.usableClearanceHeight === undefined ||
        corner.y <= target.surface.center.y + target.surface.usableClearanceHeight + EPSILON),
  )
}

function collisionFree(
  scene: SceneDocument,
  subtree: ReadonlySet<string>,
  bounds: Bounds,
  hostEntityId?: string,
): boolean {
  for (const entity of scene.entities) {
    if (subtree.has(entity.id) || entity.id === hostEntityId) continue
    try {
      if (intersects(bounds, boundsFor(entity, scene.entities))) return false
    } catch {
      return false
    }
  }
  return true
}

function collisionNotWorse(
  scene: SceneDocument,
  subtree: ReadonlySet<string>,
  bounds: Bounds,
  baseline: Bounds,
  hostEntityId?: string,
): boolean {
  for (const entity of scene.entities) {
    if (subtree.has(entity.id) || entity.id === hostEntityId) continue
    try {
      const candidatePenetration = penetrationDepth(bounds, boundsFor(entity, scene.entities))
      const baselinePenetration = penetrationDepth(baseline, boundsFor(entity, scene.entities))
      if (candidatePenetration > baselinePenetration + EPSILON) return false
    } catch {
      return false
    }
  }
  return true
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function axisCandidates(min: number, max: number, preferred: number): number[] {
  if (min > max) return []
  const values = new Set<number>([min, max, clamp(preferred, min, max), 0])
  for (let value = Math.ceil(min / SEARCH_STEP) * SEARCH_STEP; value <= max; value += SEARCH_STEP) {
    values.add(value)
    if (values.size > 512) break
  }
  return [...values].sort((left, right) => left - right)
}

function candidateRootPositions(
  scene: SceneDocument,
  subtree: ReadonlySet<string>,
  rootWorld: Vector3,
  target: SupportTarget | undefined,
): Vector3[] {
  if (!target || target.target.kind === 'floor') {
    const current = subtreeBounds(scene, subtree)
    const width = current.max.x - current.min.x
    const depth = current.max.z - current.min.z
    const xs = axisCandidates(-scene.room.width / 2 + width / 2, scene.room.width / 2 - width / 2, rootWorld.x)
    const zs = axisCandidates(-scene.room.depth / 2 + depth / 2, scene.room.depth / 2 - depth / 2, rootWorld.z)
    return xs.flatMap((x) => zs.map((z) => ({ x, y: rootWorld.y, z })))
  }
  const localRoot = inverseTransformPoint(target.hostRotation, subtract(rootWorld, target.hostPosition))
  const halfWidth = target.surface.width / 2
  const halfDepth = target.surface.depth / 2
  const xs = [
    clamp(localRoot.x, target.surface.center.x - halfWidth, target.surface.center.x + halfWidth),
    target.surface.center.x,
    target.surface.center.x - halfWidth,
    target.surface.center.x + halfWidth,
  ]
  const zs = [
    clamp(localRoot.z, target.surface.center.z - halfDepth, target.surface.center.z + halfDepth),
    target.surface.center.z,
    target.surface.center.z - halfDepth,
    target.surface.center.z + halfDepth,
  ]
  return [...new Set(xs.flatMap((x) => zs.map((z) => ({ x, z })) as Array<{ x: number; z: number }>))].map(
    (point) => add(target.hostPosition, transformPoint(target.hostRotation, { x: point.x, y: 0, z: point.z })),
  ).map((point) => ({ x: point.x, y: rootWorld.y, z: point.z }))
}

function evaluate(
  scene: SceneDocument,
  subtree: ReadonlySet<string>,
  root: Entity,
  rootWorld: ReturnType<typeof getWorldTransform>,
  target: SupportTarget | undefined,
  rootPosition: Vector3,
  alignToSurface: boolean,
  preserveExistingPenetration = false,
): PlacementSolution | undefined {
  const initialBounds = subtreeBounds(scene, subtree)
  const deltaWithoutY = {
    x: rootPosition.x - rootWorld.position.x,
    y: 0,
    z: rootPosition.z - rootWorld.position.z,
  }
  const targetY = target?.worldCenter.y ?? 0
  const yDelta = alignToSurface
    ? targetY - initialBounds.min.y
    : Math.max(0, -initialBounds.min.y)
  const delta = { ...deltaWithoutY, y: yDelta }
  const bounds = subtreeBounds(scene, subtree, delta)
  if (!roomContains(bounds, scene)) return undefined
  if (target && !withinSupportRectangle(bounds, target)) return undefined
  if (
    preserveExistingPenetration
      ? !collisionNotWorse(scene, subtree, bounds, initialBounds, target?.host.id)
      : !collisionFree(scene, subtree, bounds, target?.host.id)
  )
    return undefined
  const parent =
    root.parentId === null ? undefined : getWorldTransform(root.parentId, scene.entities)
  const local = localTransformForWorld(
    { position: add(rootWorld.position, delta), rotation: rootWorld.rotation },
    parent,
  )
  const transform: Transform = {
    position: local.position,
    rotation: { ...root.transform.rotation },
  }
  return {
    status: distanceSquared(delta) <= EPSILON * EPSILON ? 'noop' : 'changed',
    transform,
    worldDelta: delta,
    target: target?.target ?? { kind: 'floor' },
  }
}

function compareSolutions(left: PlacementSolution, right: PlacementSolution): number {
  const leftDelta = distanceSquared(left.worldDelta ?? { x: 0, y: 0, z: 0 })
  const rightDelta = distanceSquared(right.worldDelta ?? { x: 0, y: 0, z: 0 })
  if (Math.abs(leftDelta - rightDelta) > EPSILON) return leftDelta - rightDelta
  const leftVertical = Math.abs(left.worldDelta?.y ?? 0)
  const rightVertical = Math.abs(right.worldDelta?.y ?? 0)
  if (Math.abs(leftVertical - rightVertical) > EPSILON) return leftVertical - rightVertical
  const leftHost = left.target?.hostEntityId ?? ''
  const rightHost = right.target?.hostEntityId ?? ''
  if (leftHost !== rightHost) return leftHost.localeCompare(rightHost)
  return (left.target?.surfaceId ?? '').localeCompare(right.target?.surfaceId ?? '')
}

function solveForTargets(
  scene: SceneDocument,
  root: Entity,
  subtree: ReadonlySet<string>,
  rootWorld: ReturnType<typeof getWorldTransform>,
  targets: readonly SupportTarget[],
  alignToSurface: boolean,
  preserveExistingPenetration = false,
): PlacementSolution | undefined {
  const solutions: PlacementSolution[] = []
  for (const target of targets) {
    for (const rootPosition of candidateRootPositions(scene, subtree, rootWorld.position, target)) {
      const solution = evaluate(
        scene,
        subtree,
        root,
        rootWorld,
        target,
        rootPosition,
        alignToSurface,
        preserveExistingPenetration,
      )
      if (solution) solutions.push(solution)
    }
  }
  return solutions.sort(compareSolutions)[0]
}

export function solvePlacement(scene: SceneDocument, request: PlacementRequest): PlacementSolution {
  if (!isPlacementEntityEligible(scene, request.entityId)) {
    return { status: 'unavailable', reason: '選択対象は配置補正できません。' }
  }
  const root = scene.entities.find((entity) => entity.id === request.entityId)
  if (!root) return { status: 'unavailable', reason: '配置対象が見つかりません。' }
  const subtree = descendants(scene, root.id)
  let rootWorld
  try {
    rootWorld = getWorldTransform(root.id, scene.entities)
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : '階層を解決できません。' }
  }
  const placement = resolvedPlacement(root)
  const floorTarget = (): SupportTarget => ({
    target: { kind: 'floor' },
    host: root,
    surface: {
      id: 'floor',
      center: { x: 0, y: 0, z: 0 },
      width: scene.room.width,
      depth: scene.room.depth,
    },
    hostPosition: { x: 0, y: 0, z: 0 },
    hostRotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    worldCenter: { x: 0, y: 0, z: 0 },
  })
  if (request.kind === 'in-bounds') {
    const solution = solveForTargets(
      scene,
      root,
      subtree,
      rootWorld,
      [floorTarget()],
      false,
      true,
    )
    return solution ?? { status: 'unavailable', reason: '範囲内へ戻す余地がありません。' }
  }
  if (request.kind === 'floor') {
    const solution = solveForTargets(scene, root, subtree, rootWorld, [floorTarget()], true)
    return solution ?? { status: 'unavailable', reason: '床へ配置できる空きがありません。' }
  }
  const support = supportTargets(scene, subtree)
  const preferred = placement.preferredTargetClass
  const allowed = placement.allowedTargetClasses
  const classTargets = (kind: PlacementTargetClass) =>
    kind === 'support-surface'
      ? support
      : [floorTarget()]
  const preferredSolution = allowed.includes(preferred)
    ? solveForTargets(scene, root, subtree, rootWorld, classTargets(preferred), true)
    : undefined
  if (preferredSolution) return preferredSolution
  const fallbackClass = preferred === 'floor' ? 'support-surface' : 'floor'
  if (!allowed.includes(fallbackClass)) return { status: 'unavailable', reason: '有効な支持面がありません。' }
  return (
    solveForTargets(scene, root, subtree, rootWorld, classTargets(fallbackClass), true) ??
    { status: 'unavailable', reason: '有効な配置候補がありません。' }
  )
}
