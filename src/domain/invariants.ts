import { degreesToRadians } from './units'
import { SceneDocumentSchema, type Entity, type SceneDocument } from './schema'

export type SceneInvariantCode =
  | 'duplicate-id'
  | 'missing-parent'
  | 'parent-cycle'
  | 'dangling-endpoint'
  | 'dangling-port'

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

  scene.connections.forEach((connection, connectionIndex) => {
    registerId(connection.id, `connections[${connectionIndex}].id`)
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

function getRotatedHalfExtents(entity: Entity): { x: number; y: number; z: number } {
  const halfWidth = entity.dimensions.width / 2
  const halfHeight = entity.dimensions.height / 2
  const halfDepth = entity.dimensions.depth / 2
  const x = degreesToRadians(entity.transform.rotation.x)
  const y = degreesToRadians(entity.transform.rotation.y)
  const z = degreesToRadians(entity.transform.rotation.z)
  const sinX = Math.sin(x)
  const cosX = Math.cos(x)
  const sinY = Math.sin(y)
  const cosY = Math.cos(y)
  const sinZ = Math.sin(z)
  const cosZ = Math.cos(z)

  return {
    x:
      Math.abs(cosY * cosZ) * halfWidth +
      Math.abs(-cosY * sinZ) * halfDepth +
      Math.abs(sinY) * halfHeight,
    y:
      Math.abs(sinX * sinY * cosZ + cosX * sinZ) * halfWidth +
      Math.abs(-sinX * sinY * sinZ + cosX * cosZ) * halfDepth +
      Math.abs(sinX * cosY) * halfHeight,
    z:
      Math.abs(-cosX * sinY * cosZ + sinX * sinZ) * halfWidth +
      Math.abs(cosX * sinY * sinZ + sinX * cosZ) * halfDepth +
      Math.abs(cosX * cosY) * halfHeight,
  }
}

function isEntityInsideRoom(entity: Entity, scene: SceneDocument): boolean {
  const halfExtents = getRotatedHalfExtents(entity)
  const { position } = entity.transform

  return (
    Math.abs(position.x) + halfExtents.x <= scene.room.width / 2 &&
    Math.abs(position.y) + halfExtents.y <= scene.room.height / 2 &&
    Math.abs(position.z) + halfExtents.z <= scene.room.depth / 2
  )
}

export function findOutOfBoundsEntityIds(scene: SceneDocument): string[] {
  return scene.entities
    .filter((entity) => !isEntityInsideRoom(entity, scene))
    .map((entity) => entity.id)
}
