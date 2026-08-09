import { degreesToRadians } from './units'
import { classifyCableConnection, getCableRouting, isCableEnd } from './connections'
import { SceneDocumentSchema, type Entity, type SceneDocument } from './schema'

export type SceneInvariantCode =
  | 'duplicate-id'
  | 'missing-parent'
  | 'parent-cycle'
  | 'dangling-endpoint'
  | 'dangling-port'
  | 'invalid-routing'
  | 'routing-on-noncable'
  | 'duplicate-cable-attachment'
  | 'duplicate-endpoint-pair'
  | 'invalid-cable-attachment'
  | 'incompatible-cable-attachment'

export interface SceneInvariantIssue {
  code: SceneInvariantCode
  path: string
  message: string
}

export class SceneInvariantError extends Error {
  readonly issues: readonly SceneInvariantIssue[]

  constructor(issues: readonly SceneInvariantIssue[]) {
    super(
      issues
        .map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`)
        .join('\n'),
    )
    this.name = 'SceneInvariantError'
    this.issues = issues
  }
}

export function collectSceneInvariantIssues(scene: SceneDocument): SceneInvariantIssue[] {
  const issues: SceneInvariantIssue[] = []
  const owners = new Map<string, string>()

  const registerId = (id: string, path: string) => {
    const previousPath = owners.get(id)

    if (previousPath) {
      issues.push({
        code: 'duplicate-id',
        path,
        message: `ID ${id} is already used at ${previousPath}.`,
      })
      return
    }

    owners.set(id, path)
  }

  registerId(scene.id, 'id')
  registerId(scene.room.id, 'room.id')

  const entityById = new Map<string, Entity>()

  scene.entities.forEach((entity, entityIndex) => {
    const entityPath = `entities[${entityIndex}]`
    registerId(entity.id, `${entityPath}.id`)
    entityById.set(entity.id, entity)

    entity.ports.forEach((port, portIndex) => {
      registerId(port.id, `${entityPath}.ports[${portIndex}].id`)
    })
  })

  scene.entities.forEach((entity, entityIndex) => {
    if (entity.catalog?.itemId === 'cable.generic') {
      try {
        getCableRouting(entity)
      } catch (error) {
        issues.push({
          code: 'invalid-routing',
          path: `entities[${entityIndex}].properties.routing`,
          message: error instanceof Error ? error.message : 'Cable routing is invalid.',
        })
      }
    } else if (entity.properties.routing !== undefined) {
      issues.push({
        code: 'routing-on-noncable',
        path: `entities[${entityIndex}].properties.routing`,
        message: 'Only cable.generic entities may persist routing data.',
      })
    }
  })

  scene.connections.forEach((connection, connectionIndex) => {
    registerId(connection.id, `connections[${connectionIndex}].id`)
  })

  const occupiedCableEnds = new Set<string>()
  const canonicalPairs = new Set<string>()
  scene.connections.forEach((connection, connectionIndex) => {
    const classification = classifyCableConnection(scene, connection)
    const cableEntityEndpoints = connection.endpoints.filter(
      (endpoint) =>
        entityById.get(endpoint.entityId)?.catalog?.itemId === 'cable.generic',
    )
    const cableEndpoints = connection.endpoints.filter((endpoint) =>
      isCableEnd(scene, endpoint),
    )
    if (
      connection.endpoints.length === 2 &&
      cableEntityEndpoints.length > 0 &&
      (cableEntityEndpoints.length !== 1 || cableEndpoints.length !== 1)
    ) {
      issues.push({
        code: 'invalid-cable-attachment',
        path: `connections[${connectionIndex}].endpoints`,
        message: 'A cable end may only connect to a non-cable target.',
      })
    }
    for (const cableEndpoint of cableEndpoints) {
      const key = `${cableEndpoint.entityId}/${cableEndpoint.portId}`
      if (occupiedCableEnds.has(key)) {
        issues.push({
          code: 'duplicate-cable-attachment',
          path: `connections[${connectionIndex}].endpoints`,
          message: `Cable end ${key} already has an attachment or legacy-net membership.`,
        })
      }
      occupiedCableEnds.add(key)
    }
    if (classification !== 'canonical') return
    const cableEndpoint = connection.endpoints.find((endpoint) => {
      const entity = entityById.get(endpoint.entityId)
      return entity?.catalog?.itemId === 'cable.generic'
    })!
    const targetEndpoint = connection.endpoints.find(
      (endpoint) => endpoint !== cableEndpoint,
    )!
    const pair = [
      `${cableEndpoint.entityId}/${cableEndpoint.portId}`,
      `${targetEndpoint.entityId}/${targetEndpoint.portId}`,
    ]
      .sort()
      .join('|')
    if (canonicalPairs.has(pair)) {
      issues.push({
        code: 'duplicate-endpoint-pair',
        path: `connections[${connectionIndex}].endpoints`,
        message: `Connection endpoint pair ${pair} already exists.`,
      })
    }
    canonicalPairs.add(pair)
    const cable = entityById.get(cableEndpoint.entityId)!
    const target = entityById.get(targetEndpoint.entityId)
    const targetPort = target?.ports.find((port) => port.id === targetEndpoint.portId)
    try {
      const routing = getCableRouting(cable)
      if (routing.kind !== 'generic' && targetPort?.kind !== routing.kind)
        issues.push({
          code: 'incompatible-cable-attachment',
          path: `connections[${connectionIndex}].endpoints`,
          message: `${routing.kind} cable cannot attach to ${targetPort?.kind ?? 'unknown'} port.`,
        })
    } catch {
      // The routing issue is already reported by the entity validation pass.
    }
  })

  scene.entities.forEach((entity, entityIndex) => {
    if (entity.parentId !== null && !entityById.has(entity.parentId)) {
      issues.push({
        code: 'missing-parent',
        path: `entities[${entityIndex}].parentId`,
        message: `Parent ${entity.parentId} does not exist.`,
      })
    }
  })

  const reportedCycles = new Set<string>()

  scene.entities.forEach((entity, entityIndex) => {
    const visited = new Set<string>()
    let currentId: string | null = entity.id

    while (currentId !== null) {
      if (visited.has(currentId)) {
        const cycleKey = [...visited].sort().join('|')

        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey)
          issues.push({
            code: 'parent-cycle',
            path: `entities[${entityIndex}].parentId`,
            message: `Parent hierarchy contains a cycle involving ${currentId}.`,
          })
        }
        break
      }

      visited.add(currentId)
      const currentEntity = entityById.get(currentId)

      if (!currentEntity) {
        break
      }

      currentId = currentEntity.parentId
    }
  })

  scene.connections.forEach((connection, connectionIndex) => {
    connection.endpoints.forEach((endpoint, endpointIndex) => {
      const endpointPath = `connections[${connectionIndex}].endpoints[${endpointIndex}]`
      const entity = entityById.get(endpoint.entityId)

      if (!entity) {
        issues.push({
          code: 'dangling-endpoint',
          path: endpointPath,
          message: `Entity ${endpoint.entityId} does not exist.`,
        })
        return
      }

      if (!entity.ports.some((port) => port.id === endpoint.portId)) {
        issues.push({
          code: 'dangling-port',
          path: `${endpointPath}.portId`,
          message: `Port ${endpoint.portId} does not exist on entity ${endpoint.entityId}.`,
        })
      }
    })
  })

  return issues
}

export function validateSceneInvariants(input: unknown): SceneDocument {
  const scene = SceneDocumentSchema.parse(input)
  const issues = collectSceneInvariantIssues(scene)

  if (issues.length > 0) {
    throw new SceneInvariantError(issues)
  }

  return scene
}

type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

function createRotationMatrix(rotation: Entity['transform']['rotation']): Matrix3 {
  const x = degreesToRadians(rotation.x)
  const y = degreesToRadians(rotation.y)
  const z = degreesToRadians(rotation.z)
  const sinX = Math.sin(x)
  const cosX = Math.cos(x)
  const sinY = Math.sin(y)
  const cosY = Math.cos(y)
  const sinZ = Math.sin(z)
  const cosZ = Math.cos(z)

  return [
    cosY * cosZ,
    cosZ * sinX * sinY - cosX * sinZ,
    sinX * sinZ + cosX * cosZ * sinY,
    cosY * sinZ,
    cosX * cosZ + sinX * sinY * sinZ,
    cosX * sinY * sinZ - cosZ * sinX,
    -sinY,
    cosY * sinX,
    cosX * cosY,
  ]
}

function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ]
}

function transformPoint(matrix: Matrix3, point: Entity['transform']['position']) {
  return {
    x: matrix[0] * point.x + matrix[1] * point.y + matrix[2] * point.z,
    y: matrix[3] * point.x + matrix[4] * point.y + matrix[5] * point.z,
    z: matrix[6] * point.x + matrix[7] * point.y + matrix[8] * point.z,
  }
}

function addPoints(
  left: Entity['transform']['position'],
  right: Entity['transform']['position'],
) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  }
}

function getRotatedHalfExtents(entity: Entity, worldRotation: Matrix3) {
  const halfWidth = entity.dimensions.width / 2
  const halfHeight = entity.dimensions.height / 2
  const halfDepth = entity.dimensions.depth / 2

  return {
    x:
      Math.abs(worldRotation[0]) * halfWidth +
      Math.abs(worldRotation[1]) * halfHeight +
      Math.abs(worldRotation[2]) * halfDepth,
    y:
      Math.abs(worldRotation[3]) * halfWidth +
      Math.abs(worldRotation[4]) * halfHeight +
      Math.abs(worldRotation[5]) * halfDepth,
    z:
      Math.abs(worldRotation[6]) * halfWidth +
      Math.abs(worldRotation[7]) * halfHeight +
      Math.abs(worldRotation[8]) * halfDepth,
  }
}

interface WorldTransform {
  position: Entity['transform']['position']
  rotation: Matrix3
}

function getWorldTransform(
  entityId: string,
  entityById: ReadonlyMap<string, Entity>,
  cache: Map<string, WorldTransform>,
  visiting: Set<string>,
): WorldTransform {
  const cached = cache.get(entityId)

  if (cached) {
    return cached
  }

  if (visiting.has(entityId)) {
    throw new Error(`Cannot compose a cyclic parent hierarchy at entity ${entityId}.`)
  }

  const entity = entityById.get(entityId)

  if (!entity) {
    throw new Error(`Cannot compose a missing parent entity ${entityId}.`)
  }

  visiting.add(entityId)
  const localRotation = createRotationMatrix(entity.transform.rotation)
  let worldTransform: WorldTransform

  if (entity.parentId === null) {
    worldTransform = {
      position: { ...entity.transform.position },
      rotation: localRotation,
    }
  } else {
    const parentTransform = getWorldTransform(
      entity.parentId,
      entityById,
      cache,
      visiting,
    )
    const translatedPosition = transformPoint(
      parentTransform.rotation,
      entity.transform.position,
    )

    worldTransform = {
      position: addPoints(parentTransform.position, translatedPosition),
      rotation: multiplyMatrices(parentTransform.rotation, localRotation),
    }
  }

  visiting.delete(entityId)
  cache.set(entityId, worldTransform)

  return worldTransform
}

function isEntityInsideRoom(
  entity: Entity,
  scene: SceneDocument,
  worldTransform: WorldTransform,
): boolean {
  const halfExtents = getRotatedHalfExtents(entity, worldTransform.rotation)
  const { position } = worldTransform

  return (
    Math.abs(position.x) + halfExtents.x <= scene.room.width / 2 &&
    Math.abs(position.y) + halfExtents.y <= scene.room.height / 2 &&
    Math.abs(position.z) + halfExtents.z <= scene.room.depth / 2
  )
}

export function findOutOfBoundsEntityIds(scene: SceneDocument): string[] {
  const entityById = new Map(scene.entities.map((entity) => [entity.id, entity]))
  const cache = new Map<string, WorldTransform>()

  return scene.entities
    .filter(
      (entity) =>
        !isEntityInsideRoom(
          entity,
          scene,
          getWorldTransform(entity.id, entityById, cache, new Set<string>()),
        ),
    )
    .map((entity) => entity.id)
}
