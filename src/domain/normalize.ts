import {
  SceneDocumentSchema,
  type JsonObject,
  type JsonValue,
  type SceneDocument,
} from './schema'
import { validateSceneInvariants } from './invariants'

function normalizeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (typeof value === 'object' && value !== null) {
    const normalized: JsonObject = {}

    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJsonValue(value[key])
    }

    return normalized
  }

  return Object.is(value, -0) ? 0 : value
}

function normalizeJsonObject(value: JsonObject): JsonObject {
  return normalizeJsonValue(value) as JsonObject
}

function compareIds(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

export function normalizeScene(input: unknown): SceneDocument {
  const scene = validateSceneInvariants(input)
  const normalized = {
    ...scene,
    metadata: {
      ...scene.metadata,
      extensions: normalizeJsonObject(scene.metadata.extensions),
    },
    room: {
      ...scene.room,
      extensions: normalizeJsonObject(scene.room.extensions),
    },
    entities: [...scene.entities].sort(compareIds).map((entity) => ({
      ...entity,
      overrides: normalizeJsonObject(entity.overrides),
      properties: normalizeJsonObject(entity.properties),
      ports: [...entity.ports].sort(compareIds).map((port) => ({
        ...port,
        extensions: normalizeJsonObject(port.extensions),
      })),
      extensions: normalizeJsonObject(entity.extensions),
      ...(entity.catalog
        ? {
            catalog: {
              ...entity.catalog,
              extensions: normalizeJsonObject(entity.catalog.extensions),
            },
          }
        : {}),
    })),
    connections: [...scene.connections].sort(compareIds).map((connection) => ({
      ...connection,
      properties: normalizeJsonObject(connection.properties),
      extensions: normalizeJsonObject(connection.extensions),
    })),
    extensions: normalizeJsonObject(scene.extensions),
  }

  return SceneDocumentSchema.parse(normalized)
}
