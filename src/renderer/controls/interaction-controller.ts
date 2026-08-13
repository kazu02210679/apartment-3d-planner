import { getCatalogDefinition, resolveCatalogInstance } from '../../catalog/catalog'
import type { EditorStore, EditorTool } from '../../app/editor-store'
import { degreesToRadians } from '../../domain/units'
import type { Dimensions, Entity, Transform } from '../../domain/schema'
import { Euler, Vector3, type Object3D } from 'three'
import {
  rendererLengthToMillimetres,
  toRendererTransform,
  toSceneDimensions,
  toSceneTransform,
  type RendererTransform,
  type RendererVector3,
} from '../adapters'

function startResizeEvidencePhase(phase: string): number | null {
  if (typeof window === 'undefined') return null
  return (
    (
      window as typeof window & {
        __apartmentEvidenceProbe?: { startPhase: (name: string) => number | null }
      }
    ).__apartmentEvidenceProbe?.startPhase(phase) ?? null
  )
}

function endResizeEvidencePhase(token: number | null): void {
  if (typeof window === 'undefined') return
  ;(
    window as typeof window & {
      __apartmentEvidenceProbe?: { endPhase: (value: number | null) => void }
    }
  ).__apartmentEvidenceProbe?.endPhase(token)
}

export interface InteractionController {
  start(entityId: string, tool: EditorTool, target?: Object3D): boolean
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
  readonly draftDimensions: Dimensions
  readonly draftTransform: Transform
  readonly target: Object3D | undefined
  readonly targetScale: RendererVector3
  readonly translationSnap: number
  readonly rotationSnap: number
  readonly floorSnap: boolean
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

function setRendererVector(
  target: {
    x: number
    y: number
    z: number
    set?: (x: number, y: number, z: number) => unknown
  },
  value: RendererVector3,
): void {
  if (target.set) target.set(...value)
  else Object.assign(target, { x: value[0], y: value[1], z: value[2] })
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
    const position = { ...transform.position }
    const rotation = { ...transform.rotation }
    if (gesture.tool === 'move') {
      position.x = snap(position.x, gesture.translationSnap)
      position.y = snap(position.y, gesture.translationSnap)
      position.z = snap(position.z, gesture.translationSnap)
      const floorCenter = gesture.dimensions.height / 2
      if (gesture.floorSnap && position.y <= floorCenter) position.y = floorCenter
    }
    if (gesture.tool === 'rotate') {
      rotation.x = normalizeDegrees(snap(rotation.x, gesture.rotationSnap))
      rotation.y = normalizeDegrees(snap(rotation.y, gesture.rotationSnap))
      rotation.z = normalizeDegrees(snap(rotation.z, gesture.rotationSnap))
    }
    return { position, rotation }
  }

  return {
    get active() {
      return active !== undefined
    },
    start(entityId, tool, target) {
      const phase =
        tool === 'resize' ? startResizeEvidencePhase('resize-controller-start') : null
      try {
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
        const interactionTarget = target
          ? { target, onCancel: () => (active = undefined) }
          : { entityId, tool }
        if (!store.beginInteraction(`${tool} entity`, interactionTarget)) return false
        active = {
          entityId,
          tool,
          dimensions: resolvedDimensions(entity),
          transform: structuredClone(entity.transform),
          draftDimensions: resolvedDimensions(entity),
          draftTransform: structuredClone(entity.transform),
          target,
          targetScale: target
            ? [target.scale.x, target.scale.y, target.scale.z]
            : [1, 1, 1],
          translationSnap: snapshot.translationSnap,
          rotationSnap: snapshot.rotationSnap,
          floorSnap: snapshot.floorSnap,
        }
        return true
      } finally {
        endResizeEvidencePhase(phase)
      }
    },
    updateTransform(position, rotation) {
      if (!active || (active.tool !== 'move' && active.tool !== 'rotate')) return false
      const rendererTransform: RendererTransform = {
        position,
        rotation: rotation ?? toRendererTransform(active.transform).rotation,
      }
      const transform = snapTransform(toSceneTransform(rendererTransform), active)
      active = { ...active, draftTransform: transform }
      const rendererDraft = toRendererTransform(transform)
      if (active.target) {
        setRendererVector(active.target.position, rendererDraft.position)
        setRendererVector(active.target.rotation, rendererDraft.rotation)
      }
      return true
    },
    updateDimensions(dimensions) {
      if (!active || active.tool !== 'resize') return false
      const next = toSceneDimensions(dimensions)
      if (!validDimensions(next)) return false
      active = { ...active, draftDimensions: next }
      if (active.target) {
        setRendererVector(active.target.scale, [
          active.targetScale[0] * (next.width / active.dimensions.width),
          active.targetScale[1] * (next.height / active.dimensions.height),
          active.targetScale[2] * (next.depth / active.dimensions.depth),
        ])
      }
      return true
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
      const rendererTransform = toRendererTransform(transform)
      if (active.target) {
        setRendererVector(active.target.position, rendererTransform.position)
        setRendererVector(active.target.rotation, rendererTransform.rotation)
        setRendererVector(active.target.scale, [
          active.targetScale[0] * (dimensions.width / active.dimensions.width),
          active.targetScale[1] * (dimensions.height / active.dimensions.height),
          active.targetScale[2] * (dimensions.depth / active.dimensions.depth),
        ])
      }
      active = { ...active, draftTransform: transform, draftDimensions: dimensions }
      return true
    },
    commit() {
      const phase =
        active?.tool === 'resize'
          ? startResizeEvidencePhase('resize-controller-commit')
          : null
      try {
        if (!active) return false
        const gesture = active
        const updated =
          gesture.tool === 'resize'
            ? store.updateInteractionGeometry(
                gesture.entityId,
                gesture.draftTransform,
                gesture.draftDimensions,
              )
            : store.updateInteractionTransform(gesture.entityId, gesture.draftTransform)
        if (!updated) {
          store.cancelInteraction()
          active = undefined
          return false
        }
        if (gesture.tool === 'resize' && gesture.target)
          setRendererVector(gesture.target.scale, gesture.targetScale)
        const committed = store.commitInteraction()
        active = undefined
        return committed
      } finally {
        endResizeEvidencePhase(phase)
      }
    },
    cancel() {
      if (!active) return false
      const cancelled = store.cancelInteraction()
      active = undefined
      return cancelled
    },
  }
}
