import {
  createAutosaveCoordinator,
  type AutosaveCoordinator,
  type AutosaveOptions,
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
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { ROOM_PRESETS, type RoomPresetId } from '../domain/room-presets'
import type {
  Dimensions,
  Entity,
  JsonObject,
  SceneDocument,
  Transform,
} from '../domain/schema'

export type EditorMode = 'edit' | 'preview'
export type LeftTab = 'catalog' | 'outliner'
export type MobilePanel = 'none' | 'catalog' | 'outliner' | 'inspector'

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
  readonly saveStatus: ReturnType<AutosaveCoordinator['getStatus']>
  readonly activeLeftTab: LeftTab
  readonly mobilePanel: MobilePanel
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
  resetCatalogOverride(entityId: string, key?: string): boolean
  setMaterial(entityId: string, materialId: string): boolean
  setRoomPreset(presetId: RoomPresetId): boolean
  setRoomDimensions(dimensions: Dimensions): boolean
  groupEntities(entityIds: readonly string[], name?: string): string | undefined
  ungroupEntity(entityId: string): boolean
  undo(): boolean
  redo(): boolean
  setMode(mode: EditorMode): void
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

function validDimensions(dimensions: Dimensions): boolean {
  return Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0)
}

function dimensionsForEntity(dimensions: Dimensions): JsonObject {
  return { dimensions: clone(dimensions) as unknown as JsonObject }
}

function makeSnapshot(
  scene: SceneDocument,
  rest: Omit<EditorSnapshot, 'scene'>,
): EditorSnapshot {
  const value = { ...rest, scene: clone(scene) } as EditorSnapshot
  Object.defineProperty(value, 'scene', {
    enumerable: true,
    configurable: false,
    get: () => clone(scene),
  })
  return value
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
  const autosave =
    options.autosave ??
    (options.storage
      ? createAutosaveCoordinator(options.storage, options.autosaveOptions)
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
    saveStatus: autosave?.getStatus() ?? { state: 'idle' },
    activeLeftTab: 'catalog',
    mobilePanel: 'none',
  })

  const publish = (errorMessage?: string) => {
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
      canUndo: commandStore.history.undo.length > 0,
      canRedo: commandStore.history.redo.length > 0,
      saveStatus: autosave?.getStatus() ?? snapshot.saveStatus,
      ...(errorMessage === undefined ? {} : { errorMessage }),
    })
    listeners.forEach((listener) => listener())
  }

  const sceneAction = (
    command: SceneCommand,
    afterExecute?: (scene: SceneDocument) => void,
  ): boolean => {
    const before = commandStore.scene
    try {
      commandStore.execute(command)
    } catch (error) {
      publish(error instanceof Error ? error.message : '編集を適用できませんでした。')
      return false
    }
    const changed = !sameScene(before, commandStore.scene)
    if (changed) autosave?.schedule(commandStore.scene)
    afterExecute?.(commandStore.scene)
    publish()
    return changed
  }

  const replaceScene = (scene: SceneDocument, save = true): boolean => {
    commandStore = createCommandStore(scene, { idFactory })
    snapshot = {
      ...snapshot,
      selectedEntityId: null,
      primarySelectionId: null,
      selectedEntityIds: [],
      errorMessage: undefined,
    }
    if (save) autosave?.schedule(scene)
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
      if (presetId !== null && 'dimensions' in overrides) delete overrides.dimensions
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
      if (!entity?.catalog || !validDimensions(dimensions)) return false
      const catalog = { ...entity.catalog }
      delete catalog.presetId
      return sceneAction({
        type: 'set-catalog',
        entityId,
        catalog,
        overrides: {
          ...clone(entity.overrides),
          dimensions: clone(dimensions) as unknown as JsonObject,
        },
      })
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
      const id = idFactory()
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
        const changed = commandStore.undo()
        if (!changed) return false
        autosave?.schedule(commandStore.scene)
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
        const changed = commandStore.redo()
        if (!changed) return false
        autosave?.schedule(commandStore.scene)
        publish()
        return true
      } catch (error) {
        publish(error instanceof Error ? error.message : 'やり直せませんでした。')
        return false
      }
    },
    setMode(mode) {
      snapshot = { ...snapshot, mode, errorMessage: undefined }
      publish()
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
      autosave?.flush()
      publish()
    },
    dispose() {
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
