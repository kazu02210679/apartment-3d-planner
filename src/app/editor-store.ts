import {
  createAutosaveCoordinator,
  type AutosaveCoordinator,
  type AutosaveOptions,
  type AutosaveStatus,
} from '../persistence/autosave'
import { exportScene } from '../persistence/export'
import { importScene } from '../persistence/import'
import { SceneStorage } from '../persistence/storage'
import {
  CATALOG_DEFINITIONS,
  resolveCatalogInstance,
  resetCatalogOverrides,
} from '../catalog/catalog'
import { createCommandStore, type SceneCommand } from '../commands/command-store'
import { sameScene } from '../commands/history'
import { findOutOfBoundsEntityIds } from '../domain/invariants'
import { isPlacementEntityEligible, type PlacementAction } from '../domain/placement'
import {
  classifyCableConnection,
  getCableEndAttachment,
  getCableRouting,
  isCableEnd,
  type CableRouting,
} from '../domain/connections'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { ROOM_PRESETS, type RoomPresetId } from '../domain/room-presets'
import type {
  Dimensions,
  Entity,
  JsonObject,
  SceneDocument,
  Transform,
  Vector3,
} from '../domain/schema'

export type EditorMode = 'edit' | 'preview'
export type LeftTab = 'catalog' | 'outliner'
export type MobilePanel = 'none' | 'catalog' | 'outliner' | 'inspector'
export type EditorTool = 'move' | 'rotate' | 'resize' | 'cable'
export interface CableDraft {
  readonly cableId: string
  readonly portId: string
}

export interface EditorSnapshot {
  readonly scene: SceneDocument
  readonly mode: EditorMode
  readonly selectedRoomId: string
  readonly selectedEntityId: string | null
  readonly primarySelectionId: string | null
  readonly selectedEntityIds: readonly string[]
  readonly outOfBoundsEntityIds: readonly string[]
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly interactionActive: boolean
  readonly saveStatus: ReturnType<AutosaveCoordinator['getStatus']>
  readonly activeLeftTab: LeftTab
  readonly mobilePanel: MobilePanel
  readonly activeTool: EditorTool
  readonly translationSnap: number
  readonly rotationSnap: number
  readonly floorSnap: boolean
  readonly cableDraft?: CableDraft
  readonly errorMessage?: string
}

export interface EditorStoreOptions {
  readonly initialScene?: SceneDocument
  readonly idFactory?: () => string
  readonly now?: () => string
  readonly storage?: SceneStorage
  readonly autosave?: AutosaveCoordinator
  readonly autosaveOptions?: AutosaveOptions
}

export interface EditorActions {
  selectRoom(): void
  selectEntity(entityId: string, additive?: boolean): void
  clearSelection(): void
  addCatalogItem(itemId: string): string | undefined
  renameEntity(entityId: string, name: string): boolean
  setVisibility(entityId: string, visible: boolean): boolean
  setLocked(entityId: string, locked: boolean): boolean
  duplicateEntity(entityId: string): string | undefined
  deleteEntity(entityId: string): boolean
  setTransform(entityId: string, transform: Transform): boolean
  setDimensions(entityId: string, dimensions: Dimensions): boolean
  setCatalogPreset(entityId: string, presetId: string | null): boolean
  setCatalogOverrides(entityId: string, overrides: JsonObject): boolean
  setCatalogCustomDimensions(entityId: string, dimensions: Dimensions): boolean
  placeEntity(entityId: string, placement: PlacementAction): boolean
  resetCatalogOverride(entityId: string, key?: string): boolean
  setMaterial(entityId: string, materialId: string): boolean
  setRoomPreset(presetId: RoomPresetId): boolean
  setRoomDimensions(dimensions: Dimensions): boolean
  groupEntities(entityIds: readonly string[], name?: string): string | undefined
  ungroupEntity(entityId: string): boolean
  undo(): boolean
  redo(): boolean
  setMode(mode: EditorMode): void
  setActiveTool(tool: EditorTool): void
  setTranslationSnap(millimetres: number): void
  setRotationSnap(degrees: number): void
  setFloorSnap(enabled: boolean): void
  beginCableDraft(cableId: string, portId: string): boolean
  cancelCableDraft(): void
  completeCableDraft(targetEntityId: string, targetPortId: string): boolean
  detachCableEnd(cableId: string, portId: string): boolean
  setCableRouting(entityId: string, routing: CableRouting): boolean
  addCableWaypoint(entityId: string): boolean
  updateCableWaypoint(entityId: string, waypointId: string, position: Vector3): boolean
  deleteCableWaypoint(entityId: string, waypointId: string): boolean
  beginCableWaypointInteraction(entityId: string, waypointId: string): boolean
  updateCableWaypointInteraction(
    entityId: string,
    waypointId: string,
    position: Vector3,
  ): boolean
  setCableEndPosition(entityId: string, portId: string, position: Vector3): boolean
  beginInteraction(label: string, target?: unknown): boolean
  updateInteractionTransform(entityId: string, transform: Transform): boolean
  updateInteractionDimensions(entityId: string, dimensions: Dimensions): boolean
  updateInteractionGeometry(
    entityId: string,
    transform: Transform,
    dimensions: Dimensions,
  ): boolean
  commitInteraction(): boolean
  cancelInteraction(): boolean
  setLeftTab(tab: LeftTab): void
  setMobilePanel(panel: MobilePanel): void
  exportJson(): string
  importJson(input: string | Uint8Array): boolean
  resetScene(): boolean
  saveNow(): void
}

