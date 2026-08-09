import { getWorldTransform, transformPoint } from '../commands/math'
import type { Connection, Entity, Port, SceneDocument, Vector3 } from './schema'

export type CableRoutingKind = 'power' | 'display' | 'network' | 'generic'
export interface CableWaypoint {
  readonly id: string
  readonly position: Vector3
}
export interface CableRouting {
  readonly version: 1
  readonly kind: CableRoutingKind
  readonly diameterMm: number
  readonly waypoints: readonly CableWaypoint[]
}
export type CableConnectionClassification = 'canonical' | 'legacy' | 'unrelated'

const DEFAULT_ROUTING: CableRouting = {
  version: 1,
  kind: 'generic',
  diameterMm: 8,
  waypoints: [],
}
const MAX_WAYPOINTS = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function vector(value: unknown, label: string): Vector3 {
  if (!isRecord(value) || !['x', 'y', 'z'].every((key) => Number.isFinite(value[key])))
    throw new Error(`${label} must be a finite local-mm position.`)
  return { x: value.x as number, y: value.y as number, z: value.z as number }
}

export function getCableRouting(entity: Entity): CableRouting {
  const raw = entity.properties.routing
  if (raw === undefined) return DEFAULT_ROUTING
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !['power', 'display', 'network', 'generic'].includes(String(raw.kind))
  )
    throw new Error('Cable routing must use a supported version 1 kind.')
  if (
    typeof raw.diameterMm !== 'number' ||
    !Number.isFinite(raw.diameterMm) ||
    raw.diameterMm <= 0 ||
    raw.diameterMm > 100
  )
    throw new Error('Cable diameter must be a finite value between 0 and 100 mm.')
  if (!Array.isArray(raw.waypoints) || raw.waypoints.length > MAX_WAYPOINTS)
    throw new Error(`Cable routing supports at most ${MAX_WAYPOINTS} waypoints.`)
  const ids = new Set<string>()
  const waypoints = raw.waypoints.map((waypoint, index) => {
    if (
      !isRecord(waypoint) ||
      typeof waypoint.id !== 'string' ||
      waypoint.id.length === 0 ||
      ids.has(waypoint.id)
    )
      throw new Error(`Cable waypoint ${index + 1} must have a unique stable ID.`)
    ids.add(waypoint.id)
    return {
      id: waypoint.id,
      position: vector(waypoint.position, `Cable waypoint ${index + 1}`),
    }
  })
  return {
    version: 1,
    kind: raw.kind as CableRoutingKind,
    diameterMm: raw.diameterMm,
    waypoints,
  }
}

export function withCableRouting(entity: Entity, routing: CableRouting): Entity {
  const serialized = {
    version: routing.version,
    kind: routing.kind,
    diameterMm: routing.diameterMm,
    waypoints: routing.waypoints.map((waypoint) => ({
      id: waypoint.id,
      position: {
        x: waypoint.position.x,
        y: waypoint.position.y,
        z: waypoint.position.z,
      },
    })),
  }
  const checked = getCableRouting({
    ...entity,
    properties: { ...entity.properties, routing: serialized },
  })
  return {
    ...entity,
    properties: {
      ...entity.properties,
      routing: {
        version: checked.version,
        kind: checked.kind,
        diameterMm: checked.diameterMm,
        waypoints: checked.waypoints.map((waypoint) => ({
          id: waypoint.id,
          position: { ...waypoint.position },
        })),
      },
    },
  }
}

function portFor(
  scene: SceneDocument,
  endpoint: { readonly entityId: string; readonly portId: string },
) {
  const entity = scene.entities.find((candidate) => candidate.id === endpoint.entityId)
  const port = entity?.ports.find((candidate) => candidate.id === endpoint.portId)
  if (!entity || !port)
    throw new Error(
      `Connection endpoint ${endpoint.entityId}/${endpoint.portId} is dangling.`,
    )
  return { entity, port }
}

