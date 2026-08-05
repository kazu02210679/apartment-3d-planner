import type { SceneDocument } from '../domain/schema'

export const MAX_INPUT_BYTES = 512 * 1024
export const MAX_ENTITIES = 100
export const MAX_CONNECTIONS = 100
export const MAX_PORTS_PER_ENTITY = 32
export const MAX_ENDPOINTS_PER_CONNECTION = 32
export const MAX_JSON_DEPTH = 32

export interface SceneLimits {
  readonly maxEntities?: number
  readonly maxConnections?: number
  readonly maxPortsPerEntity?: number
  readonly maxEndpointsPerConnection?: number
  readonly maxJsonDepth?: number
}

export type SceneLimitCode =
  | 'too-many-entities'
  | 'too-many-connections'
  | 'too-many-ports'
  | 'too-many-endpoints'
  | 'too-deep'

export class SceneLimitError extends Error {
  readonly code: SceneLimitCode

  constructor(code: SceneLimitCode, message: string) {
    super(message)
    this.name = 'SceneLimitError'
    this.code = code
  }
}

function jsonDepth(value: unknown): number {
  if (value === null || typeof value !== 'object') return 0
  if (Array.isArray(value)) {
    return value.length === 0 ? 1 : 1 + Math.max(...value.map(jsonDepth))
  }
  const values = Object.values(value)
  return values.length === 0 ? 1 : 1 + Math.max(...values.map(jsonDepth))
}

export function getJsonDepth(value: unknown): number {
  return jsonDepth(value)
}

export function assertSceneWithinLimits(
  scene: SceneDocument,
  limits: SceneLimits = {},
): void {
  const maxEntities = limits.maxEntities ?? MAX_ENTITIES
  const maxConnections = limits.maxConnections ?? MAX_CONNECTIONS
  const maxPorts = limits.maxPortsPerEntity ?? MAX_PORTS_PER_ENTITY
  const maxEndpoints = limits.maxEndpointsPerConnection ?? MAX_ENDPOINTS_PER_CONNECTION
  const maxDepth = limits.maxJsonDepth ?? MAX_JSON_DEPTH

  if (scene.entities.length > maxEntities) {
    throw new SceneLimitError(
      'too-many-entities',
      `A scene may contain at most ${maxEntities} entities.`,
    )
  }
  if (scene.connections.length > maxConnections) {
    throw new SceneLimitError(
      'too-many-connections',
      `A scene may contain at most ${maxConnections} connections.`,
    )
  }
  for (const entity of scene.entities) {
    if (entity.ports.length > maxPorts) {
      throw new SceneLimitError(
        'too-many-ports',
        `An entity may contain at most ${maxPorts} ports.`,
      )
    }
  }
  for (const connection of scene.connections) {
    if (connection.endpoints.length > maxEndpoints) {
      throw new SceneLimitError(
        'too-many-endpoints',
        `A connection may contain at most ${maxEndpoints} endpoints.`,
      )
    }
  }
  if (jsonDepth(scene) > maxDepth) {
    throw new SceneLimitError(
      'too-deep',
      `A scene may be at most ${maxDepth} JSON levels deep.`,
    )
  }
}
