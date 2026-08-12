import { getCatalogDefinition, resolveCatalogInstance } from '../catalog/catalog'
import { getCableRouting, withCableRouting } from '../domain/connections'
import { findOutOfBoundsEntityIds } from '../domain/invariants'
import { solvePlacement } from '../domain/placement'
import { normalizeScene } from '../domain/normalize'
import type { Connection, Entity, SceneDocument } from '../domain/schema'
import { getWorldTransform, localTransformForWorld } from './math'
import type { CommandResult, SceneCommand } from './types'

function entityAt(scene: SceneDocument, id: string): Entity {
  const entity = scene.entities.find((candidate) => candidate.id === id)
  if (!entity) throw new Error(`Entity ${id} is missing.`)
  return entity
}
function writable(scene: SceneDocument, id: string): Entity {
  const entity = entityAt(scene, id)
  if (entity.locked) throw new Error(`Entity ${id} is locked.`)
  return entity
}
function replaceEntity(scene: SceneDocument, entity: Entity): void {
  const index = scene.entities.findIndex((candidate) => candidate.id === entity.id)
  scene.entities[index] = entity
}
function reconcileCablePortPositions(
  entity: Entity,
  dimensions: Entity['dimensions'],
): Entity {
  if (entity.catalog?.itemId !== 'cable.generic') return { ...entity, dimensions }
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
  return {
    ...entity,
    dimensions,
    ports: entity.ports.map((port) => {
      if (
        port.extensions.catalogPortId !== 'end-a' &&
        port.extensions.catalogPortId !== 'end-b'
      )
        return port
      const position = port.position ?? { x: 0, y: 0, z: 0 }
      return {
        ...port,
        position: {
          x: clamp(position.x, dimensions.width / 2),
          y: clamp(position.y, dimensions.height / 2),
          z: clamp(position.z, dimensions.depth / 2),
        },
      }
    }),
  }
}
function descendants(scene: SceneDocument, rootId: string): Entity[] {
  const ids = new Set([rootId])
  let found = true
  while (found) {
    found = false
    for (const entity of scene.entities)
      if (entity.parentId !== null && ids.has(entity.parentId) && !ids.has(entity.id)) {
        ids.add(entity.id)
        found = true
      }
  }
  return scene.entities.filter((entity) => ids.has(entity.id))
}
function reparent(scene: SceneDocument, id: string, parentId: string | null): void {
  const target = writable(scene, id)
  if (parentId === id) throw new Error('A parent cycle is not allowed.')
  if (parentId !== null) {
    entityAt(scene, parentId)
    if (descendants(scene, id).some((entity) => entity.id === parentId))
      throw new Error('A parent cycle is not allowed.')
  }
  const world = getWorldTransform(id, scene.entities)
  const parent =
    parentId === null ? undefined : getWorldTransform(parentId, scene.entities)
  replaceEntity(scene, {
    ...target,
    parentId,
    transform: localTransformForWorld(world, parent),
  })
}
function catalogEntity(
  command: Extract<SceneCommand, { type: 'add-catalog-entity' }>,
  nextId: () => string,
): Entity {
  const definition = getCatalogDefinition(command.itemId)
  const id = command.id ?? nextId()
  const ports = definition.ports.map((port, index) => ({
    id: command.portIds?.[index] ?? nextId(),
    name: port.displayName.en,
    kind: port.kind,
    ...(port.position ? { position: { ...port.position } } : {}),
    ...(port.direction ? { direction: { ...port.direction } } : {}),
    extensions: { ...port.extensions, catalogPortId: port.id },
  }))
  const candidate: Entity = {
    id,
    kind: definition.category,
    name: command.name ?? definition.displayName.en,
    parentId: command.parentId ?? null,
    transform: command.transform ?? {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    dimensions: { ...definition.defaultDimensions },
    catalog: { itemId: definition.id, revision: definition.revision, extensions: {} },
    overrides: command.overrides ?? {},
    ports,
    properties: command.properties ?? {},
    visible: true,
    locked: false,
    extensions: {},
  }
  const resolved = resolveCatalogInstance(candidate)
  return reconcileCablePortPositions(candidate, resolved.dimensions)
}
function addConnection(scene: SceneDocument, connection: Connection): void {
  if (scene.connections.some((candidate) => candidate.id === connection.id))
    throw new Error(`Connection ${connection.id} already exists.`)
  scene.connections.push(connection)
}

export function applyCommand(
  input: SceneDocument,
  command: SceneCommand,
  nextId: () => string,
): CommandResult {
  const scene = structuredClone(input)
  switch (command.type) {
    case 'add-entity':
      scene.entities.push(structuredClone(command.entity))
      break
    case 'add-catalog-entity':
      scene.entities.push(catalogEntity(command, nextId))
      break
    case 'rename-entity':
      replaceEntity(scene, { ...writable(scene, command.entityId), name: command.name })
      break
    case 'set-visibility':
      replaceEntity(scene, {
        ...writable(scene, command.entityId),
        visible: command.visible,
      })
      break
    case 'set-locked': {
      const target = entityAt(scene, command.entityId)
      if (target.locked && command.locked) break
      replaceEntity(scene, { ...target, locked: command.locked })
      break
    }
    case 'set-transform':
      replaceEntity(scene, {
        ...writable(scene, command.entityId),
        transform: structuredClone(command.transform),
      })
      break
    case 'set-dimensions':
      replaceEntity(
        scene,
        reconcileCablePortPositions(
          writable(scene, command.entityId),
          structuredClone(command.dimensions),
        ),
      )
      break
    case 'set-entity-geometry': {
      const target = writable(scene, command.entityId)
      const candidate = {
        ...target,
        transform: structuredClone(command.transform),
        dimensions: structuredClone(command.dimensions),
        ...(command.catalog
          ? {
              catalog: structuredClone(command.catalog),
              overrides: structuredClone(command.overrides ?? target.overrides),
            }
          : {}),
      }
      if (candidate.catalog) {
        const resolved = resolveCatalogInstance(candidate)
        if (
          resolved.dimensions.width !== command.dimensions.width ||
          resolved.dimensions.depth !== command.dimensions.depth ||
          resolved.dimensions.height !== command.dimensions.height
        )
          throw new Error('Catalog dimensions do not match the interaction draft.')
        replaceEntity(scene, reconcileCablePortPositions(candidate, resolved.dimensions))
      } else replaceEntity(scene, candidate)
      break
    }
    case 'place-entity': {
      const solution = solvePlacement(scene, {
        entityId: command.entityId,
        kind: command.placement,
      })
      if (solution.status === 'unavailable')
        throw new Error(solution.reason ?? 'Placement correction is unavailable.')
      if (solution.status === 'changed' && solution.transform) {
        replaceEntity(scene, {
          ...writable(scene, command.entityId),
          transform: structuredClone(solution.transform),
        })
      }
      break
    }
    case 'set-catalog': {
      const target = writable(scene, command.entityId)
      const definition = getCatalogDefinition(
        command.itemId ?? command.catalog?.itemId ?? target.catalog?.itemId ?? '',
      )
      const catalog = command.catalog ?? {
        itemId: definition.id,
        revision: definition.revision,
        ...(command.presetId === undefined ? {} : { presetId: command.presetId }),
        extensions: target.catalog?.extensions ?? {},
      }
      if (
        (target.catalog?.itemId === 'cable.generic') !==
        (catalog.itemId === 'cable.generic')
      )
        throw new Error('Cable catalog identity cannot be changed.')
      const candidate = {
        ...target,
        catalog,
        overrides: command.overrides ?? target.overrides,
      }
      const resolved = resolveCatalogInstance(candidate)
      replaceEntity(scene, reconcileCablePortPositions(candidate, resolved.dimensions))
      break
    }
    case 'resize-room':
      scene.room = {
        ...scene.room,
        ...structuredClone(command.dimensions),
        ...(command.preset === undefined ? {} : { preset: command.preset }),
      }
      break
    case 'reparent-entity':
      reparent(scene, command.entityId, command.parentId)
      break
    case 'ungroup-entity':
      reparent(scene, command.entityId, null)
      break
    case 'group-entities': {
      scene.entities.push(structuredClone(command.group))
      for (const id of command.entityIds) reparent(scene, id, command.group.id)
      break
    }
    case 'delete-entity': {
      entityAt(scene, command.entityId)
      const subtree = descendants(scene, command.entityId)
      subtree.forEach((entity) => writable(scene, entity.id))
      const ids = new Set(subtree.map((entity) => entity.id))
      scene.entities = scene.entities.filter((entity) => !ids.has(entity.id))
      scene.connections = scene.connections.filter((connection) =>
        connection.endpoints.every((endpoint) => !ids.has(endpoint.entityId)),
      )
      break
    }
    case 'duplicate-entity': {
      entityAt(scene, command.entityId)
      const subtree = descendants(scene, command.entityId)
      subtree.forEach((entity) => writable(scene, entity.id))
      const entityIds = new Map(
        subtree.map((entity) => [
          entity.id,
          entity.id === command.entityId && command.id ? command.id : nextId(),
        ]),
      )
      const portIds = new Map<string, string>()
      const copies = subtree.map((entity) => {
        const copy = {
          ...structuredClone(entity),
          id: entityIds.get(entity.id)!,
          parentId:
            entity.parentId !== null && entityIds.has(entity.parentId)
              ? entityIds.get(entity.parentId)!
              : entity.parentId,
          ports: entity.ports.map((port, portIndex) => {
            const id =
              entity.id === command.entityId && command.portIds?.[portIndex]
                ? command.portIds[portIndex]
                : nextId()
            portIds.set(port.id, id)
            return { ...port, id }
          }),
        }
        if (
          entity.catalog?.itemId === 'cable.generic' &&
          entity.properties.routing !== undefined
        ) {
          const routing = getCableRouting(entity)
          return withCableRouting(copy, {
            ...routing,
            waypoints: routing.waypoints.map((waypoint) => ({
              ...waypoint,
              id: nextId(),
            })),
          })
        }
        return copy
      })
      scene.entities.push(...copies)
      for (const connection of scene.connections.filter((candidate) =>
        candidate.endpoints.every((endpoint) => entityIds.has(endpoint.entityId)),
      ))
        scene.connections.push({
          ...structuredClone(connection),
          id: nextId(),
          endpoints: connection.endpoints.map((endpoint) => ({
            entityId: entityIds.get(endpoint.entityId)!,
            portId: portIds.get(endpoint.portId)!,
          })),
        })
      break
    }
    case 'add-connection':
      addConnection(scene, structuredClone(command.connection))
      break
    case 'update-connection': {
      const index = scene.connections.findIndex(
        (candidate) => candidate.id === command.connectionId,
      )
      if (index < 0) throw new Error(`Connection ${command.connectionId} is missing.`)
      if (command.connection.id !== command.connectionId)
        throw new Error('Connection IDs cannot be changed.')
      scene.connections[index] = structuredClone(command.connection)
      break
    }
    case 'delete-connection': {
      const index = scene.connections.findIndex(
        (candidate) => candidate.id === command.connectionId,
      )
      if (index < 0) throw new Error(`Connection ${command.connectionId} is missing.`)
      scene.connections.splice(index, 1)
      break
    }
    case 'set-cable-routing': {
      const cable = writable(scene, command.entityId)
      if (cable.catalog?.itemId !== 'cable.generic')
        throw new Error('Only cable.generic entities can have cable routing.')
      replaceEntity(scene, withCableRouting(cable, command.routing))
      break
    }
    case 'set-cable-port-position': {
      const cable = writable(scene, command.entityId)
      if (cable.catalog?.itemId !== 'cable.generic')
        throw new Error('Only cable.generic entities can move cable ends.')
      const port = cable.ports.find((candidate) => candidate.id === command.portId)
      if (!port)
        throw new Error(`Port ${command.portId} is missing on cable ${cable.id}.`)
      if (
        port.extensions.catalogPortId !== 'end-a' &&
        port.extensions.catalogPortId !== 'end-b'
      )
        throw new Error('Only cable end ports can be repositioned.')
      if (
        Math.abs(command.position.x) > cable.dimensions.width / 2 ||
        Math.abs(command.position.y) > cable.dimensions.height / 2 ||
        Math.abs(command.position.z) > cable.dimensions.depth / 2
      )
        throw new Error('Cable end position must stay inside the cable dimensions.')
      replaceEntity(scene, {
        ...cable,
        ports: cable.ports.map((candidate) =>
          candidate.id === port.id
            ? { ...candidate, position: structuredClone(command.position) }
            : candidate,
        ),
      })
      break
    }
  }
  const normalized = normalizeScene(scene)
  return { scene: normalized, outOfBoundsEntityIds: findOutOfBoundsEntityIds(normalized) }
}