export function isCableEnd(
  scene: SceneDocument,
  endpoint: { readonly entityId: string; readonly portId: string },
) {
  try {
    const { entity, port } = portFor(scene, endpoint)
    return (
      entity.catalog?.itemId === 'cable.generic' &&
      (port.extensions.catalogPortId === 'end-a' ||
        port.extensions.catalogPortId === 'end-b')
    )
  } catch {
    return false
  }
}

export function classifyCableConnection(
  scene: SceneDocument,
  connection: Connection,
): CableConnectionClassification {
  const cableEnds = connection.endpoints.filter((endpoint) => isCableEnd(scene, endpoint))
  if (cableEnds.length === 0) return 'unrelated'
  return connection.endpoints.length === 2 && cableEnds.length === 1
    ? 'canonical'
    : 'legacy'
}

export function resolvePortWorldAnchor(
  scene: SceneDocument,
  endpoint: { readonly entityId: string; readonly portId: string },
): Vector3 {
  const { entity, port } = portFor(scene, endpoint)
  const transform = getWorldTransform(entity.id, scene.entities)
  const offset = transformPoint(transform.rotation, port.position ?? { x: 0, y: 0, z: 0 })
  return {
    x: transform.position.x + offset.x,
    y: transform.position.y + offset.y,
    z: transform.position.z + offset.z,
  }
}

function cablePort(
  entity: Entity,
  catalogPortId: 'end-a' | 'end-b',
  fallbackIndex: number,
): Port | undefined {
  return (
    entity.ports.find((port) => port.extensions.catalogPortId === catalogPortId) ??
    entity.ports[fallbackIndex]
  )
}

function occupiedConnection(
  scene: SceneDocument,
  cableId: string,
  portId: string,
): Connection | undefined {
  return scene.connections.find((connection) =>
    connection.endpoints.some(
      (endpoint) => endpoint.entityId === cableId && endpoint.portId === portId,
    ),
  )
}

export function getCableEndAttachment(
  scene: SceneDocument,
  cableId: string,
  portId: string,
): Connection | undefined {
  return occupiedConnection(scene, cableId, portId)
}

function endpointForCableEnd(scene: SceneDocument, cable: Entity, port: Port): Vector3 {
  const connection = occupiedConnection(scene, cable.id, port.id)
  if (!connection)
    return resolvePortWorldAnchor(scene, { entityId: cable.id, portId: port.id })
  const nonCable = connection.endpoints.filter((endpoint) => !isCableEnd(scene, endpoint))
  const target =
    classifyCableConnection(scene, connection) === 'canonical'
      ? connection.endpoints.find(
          (endpoint) => endpoint.entityId !== cable.id || endpoint.portId !== port.id,
        )
      : nonCable[port.extensions.catalogPortId === 'end-b' ? nonCable.length - 1 : 0]
  return target
    ? resolvePortWorldAnchor(scene, target)
    : resolvePortWorldAnchor(scene, { entityId: cable.id, portId: port.id })
}

export function resolveCableRoute(scene: SceneDocument, cable: Entity): Vector3[] {
  const routing = getCableRouting(cable)
  const first = cablePort(cable, 'end-a', 0)
  const second = cablePort(cable, 'end-b', 1)
  if (!first || !second) throw new Error(`Cable ${cable.id} needs end-a and end-b ports.`)
  const cableWorld = getWorldTransform(cable.id, scene.entities)
  const waypoints = routing.waypoints.map(({ position }) => {
    const offset = transformPoint(cableWorld.rotation, position)
    return {
      x: cableWorld.position.x + offset.x,
      y: cableWorld.position.y + offset.y,
      z: cableWorld.position.z + offset.z,
    }
  })
  return [
    endpointForCableEnd(scene, cable, first),
    ...waypoints,
    endpointForCableEnd(scene, cable, second),
  ]
}