export type EditorStore = EditorActions & {
  getSnapshot(): EditorSnapshot
  snapshot(): EditorSnapshot
  subscribe(listener: () => void): () => void
  dispose(): void
}

function defaultIdFactory(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

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

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

function validDimensions(dimensions: Dimensions): boolean {
  return Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0)
}

interface RendererDraftTarget {
  readonly position: { x: number; y: number; z: number }
  readonly rotation: { x: number; y: number; z: number; order?: string }
  readonly scale: { x: number; y: number; z: number }
}

interface RendererDraftState {
  readonly target: RendererDraftTarget
  readonly onCancel: () => void
  readonly initial: {
    readonly position: Vector3
    readonly rotation: Vector3
    readonly scale: Vector3
  }
}

function isRendererDraftRegistration(
  value: unknown,
): value is { readonly target: RendererDraftTarget; readonly onCancel: () => void } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    readonly target?: Partial<RendererDraftTarget>
    readonly onCancel?: unknown
  }
  const target = candidate.target
  return (
    typeof candidate.onCancel === 'function' &&
    [target?.position, target?.rotation, target?.scale].every(
      (vector) =>
        vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z),
    )
  )
}

function captureRendererDraft(
  target: RendererDraftTarget,
  onCancel: () => void,
): RendererDraftState {
  return {
    target,
    onCancel,
    initial: {
      position: { x: target.position.x, y: target.position.y, z: target.position.z },
      rotation: {
        x: target.rotation.x,
        y: target.rotation.y,
        z: target.rotation.z,
        ...(target.rotation.order === undefined ? {} : { order: target.rotation.order }),
      },
      scale: { x: target.scale.x, y: target.scale.y, z: target.scale.z },
    },
  }
}

function restoreRendererVector(
  target: {
    x: number
    y: number
    z: number
    set?: (x: number, y: number, z: number, order?: string) => unknown
  },
  value: { x: number; y: number; z: number; order?: string },
): void {
  if (target.set) {
    if (value.order !== undefined) target.set(value.x, value.y, value.z, value.order)
    else target.set(value.x, value.y, value.z)
  } else Object.assign(target, { x: value.x, y: value.y, z: value.z })
}

function restoreRendererDraft(draft: RendererDraftState | undefined): void {
  if (!draft) return
  restoreRendererVector(draft.target.position, draft.initial.position)
  restoreRendererVector(draft.target.rotation, draft.initial.rotation)
  restoreRendererVector(draft.target.scale, draft.initial.scale)
  draft.onCancel()
}

function dimensionsForEntity(dimensions: Dimensions): JsonObject {
  return { dimensions: clone(dimensions) as unknown as JsonObject }
}

function makeSnapshot(
  scene: SceneDocument,
  rest: Omit<EditorSnapshot, 'scene'>,
): EditorSnapshot {
  // CommandStore.scene is already an isolated clone; freezing that value avoids
  // cloning the complete scene a second time during interaction publication.
  const sceneCopy = freezeDeep(scene)
  const selectedEntityIds = Object.freeze([...rest.selectedEntityIds])
  const outOfBoundsEntityIds = Object.freeze([...rest.outOfBoundsEntityIds])
  const saveStatus = freezeDeep(clone(rest.saveStatus))
  const value = {
    ...rest,
    scene: sceneCopy,
    selectedEntityIds,
    outOfBoundsEntityIds,
    saveStatus,
  } as EditorSnapshot
  Object.defineProperty(value, 'scene', {
    enumerable: true,
    configurable: false,
    get: () => freezeDeep(clone(sceneCopy)),
  })
  Object.defineProperty(value, 'selectedEntityIds', {
    enumerable: true,
    configurable: false,
    get: () => Object.freeze([...selectedEntityIds]),
  })
  Object.defineProperty(value, 'outOfBoundsEntityIds', {
    enumerable: true,
    configurable: false,
    get: () => Object.freeze([...outOfBoundsEntityIds]),
  })
  Object.defineProperty(value, 'saveStatus', {
    enumerable: true,
    configurable: false,
    get: () => freezeDeep(clone(saveStatus)),
  })
  return Object.freeze(value)
}

