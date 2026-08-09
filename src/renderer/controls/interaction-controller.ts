import { getCatalogDefinition, resolveCatalogInstance } from '../../catalog/catalog'
import type { EditorStore, EditorTool } from '../../app/editor-store'
import { degreesToRadians } from '../../domain/units'
import type { Dimensions, Entity, Transform } from '../../domain/schema'
import { Euler, Vector3 } from 'three'
import {
  rendererLengthToMillimetres,
  toRendererTransform,
  toSceneDimensions,
  toSceneTransform,
  type RendererTransform,
  type RendererVector3,
} from '../adapters'

export interface InteractionController {
  start(entityId: string, tool: EditorTool): boolean
  updateTransform(position: RendererVector3, rotation?: RendererVector3): boolean
  updateDimensions(dimensions: RendererVector3): boolean
  resizeByLocalDelta(axis: 0 | 1 | 2, rendererDelta: number): boolean
  commit(): boolean
  cancel(): boolean
  get active(): boolean
}

interface ActiveGesture {
  readonly entityId: string
  readonly tool: EditorTool
  readonly dimensions: Dimensions
  readonly transform: Transform
}

function snap(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

function stableNumber(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : value
}

function resolvedDimensions(entity: Entity): Dimensions {
  if (!entity.catalog) return entity.dimensions
  try {
    return resolveCatalogInstance(entity).dimensions
  } catch {
    return entity.dimensions
  }
}

function validDimensions(dimensions: Dimensions): boolean {
  return Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0)
}

function canResize(entity: Entity): boolean {
  return (
    validDimensions(resolvedDimensions(entity)) &&
    (!entity.catalog ||
      getCatalogDefinition(entity.catalog.itemId)?.dimensionPolicy.mode !== 'fixed')
  )
}

/**
 * Pure editor/renderer boundary: it owns transient gesture validation and converts
 * renderer metres/radians to document millimetres/degrees before touching the store.
 */
export function createInteractionController(store: EditorStore): InteractionController {
  let active: ActiveGesture | undefined

  const currentEntity = (id: string) =>
    store.getSnapshot().scene.entities.find((entity) => entity.id === id)

  const snapTransform = (transform: Transform, gesture: ActiveGesture): Transform => {
    const snapshot = store.getSnapshot()
    const position = { ...transform.position }
    const rotation = { ...transform.rotation }
    if (gesture.tool === 'move') {
      position.x = snap(position.x, snapshot.translationSnap)
      position.y = snap(position.y, snapshot.translationSnap)
      position.z = snap(position.z, snapshot.translationSnap)
      const floorCenter = gesture.dimensions.height / 2
      if (snapshot.floorSnap && position.y <= floorCenter) position.y = floorCenter
    }
    if (gesture.tool === 'rotate') {
      rotation.x = normalizeDegrees(snap(rotation.x, snapshot.rotationSnap))
      rotation.y = normalizeDegrees(snap(rotation.y, snapshot.rotationSnap))
      rotation.z = normalizeDegrees(snap(rotation.z, snapshot.rotationSnap))
    }
    return { position, rotation }
  }

  return {
    get active() {
      return active !== undefined
    },
    start(entityId, tool) {
      const snapshot = store.getSnapshot()
      const entity = currentEntity(entityId)
      if (
        active ||
        snapshot.mode !== 'edit' ||
        !entity ||
        entity.locked ||
        !entity.visible ||
        (tool === 'resize' && !canResize(entity))
      )
        return false
      if (!store.beginInteraction(`${tool} entity`, { entityId, tool })) return false
      active = {
        entityId,
        tool,
        dimensions: resolvedDimensions(entity),
        transform: structuredClone(entity.transform),
      }
      return true
    },
    updateTransform(position, rotation) {
      if (!active || (active.tool !== 'move' && active.tool !== 'rotate')) return false
      const entity = currentEntity(active.entityId)
      if (!entity) return false
      const rendererTransform: RendererTransform = {
        position,
        rotation: rotation ?? toRendererTransform(entity.transform).rotation,
      }
      return store.updateInteractionTransform(
        active.entityId,
        snapTransform(toSceneTransform(rendererTransform), active),
      )
    },
    updateDimensions(dimensions) {
      if (!active || active.tool !== 'resize') return false
      const next = toSceneDimensions(dimensions)
      if (!validDimensions(next)) return false
      return store.updateInteractionDimensions(active.entityId, next)
    },
    resizeByLocalDelta(axis, rendererDelta) {
      if (!active || active.tool !== 'resize' || !Number.isFinite(rendererDelta))
        return false
      const delta = rendererLengthToMillimetres(rendererDelta)
      const axisName = axis === 0 ? 'width' : axis === 1 ? 'height' : 'depth'
      const dimensions = {
        ...active.dimensions,
        [axisName]: active.dimensions[axisName] + delta,
      }
      if (!validDimensions(dimensions)) return false
      const localShift = new Vector3(
        axis === 0 ? delta / 2 : 0,
        axis === 1 ? delta / 2 : 0,
        axis === 2 ? delta / 2 : 0,
      ).applyEuler(
        new Euler(
          degreesToRadians(active.transform.rotation.x),
          degreesToRadians(active.transform.rotation.y),
          degreesToRadians(active.transform.rotation.z),
        ),
      )
      const transform: Transform = {
        ...active.transform,
        position: {
          x: stableNumber(active.transform.position.x + localShift.x),
          y: stableNumber(active.transform.position.y + localShift.y),
          z: stableNumber(active.transform.position.z + localShift.z),
        },
      }
      if (!store.updateInteractionDimensions(active.entityId, dimensions)) return false
      return store.updateInteractionTransform(active.entityId, transform)
    },
    commit() {
      if (!active) return false
      const committed = store.commitInteraction()
      active = undefined
      return committed
    },
    cancel() {
      if (!active) return false
      const cancelled = store.cancelInteraction()
      active = undefined
      return cancelled
    },
  }
}
