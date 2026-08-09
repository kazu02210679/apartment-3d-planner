import { createOpaqueId, type IdFactory, type OpaqueId } from './ids'
import { findOutOfBoundsEntityIds } from './invariants'
import { resolveRoomPreset, type RoomPresetInput } from './room-presets'
import {
  RoomDimensionsSchema,
  SceneDocumentSchema,
  type RoomDimensions,
  type SceneDocument,
} from './schema'

export type SceneClock = () => string

export interface CreateEmptySceneOptions {
  idFactory?: IdFactory
  now?: SceneClock
}

function resolveCreateOptions(
  optionsOrFactory: CreateEmptySceneOptions | IdFactory,
): CreateEmptySceneOptions {
  return typeof optionsOrFactory === 'function'
    ? { idFactory: optionsOrFactory }
    : optionsOrFactory
}

export function createEmptyScene(
  preset: RoomPresetInput = '6-tatami',
  optionsOrFactory: CreateEmptySceneOptions | IdFactory = {},
): SceneDocument {
  const presetDefinition = resolveRoomPreset(preset)
  const options = resolveCreateOptions(optionsOrFactory)
  const idFactory = options.idFactory
  const now = options.now ?? (() => new Date().toISOString())
  const timestamp = now()

  return SceneDocumentSchema.parse({
    id: createOpaqueId(idFactory),
    format: 'home-lab-scene',
    schemaVersion: 1,
    metadata: {
      name: '新しいシーン',
      createdAt: timestamp,
      updatedAt: timestamp,
      tags: [],
      extensions: {},
    },
    room: {
      id: createOpaqueId(idFactory),
      name: '部屋',
      preset: presetDefinition.id,
      width: presetDefinition.width,
      depth: presetDefinition.depth,
      height: presetDefinition.height,
      extensions: {},
    },
    entities: [],
    connections: [],
    extensions: {},
  })
}

export function resizeRoom(scene: SceneDocument, dimensions: RoomDimensions): OpaqueId[]
export function resizeRoom(
  scene: SceneDocument,
  width: number,
  depth: number,
  height: number,
): OpaqueId[]
export function resizeRoom(
  scene: SceneDocument,
  dimensionsOrWidth: RoomDimensions | number,
  depth?: number,
  height?: number,
): OpaqueId[] {
  const dimensions =
    typeof dimensionsOrWidth === 'number'
      ? RoomDimensionsSchema.parse({ width: dimensionsOrWidth, depth, height })
      : RoomDimensionsSchema.parse(dimensionsOrWidth)

  scene.room.width = dimensions.width
  scene.room.depth = dimensions.depth
  scene.room.height = dimensions.height

  return findOutOfBoundsEntityIds(scene)
}

export type { SceneDocument } from './schema'