export function createEditorStore(options: EditorStoreOptions = {}): EditorStore {
  const idFactory = options.idFactory ?? defaultIdFactory
  const initialScene =
    options.initialScene ??
    createFutureWorkstationScene({
      idFactory,
      now: options.now ?? (() => new Date().toISOString()),
    })
  let commandStore = createCommandStore(initialScene, { idFactory })
  let rendererDraft: RendererDraftState | undefined
  let resizeEvidenceInteraction = false
  let suppressAutosaveStatus = false
  let publishStatus: (status: AutosaveStatus) => void = () => undefined
  const autosave =
    options.autosave ??
    (options.storage
      ? createAutosaveCoordinator(options.storage, {
          ...options.autosaveOptions,
          onStatusChange: (status) => {
            try {
              options.autosaveOptions?.onStatusChange?.(status)
            } finally {
              if (!suppressAutosaveStatus) publishStatus(status)
            }
          },
        })
      : undefined)
  const listeners = new Set<() => void>()
  let deletedSelectionId: string | null = null
  let snapshot: EditorSnapshot = makeSnapshot(commandStore.scene, {
    mode: 'edit',
    selectedRoomId: commandStore.scene.room.id,
    selectedEntityId: null,
    primarySelectionId: null,
    selectedEntityIds: [],
    outOfBoundsEntityIds: findOutOfBoundsEntityIds(commandStore.scene),
    canUndo: false,
    canRedo: false,
    interactionActive: false,
    saveStatus: autosave?.getStatus() ?? { state: 'idle' },
    activeLeftTab: 'catalog',
    mobilePanel: 'none',
    activeTool: 'move',
    translationSnap: 10,
    rotationSnap: 15,
    floorSnap: true,
  })

  const publish = (errorMessage?: string, saveStatus?: AutosaveStatus) => {
    const scene = commandStore.scene
    const previousSnapshot = { ...snapshot }
    Reflect.deleteProperty(previousSnapshot, 'scene')
    const selectedEntityId =
      snapshot.selectedEntityId &&
      scene.entities.some((entity) => entity.id === snapshot.selectedEntityId)
        ? snapshot.selectedEntityId
        : null
    const selectedEntityIds = snapshot.selectedEntityIds.filter((id) =>
      scene.entities.some((entity) => entity.id === id),
    )
    snapshot = makeSnapshot(scene, {
      ...previousSnapshot,
      selectedRoomId: scene.room.id,
      selectedEntityId,
      primarySelectionId: selectedEntityId,
      selectedEntityIds: selectedEntityId
        ? selectedEntityIds.includes(selectedEntityId)
          ? selectedEntityIds
          : [selectedEntityId, ...selectedEntityIds]
        : [],
      outOfBoundsEntityIds: findOutOfBoundsEntityIds(scene),
      canUndo: commandStore.canUndo,
      canRedo: commandStore.canRedo,
      saveStatus: saveStatus ?? autosave?.getStatus() ?? snapshot.saveStatus,
      ...(errorMessage === undefined ? {} : { errorMessage }),
    })
    listeners.forEach((listener) => listener())
  }
  publishStatus = (status) => publish(undefined, status)

  const discardInteraction = (): boolean => {
    if (!commandStore.activeInteraction) return false
    commandStore.cancelInteraction()
    restoreRendererDraft(rendererDraft)
    rendererDraft = undefined
    snapshot = { ...snapshot, interactionActive: false }
    return true
  }

  const sceneAction = (
    command: SceneCommand,
    afterExecute?: (scene: SceneDocument) => void,
  ): boolean => {
    discardInteraction()
    const before = commandStore.scene
    try {
      commandStore.execute(command)
    } catch (error) {
      publish(error instanceof Error ? error.message : '編集を適用できませんでした。')
      return false
    }
    const changed = !sameScene(before, commandStore.scene)
    if (changed) {
      suppressAutosaveStatus = true
      try {
        autosave?.schedule(commandStore.scene)
      } finally {
        suppressAutosaveStatus = false
      }
    }
    afterExecute?.(commandStore.scene)
    publish()
    return changed
  }

  const interactionAction = (command: SceneCommand): boolean => {
    try {
      commandStore.updateInteraction(command)
      publish()
      return true
    } catch (error) {
      publish(
        error instanceof Error ? error.message : 'Unable to update the interaction.',
      )
      return false
    }
  }

  const catalogCustomDimensionsCommand = (
    entity: Entity,
    dimensions: Dimensions,
  ): SceneCommand | undefined => {
    if (!entity.catalog || !validDimensions(dimensions)) return undefined
    const catalog = { ...entity.catalog }
    delete catalog.presetId
    const definition = CATALOG_DEFINITIONS.find(
      (candidate) => candidate.id === entity.catalog?.itemId,
    )
    const existingGeometry =
      entity.overrides.geometry &&
      typeof entity.overrides.geometry === 'object' &&
      !Array.isArray(entity.overrides.geometry)
        ? (entity.overrides.geometry as JsonObject)
        : {}
    let overrides: JsonObject = {
      ...clone(entity.overrides),
      dimensions: clone(dimensions) as unknown as JsonObject,
    }
    if (
      definition?.id === 'display.monitor' &&
      definition.geometry.kind === 'panel-with-stand'
    ) {
      const standAllowance =
        definition.defaultDimensions.height - definition.geometry.panel.height
      const panelHeight = dimensions.height - standAllowance
      const existingPanel =
        existingGeometry.panel &&
        typeof existingGeometry.panel === 'object' &&
        !Array.isArray(existingGeometry.panel)
          ? (existingGeometry.panel as JsonObject)
          : {}
      overrides = {
        ...overrides,
        geometry: {
          ...existingGeometry,
          panel: { ...existingPanel, width: dimensions.width, height: panelHeight },
        },
      }
    }
    return { type: 'set-catalog', entityId: entity.id, catalog, overrides }
  }

  const catalogCustomGeometryCommand = (
    entity: Entity,
    transform: Transform,
    dimensions: Dimensions,
  ): SceneCommand | undefined => {
    if (!validDimensions(dimensions)) return undefined
    if (!entity.catalog)
      return {
        type: 'set-entity-geometry',
        entityId: entity.id,
        transform: clone(transform),
        dimensions: clone(dimensions),
      }
    const custom = catalogCustomDimensionsCommand(entity, dimensions)
    if (!custom || custom.type !== 'set-catalog' || !custom.catalog) return undefined
    return {
      type: 'set-entity-geometry',
      entityId: entity.id,
      transform: clone(transform),
      dimensions: clone(dimensions),
      catalog: custom.catalog,
      overrides: custom.overrides,
    }
  }

  const cableEnd = (scene: SceneDocument, cableId: string, portId: string) => {
    const cable = scene.entities.find((entity) => entity.id === cableId)
    const endpoint = { entityId: cableId, portId }
    return cable?.catalog?.itemId === 'cable.generic' && isCableEnd(scene, endpoint)
      ? cable
      : undefined
  }
  const nextPersistentId = () => {
    const used = new Set([
      ...commandStore.scene.entities.map((entity) => entity.id),
      ...commandStore.scene.entities.flatMap((entity) =>
        entity.ports.map((port) => port.id),
      ),
      ...commandStore.scene.connections.map((connection) => connection.id),
    ])
    let id = idFactory()
    while (used.has(id)) id = idFactory()
    return id
  }

  const replaceScene = (scene: SceneDocument, save = true): boolean => {
    discardInteraction()
    commandStore = createCommandStore(scene, { idFactory })
    snapshot = {
      ...snapshot,
      selectedEntityId: null,
      primarySelectionId: null,
      selectedEntityIds: [],
      cableDraft: undefined,
      interactionActive: false,
      errorMessage: undefined,
    }
    if (save) {
      suppressAutosaveStatus = true
      try {
        autosave?.schedule(scene)
      } finally {
        suppressAutosaveStatus = false
      }
    }
    publish()
    return true
  }

  const store: EditorStore = {
    getSnapshot: () => snapshot,
    snapshot: () => clone(snapshot),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    selectRoom() {
      discardInteraction()
      deletedSelectionId = null
      snapshot = {
        ...snapshot,
        selectedEntityId: null,
        primarySelectionId: null,
        selectedEntityIds: [],
        errorMessage: undefined,
      }
      publish()
    },
    selectEntity(entityId, additive = false) {
      if (!commandStore.scene.entities.some((entity) => entity.id === entityId)) return
      discardInteraction()
      deletedSelectionId = null
      const selectedEntityIds = additive
        ? snapshot.selectedEntityIds.includes(entityId)
          ? snapshot.selectedEntityIds.filter((id) => id !== entityId)
          : [...snapshot.selectedEntityIds, entityId]
        : [entityId]
      const primarySelectionId =
        additive && selectedEntityIds.length === 0 ? null : entityId
      snapshot = {
        ...snapshot,
        selectedEntityId: primarySelectionId,
        primarySelectionId,
        selectedEntityIds,
        errorMessage: undefined,
      }
      publish()
    },
    clearSelection() {
      this.selectRoom()
    },
    addCatalogItem(itemId) {
      if (!CATALOG_DEFINITIONS.some((definition) => definition.id === itemId)) {
        publish(`カタログ項目が見つかりません: ${itemId}`)
        return undefined
      }
      const beforeIds = new Set(commandStore.scene.entities.map((entity) => entity.id))
      let added: Entity | undefined
      if (
        !sceneAction({ type: 'add-catalog-entity', itemId }, (scene) => {
          added = scene.entities.find((entity) => !beforeIds.has(entity.id))
          if (added)
            snapshot = {
              ...snapshot,
              selectedEntityId: added.id,
              primarySelectionId: added.id,
              selectedEntityIds: [added.id],
            }
        })
      )
        return undefined
      if (!added) return undefined
      return added.id
    },
    renameEntity(entityId, name) {
      if (!name.trim()) return false
      return sceneAction({ type: 'rename-entity', entityId, name: name.trim() })
    },
    setVisibility(entityId, visible) {
      return sceneAction({ type: 'set-visibility', entityId, visible })
    },
    setLocked(entityId, locked) {
      return sceneAction({ type: 'set-locked', entityId, locked })
    },
    duplicateEntity(entityId) {
      const beforeIds = new Set(commandStore.scene.entities.map((entity) => entity.id))
      let duplicate: Entity | undefined
      if (
        !sceneAction({ type: 'duplicate-entity', entityId }, (scene) => {
          duplicate = scene.entities.find((entity) => !beforeIds.has(entity.id))
          if (duplicate)
            snapshot = {
              ...snapshot,
              selectedEntityId: duplicate.id,
              primarySelectionId: duplicate.id,
              selectedEntityIds: [duplicate.id],
            }
        })
      )
        return undefined
      if (!duplicate) return undefined
      return duplicate.id
    },
    deleteEntity(entityId) {
      const selectedId = snapshot.selectedEntityId
      if (selectedId) {
        let current: string | null = selectedId
        const byId = new Map(
          commandStore.scene.entities.map((entity) => [entity.id, entity]),
        )
        while (current) {
          if (current === entityId) {
            deletedSelectionId = selectedId
            break
          }
          current = byId.get(current)?.parentId ?? null
        }
      }
      return sceneAction({ type: 'delete-entity', entityId })
    },
    setTransform(entityId, transform) {
      return sceneAction({ type: 'set-transform', entityId, transform: clone(transform) })
    },
    setDimensions(entityId, dimensions) {
      if (!validDimensions(dimensions)) return false
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity) return false
      if (entity.catalog) {
        return sceneAction({
          type: 'set-catalog',
          entityId,
          catalog: clone(entity.catalog),
          overrides: dimensionsForEntity(dimensions),
        })
      }
      return sceneAction({
        type: 'set-dimensions',
        entityId,
        dimensions: clone(dimensions),
      })
    },
    setCatalogPreset(entityId, presetId) {
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity?.catalog) return false
      const catalog = { ...entity.catalog }
      if (presetId === null) delete catalog.presetId
      else catalog.presetId = presetId
      const overrides = clone(entity.overrides)
      if (presetId !== null) {
        delete overrides.dimensions
        if (overrides.geometry && typeof overrides.geometry === 'object') {
          const geometry = overrides.geometry as JsonObject
          delete geometry.panel
          if (Object.keys(geometry).length === 0) delete overrides.geometry
        }
      }
      return sceneAction({ type: 'set-catalog', entityId, catalog, overrides })
    },
    setCatalogOverrides(entityId, overrides) {
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity?.catalog) return false
      return sceneAction({
        type: 'set-catalog',
        entityId,
        catalog: clone(entity.catalog),
        overrides: clone(overrides),
      })
    },
    setCatalogCustomDimensions(entityId, dimensions) {
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity) return false
      const command = catalogCustomDimensionsCommand(entity, dimensions)
      return command ? sceneAction(command) : false
    },
    placeEntity(entityId, placement) {
      if (
        snapshot.mode !== 'edit' ||
        !isPlacementEntityEligible(commandStore.scene, entityId)
      )
        return false
      return sceneAction({ type: 'place-entity', entityId, placement })
    },
    resetCatalogOverride(entityId, key) {
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity?.catalog) return false
      const reset = resetCatalogOverrides(
        { id: entity.id, overrides: entity.overrides },
        key,
      )
      return sceneAction({
        type: 'set-catalog',
        entityId,
        catalog: clone(entity.catalog),
        overrides: reset.overrides,
      })
    },
    setMaterial(entityId, materialId) {
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity?.catalog) return false
      return sceneAction({
        type: 'set-catalog',
        entityId,
        catalog: clone(entity.catalog),
        overrides: { ...clone(entity.overrides), materialId },
      })
    },
    setRoomPreset(presetId) {
      const preset = ROOM_PRESETS[presetId]
      return sceneAction({
        type: 'resize-room',
        dimensions: { width: preset.width, depth: preset.depth, height: preset.height },
        preset: preset.id,
      })
    },
    setRoomDimensions(dimensions) {
      if (!validDimensions(dimensions)) return false
      return sceneAction({
        type: 'resize-room',
        dimensions: clone(dimensions),
        preset: null,
      })
    },
    groupEntities(entityIds, name = '新しいグループ') {
      const entities = entityIds
        .map((id) => commandStore.scene.entities.find((entity) => entity.id === id))
        .filter((entity): entity is Entity => Boolean(entity))
      if (entities.length === 0) return undefined
      const existingIds = new Set(commandStore.scene.entities.map((entity) => entity.id))
      let id = idFactory()
      while (existingIds.has(id)) id = idFactory()
      const group: Entity = {
        id,
        kind: 'group',
        name,
        parentId: null,
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        dimensions: { width: 1, depth: 1, height: 1 },
        overrides: {},
        ports: [],
        properties: {},
        visible: true,
        locked: false,
        extensions: {},
      }
      if (
        !sceneAction(
          {
            type: 'group-entities',
            group,
            entityIds: entities.map((entity) => entity.id),
          },
          () => {
            snapshot = {
              ...snapshot,
              selectedEntityId: id,
              primarySelectionId: id,
              selectedEntityIds: [id],
            }
          },
        )
      )
        return undefined
      return id
    },
    ungroupEntity(entityId) {
      return sceneAction({ type: 'ungroup-entity', entityId })
    },
    undo() {
      try {
        const discarded = discardInteraction()
        const changed = commandStore.undo()
        if (!changed) {
          if (discarded) publish()
          return false
        }
        suppressAutosaveStatus = true
        try {
          autosave?.schedule(commandStore.scene)
        } finally {
          suppressAutosaveStatus = false
        }
        if (
          deletedSelectionId &&
          commandStore.scene.entities.some((entity) => entity.id === deletedSelectionId)
        ) {
          snapshot = {
            ...snapshot,
            selectedEntityId: deletedSelectionId,
            primarySelectionId: deletedSelectionId,
            selectedEntityIds: [deletedSelectionId],
          }
          deletedSelectionId = null
        }
        publish()
        return true
      } catch (error) {
        publish(error instanceof Error ? error.message : '元に戻せませんでした。')
        return false
      }
    },
    redo() {
      try {
        const discarded = discardInteraction()
        const changed = commandStore.redo()
        if (!changed) {
          if (discarded) publish()
          return false
        }
        suppressAutosaveStatus = true
        try {
          autosave?.schedule(commandStore.scene)
        } finally {
          suppressAutosaveStatus = false
        }
        publish()
        return true
      } catch (error) {
        publish(error instanceof Error ? error.message : 'やり直せませんでした。')
        return false
      }
    },
    setMode(mode) {
      discardInteraction()
      snapshot = {
        ...snapshot,
        mode,
        cableDraft: undefined,
        mobilePanel: mode === 'preview' ? 'none' : snapshot.mobilePanel,
        errorMessage: undefined,
      }
      publish()
    },
    setActiveTool(activeTool) {
      discardInteraction()
      snapshot = { ...snapshot, activeTool, errorMessage: undefined }
      publish()
    },
    setTranslationSnap(translationSnap) {
      if (!Number.isFinite(translationSnap) || translationSnap <= 0) return
      snapshot = { ...snapshot, translationSnap, errorMessage: undefined }
      publish()
    },
    setRotationSnap(rotationSnap) {
      if (!Number.isFinite(rotationSnap) || rotationSnap <= 0) return
      snapshot = { ...snapshot, rotationSnap, errorMessage: undefined }
      publish()
    },
    setFloorSnap(floorSnap) {
      snapshot = { ...snapshot, floorSnap, errorMessage: undefined }
      publish()
    },
    beginCableDraft(cableId, portId) {
      const scene = commandStore.scene
      const cable = cableEnd(scene, cableId, portId)
      if (snapshot.mode !== 'edit' || !cable || cable.locked || !cable.visible) {
        publish('ケーブル端子を選択できません。')
        return false
      }
      if (getCableEndAttachment(scene, cableId, portId)) {
        publish('このケーブル端子は既に接続されています。')
        return false
      }
      snapshot = { ...snapshot, cableDraft: { cableId, portId }, errorMessage: undefined }
      publish()
      return true
    },
    cancelCableDraft() {
      snapshot = { ...snapshot, cableDraft: undefined, errorMessage: undefined }
      publish()
    },
    completeCableDraft(targetEntityId, targetPortId) {
      const draft = snapshot.cableDraft
      const scene = commandStore.scene
      if (snapshot.mode !== 'edit' || !draft) return false
      const cable = cableEnd(scene, draft.cableId, draft.portId)
      const target = scene.entities.find((entity) => entity.id === targetEntityId)
      const targetPort = target?.ports.find((port) => port.id === targetPortId)
      if (
        !cable ||
        !target ||
        target.catalog?.itemId === 'cable.generic' ||
        target.locked ||
        !target.visible ||
        !targetPort
      ) {
        publish('接続先ポートを選択できません。')
        return false
      }
      const routing = getCableRouting(cable)
      if (routing.kind !== 'generic' && routing.kind !== targetPort.kind) {
        publish('ケーブル種別と接続先ポートの種類が一致しません。')
        return false
      }
      const changed = sceneAction(
        {
          type: 'add-connection',
          connection: {
            id: nextPersistentId(),
            kind: routing.kind,
            endpoints: [
              { entityId: draft.cableId, portId: draft.portId },
              { entityId: targetEntityId, portId: targetPortId },
            ],
            properties: {},
            extensions: {},
          },
        },
        () => {
          snapshot = { ...snapshot, cableDraft: undefined }
        },
      )
      return changed
    },
    detachCableEnd(cableId, portId) {
      const scene = commandStore.scene
      const connection = getCableEndAttachment(scene, cableId, portId)
      if (!connection) return false
      if (classifyCableConnection(scene, connection) !== 'canonical') {
        publish('既存のレガシー接続は読み取り専用です。')
        return false
      }
      return sceneAction({ type: 'delete-connection', connectionId: connection.id })
    },
    setCableRouting(entityId, routing) {
      return sceneAction({ type: 'set-cable-routing', entityId, routing })
    },
    addCableWaypoint(entityId) {
      const cable = commandStore.scene.entities.find((entity) => entity.id === entityId)
      if (!cable || cable.catalog?.itemId !== 'cable.generic') return false
      const routing = getCableRouting(cable)
      if (routing.waypoints.length >= 64) return false
      return sceneAction({
        type: 'set-cable-routing',
        entityId,
        routing: {
          ...routing,
          waypoints: [
            ...routing.waypoints,
            { id: nextPersistentId(), position: { x: 0, y: 0, z: 0 } },
          ],
        },
      })
    },
    updateCableWaypoint(entityId, waypointId, position) {
      const cable = commandStore.scene.entities.find((entity) => entity.id === entityId)
      if (!cable || cable.catalog?.itemId !== 'cable.generic') return false
      const routing = getCableRouting(cable)
      if (!routing.waypoints.some((waypoint) => waypoint.id === waypointId)) return false
      return sceneAction({
        type: 'set-cable-routing',
        entityId,
        routing: {
          ...routing,
          waypoints: routing.waypoints.map((waypoint) =>
            waypoint.id === waypointId
              ? { ...waypoint, position: clone(position) }
              : waypoint,
          ),
        },
      })
    },
    deleteCableWaypoint(entityId, waypointId) {
      const cable = commandStore.scene.entities.find((entity) => entity.id === entityId)
      if (!cable || cable.catalog?.itemId !== 'cable.generic') return false
      const routing = getCableRouting(cable)
      if (!routing.waypoints.some((waypoint) => waypoint.id === waypointId)) return false
      return sceneAction({
        type: 'set-cable-routing',
        entityId,
        routing: {
          ...routing,
          waypoints: routing.waypoints.filter((waypoint) => waypoint.id !== waypointId),
        },
      })
    },
    beginCableWaypointInteraction(entityId, waypointId) {
      const cable = commandStore.scene.entities.find((entity) => entity.id === entityId)
      if (!cable || cable.catalog?.itemId !== 'cable.generic' || cable.locked)
        return false
      if (
        !getCableRouting(cable).waypoints.some((waypoint) => waypoint.id === waypointId)
      )
        return false
      return store.beginInteraction('move cable waypoint', { entityId, waypointId })
    },
    updateCableWaypointInteraction(entityId, waypointId, position) {
      const cable = commandStore.scene.entities.find((entity) => entity.id === entityId)
      if (!cable || cable.catalog?.itemId !== 'cable.generic') return false
      const routing = getCableRouting(cable)
      if (!routing.waypoints.some((waypoint) => waypoint.id === waypointId)) return false
      return interactionAction({
        type: 'set-cable-routing',
        entityId,
        routing: {
          ...routing,
          waypoints: routing.waypoints.map((waypoint) =>
            waypoint.id === waypointId
              ? { ...waypoint, position: clone(position) }
              : waypoint,
          ),
        },
      })
    },
    setCableEndPosition(entityId, portId, position) {
      const scene = commandStore.scene
      if (getCableEndAttachment(scene, entityId, portId)) {
        publish('接続中の端子は移動できません。')
        return false
      }
      return sceneAction({
        type: 'set-cable-port-position',
        entityId,
        portId,
        position: clone(position),
      })
    },
    beginInteraction(label, target) {
      if (snapshot.mode !== 'edit' || commandStore.activeInteraction) return false
      try {
        resizeEvidenceInteraction = label === 'resize entity'
        rendererDraft = isRendererDraftRegistration(target)
          ? captureRendererDraft(target.target, target.onCancel)
          : undefined
        const transactionPhase = resizeEvidenceInteraction
          ? startResizeEvidencePhase('resize-transaction')
          : null
        try {
          commandStore.beginInteraction(label, rendererDraft ? undefined : target)
        } finally {
          endResizeEvidencePhase(transactionPhase)
        }
        snapshot = { ...snapshot, interactionActive: true, errorMessage: undefined }
        const publishPhase = resizeEvidenceInteraction
          ? startResizeEvidencePhase('resize-begin-publish')
          : null
        try {
          publish()
        } finally {
          endResizeEvidencePhase(publishPhase)
        }
        return true
      } catch (error) {
        resizeEvidenceInteraction = false
        rendererDraft = undefined
        publish(
          error instanceof Error ? error.message : 'Unable to begin the interaction.',
        )
        return false
      }
    },
    updateInteractionTransform(entityId, transform) {
      try {
        commandStore.updateInteraction({
          type: 'set-transform',
          entityId,
          transform: clone(transform),
        })
        return true
      } catch (error) {
        publish(
          error instanceof Error ? error.message : 'Unable to update the interaction.',
        )
        return false
      }
    },
    updateInteractionDimensions(entityId, dimensions) {
      if (!validDimensions(dimensions)) return false
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      if (!entity) return false
      const command = entity.catalog
        ? catalogCustomDimensionsCommand(entity, dimensions)
        : { type: 'set-dimensions' as const, entityId, dimensions: clone(dimensions) }
      return command ? interactionAction(command) : false
    },
    updateInteractionGeometry(entityId, transform, dimensions) {
      if (!validDimensions(dimensions)) return false
      const entity = commandStore.scene.entities.find(
        (candidate) => candidate.id === entityId,
      )
      const command = entity
        ? catalogCustomGeometryCommand(entity, transform, dimensions)
        : undefined
      if (!command) return false
      try {
        commandStore.updateInteraction(command)
        return true
      } catch (error) {
        publish(
          error instanceof Error ? error.message : 'Unable to finalize the interaction.',
        )
        return false
      }
    },
    commitInteraction() {
      try {
        const historyPhase = resizeEvidenceInteraction
          ? startResizeEvidencePhase('resize-history')
          : null
        let changed: boolean
        try {
          changed = commandStore.commitInteraction()
        } finally {
          endResizeEvidencePhase(historyPhase)
        }
        rendererDraft = undefined
        snapshot = { ...snapshot, interactionActive: false }
        if (changed) {
          suppressAutosaveStatus = true
          const autosavePhase = resizeEvidenceInteraction
            ? startResizeEvidencePhase('resize-autosave-schedule')
            : null
          try {
            autosave?.schedule(commandStore.scene)
          } finally {
            endResizeEvidencePhase(autosavePhase)
            suppressAutosaveStatus = false
          }
        }
        const publishPhase = resizeEvidenceInteraction
          ? startResizeEvidencePhase('resize-commit-publish')
          : null
        try {
          publish()
        } finally {
          endResizeEvidencePhase(publishPhase)
        }
        resizeEvidenceInteraction = false
        return changed
      } catch (error) {
        resizeEvidenceInteraction = false
        publish(
          error instanceof Error ? error.message : 'Unable to commit the interaction.',
        )
        return false
      }
    },
    cancelInteraction() {
      try {
        const cancelled = discardInteraction()
        publish()
        return cancelled
      } catch (error) {
        publish(
          error instanceof Error ? error.message : 'Unable to cancel the interaction.',
        )
        return false
      }
    },
    setLeftTab(activeLeftTab) {
      snapshot = { ...snapshot, activeLeftTab, errorMessage: undefined }
      publish()
    },
    setMobilePanel(mobilePanel) {
      snapshot = { ...snapshot, mobilePanel, errorMessage: undefined }
      publish()
    },
    exportJson() {
      return exportScene(commandStore.scene)
    },
    importJson(input) {
      const result = importScene(input)
      if (!result.ok) {
        publish(result.error.message)
        return false
      }
      return replaceScene(result.scene)
    },
    resetScene() {
      if (
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm('現在のシーンをリセットしますか？')
      )
        return false
      return replaceScene(
        createFutureWorkstationScene({ idFactory, now: () => new Date().toISOString() }),
      )
    },
    saveNow() {
      suppressAutosaveStatus = true
      try {
        autosave?.flush()
      } finally {
        suppressAutosaveStatus = false
      }
      publish()
    },
    dispose() {
      discardInteraction()
      autosave?.dispose()
      listeners.clear()
    },
  }

  return store
}

