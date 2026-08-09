import type { SceneDocument } from '../schema'

export function withDuplicateEntityId(scene: SceneDocument): SceneDocument {
  const copy = structuredClone(scene)
  copy.entities.push({ ...structuredClone(copy.entities[0]), id: copy.room.id })
  return copy
}

export function withDanglingConnection(scene: SceneDocument): SceneDocument {
  const copy = structuredClone(scene)
  const [entity] = copy.entities
  if (!entity) throw new Error('The fixture requires an entity.')
  entity.ports = [{ id: `${entity.id}-port`, name: 'Port', extensions: {} }]
  copy.connections = [
    {
      id: 'invalid-connection',
      endpoints: [
        { entityId: entity.id, portId: `${entity.id}-port` },
        { entityId: 'missing-entity', portId: 'missing-port' },
      ],
      properties: {},
      extensions: {},
    },
  ]
  return copy
}
