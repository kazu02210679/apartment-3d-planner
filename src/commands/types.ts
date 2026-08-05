import type {
  CatalogReference,
  Connection,
  Dimensions,
  Entity,
  JsonObject,
  RoomDimensions,
  SceneDocument,
  Transform,
} from '../domain/schema'
import type { RoomPresetId } from '../domain/room-presets'

export type SceneCommand =
  | { readonly type: 'add-entity'; readonly entity: Entity }
  | {
      readonly type: 'add-catalog-entity'
      readonly itemId: string
      readonly id?: string
      readonly portIds?: readonly string[]
      readonly name?: string
      readonly parentId?: string | null
      readonly transform?: Transform
      readonly overrides?: JsonObject
      readonly properties?: JsonObject
    }
  | { readonly type: 'rename-entity'; readonly entityId: string; readonly name: string }
  | {
      readonly type: 'duplicate-entity'
      readonly entityId: string
      readonly id?: string
      readonly portIds?: readonly string[]
    }
  | { readonly type: 'delete-entity'; readonly entityId: string }
  | {
      readonly type: 'set-visibility'
      readonly entityId: string
      readonly visible: boolean
    }
  | { readonly type: 'set-locked'; readonly entityId: string; readonly locked: boolean }
  | {
      readonly type: 'set-transform'
      readonly entityId: string
      readonly transform: Transform
    }
  | {
      readonly type: 'set-dimensions'
      readonly entityId: string
      readonly dimensions: Dimensions
    }
  | {
      readonly type: 'set-catalog'
      readonly entityId: string
      readonly itemId?: string
      readonly presetId?: string
      readonly catalog?: CatalogReference
      readonly overrides?: JsonObject
    }
  | {
      readonly type: 'resize-room'
      readonly dimensions: RoomDimensions
      readonly preset?: RoomPresetId | null
    }
  | {
      readonly type: 'reparent-entity'
      readonly entityId: string
      readonly parentId: string | null
    }
  | {
      readonly type: 'group-entities'
      readonly group: Entity
      readonly entityIds: readonly string[]
    }
  | { readonly type: 'ungroup-entity'; readonly entityId: string }
  | { readonly type: 'add-connection'; readonly connection: Connection }
  | {
      readonly type: 'update-connection'
      readonly connectionId: string
      readonly connection: Connection
    }
  | { readonly type: 'delete-connection'; readonly connectionId: string }

export interface CommandResult {
  readonly scene: SceneDocument
  readonly outOfBoundsEntityIds: readonly string[]
}

export interface HistoryEntry {
  readonly label: string
  readonly before: SceneDocument
  readonly after: SceneDocument
}

export interface CommandStoreOptions {
  readonly idFactory?: () => string
}