export function getResolvedCatalog(entity: Entity) {
  return entity.catalog ? resolveCatalogInstance(entity) : undefined
}

/** Class form for integrations that prefer an explicit store instance. */
export class EditorStoreClass implements EditorStore {
  private readonly delegate: EditorStore

  constructor(options: EditorStoreOptions = {}) {
    this.delegate = createEditorStore(options)
  }

  getSnapshot() {
    return this.delegate.getSnapshot()
  }
  snapshot() {
    return this.delegate.snapshot()
  }
  subscribe(listener: () => void) {
    return this.delegate.subscribe(listener)
  }
  selectRoom() {
    return this.delegate.selectRoom()
  }
  selectEntity(entityId: string, additive?: boolean) {
    return this.delegate.selectEntity(entityId, additive)
  }
  clearSelection() {
    return this.delegate.clearSelection()
  }
  addCatalogItem(itemId: string) {
    return this.delegate.addCatalogItem(itemId)
  }
  renameEntity(entityId: string, name: string) {
    return this.delegate.renameEntity(entityId, name)
  }
  setVisibility(entityId: string, visible: boolean) {
    return this.delegate.setVisibility(entityId, visible)
  }
  setLocked(entityId: string, locked: boolean) {
    return this.delegate.setLocked(entityId, locked)
  }
  duplicateEntity(entityId: string) {
    return this.delegate.duplicateEntity(entityId)
  }
  deleteEntity(entityId: string) {
    return this.delegate.deleteEntity(entityId)
  }
  setTransform(entityId: string, transform: Transform) {
    return this.delegate.setTransform(entityId, transform)
  }
  setDimensions(entityId: string, dimensions: Dimensions) {
    return this.delegate.setDimensions(entityId, dimensions)
  }
  setCatalogPreset(entityId: string, presetId: string | null) {
    return this.delegate.setCatalogPreset(entityId, presetId)
  }
  setCatalogOverrides(entityId: string, overrides: JsonObject) {
    return this.delegate.setCatalogOverrides(entityId, overrides)
  }
  setCatalogCustomDimensions(entityId: string, dimensions: Dimensions) {
    return this.delegate.setCatalogCustomDimensions(entityId, dimensions)
  }
  placeEntity(entityId: string, placement: PlacementAction) {
    return this.delegate.placeEntity(entityId, placement)
  }
  resetCatalogOverride(entityId: string, key?: string) {
    return this.delegate.resetCatalogOverride(entityId, key)
  }
  setMaterial(entityId: string, materialId: string) {
    return this.delegate.setMaterial(entityId, materialId)
  }
  setRoomPreset(presetId: RoomPresetId) {
    return this.delegate.setRoomPreset(presetId)
  }
  setRoomDimensions(dimensions: Dimensions) {
    return this.delegate.setRoomDimensions(dimensions)
  }
  groupEntities(entityIds: readonly string[], name?: string) {
    return this.delegate.groupEntities(entityIds, name)
  }
  ungroupEntity(entityId: string) {
    return this.delegate.ungroupEntity(entityId)
  }
  undo() {
    return this.delegate.undo()
  }
  redo() {
    return this.delegate.redo()
  }
  setMode(mode: EditorMode) {
    return this.delegate.setMode(mode)
  }
  setActiveTool(tool: EditorTool) {
    return this.delegate.setActiveTool(tool)
  }
  setTranslationSnap(millimetres: number) {
    return this.delegate.setTranslationSnap(millimetres)
  }
  setRotationSnap(degrees: number) {
    return this.delegate.setRotationSnap(degrees)
  }
  setFloorSnap(enabled: boolean) {
    return this.delegate.setFloorSnap(enabled)
  }
  beginCableDraft(cableId: string, portId: string) {
    return this.delegate.beginCableDraft(cableId, portId)
  }
  cancelCableDraft() {
    return this.delegate.cancelCableDraft()
  }
  completeCableDraft(targetEntityId: string, targetPortId: string) {
    return this.delegate.completeCableDraft(targetEntityId, targetPortId)
  }
  detachCableEnd(cableId: string, portId: string) {
    return this.delegate.detachCableEnd(cableId, portId)
  }
  setCableRouting(entityId: string, routing: CableRouting) {
    return this.delegate.setCableRouting(entityId, routing)
  }
  addCableWaypoint(entityId: string) {
    return this.delegate.addCableWaypoint(entityId)
  }
  updateCableWaypoint(entityId: string, waypointId: string, position: Vector3) {
    return this.delegate.updateCableWaypoint(entityId, waypointId, position)
  }
  deleteCableWaypoint(entityId: string, waypointId: string) {
    return this.delegate.deleteCableWaypoint(entityId, waypointId)
  }
  beginCableWaypointInteraction(entityId: string, waypointId: string) {
    return this.delegate.beginCableWaypointInteraction(entityId, waypointId)
  }
  updateCableWaypointInteraction(
    entityId: string,
    waypointId: string,
    position: Vector3,
  ) {
    return this.delegate.updateCableWaypointInteraction(entityId, waypointId, position)
  }
  setCableEndPosition(entityId: string, portId: string, position: Vector3) {
    return this.delegate.setCableEndPosition(entityId, portId, position)
  }
  beginInteraction(label: string, target?: unknown) {
    return this.delegate.beginInteraction(label, target)
  }
  updateInteractionTransform(entityId: string, transform: Transform) {
    return this.delegate.updateInteractionTransform(entityId, transform)
  }
  updateInteractionDimensions(entityId: string, dimensions: Dimensions) {
    return this.delegate.updateInteractionDimensions(entityId, dimensions)
  }
  updateInteractionGeometry(
    entityId: string,
    transform: Transform,
    dimensions: Dimensions,
  ) {
    return this.delegate.updateInteractionGeometry(entityId, transform, dimensions)
  }
  commitInteraction() {
    return this.delegate.commitInteraction()
  }
  cancelInteraction() {
    return this.delegate.cancelInteraction()
  }
  setLeftTab(tab: LeftTab) {
    return this.delegate.setLeftTab(tab)
  }
  setMobilePanel(panel: MobilePanel) {
    return this.delegate.setMobilePanel(panel)
  }
  exportJson() {
    return this.delegate.exportJson()
  }
  importJson(input: string | Uint8Array) {
    return this.delegate.importJson(input)
  }
  resetScene() {
    return this.delegate.resetScene()
  }
  saveNow() {
    return this.delegate.saveNow()
  }
  dispose() {
    return this.delegate.dispose()
  }
}

export const EditorStore = EditorStoreClass
