import { getCatalogDefinition, resolveCatalogDimensions } from '../../catalog/catalog'
import type { CatalogDefinition } from '../../catalog/types'
import { createOpaqueId, type IdFactory } from '../ids'
import { resolveRoomPreset, type RoomPresetInput } from '../room-presets'
import { createEmptyScene, type CreateEmptySceneOptions, type SceneClock } from '../scene'
import type { Entity, SceneDocument } from '../schema'

export type CreateFutureWorkstationSceneOptions = CreateEmptySceneOptions

interface WorkstationEntityOptions {
  readonly itemId: string
  readonly name: string
  readonly presetId?: string
  readonly position: Entity['transform']['position']
  readonly parentId?: string | null
  readonly ports?: readonly string[]
}

function createEntity(nextId: IdFactory, options: WorkstationEntityOptions): Entity {
  const definition: CatalogDefinition = getCatalogDefinition(options.itemId)
  const dimensions = resolveCatalogDimensions(definition, options.presetId)

  return {
    id: createOpaqueId(nextId),
    kind: definition.category,
    name: options.name,
    parentId: options.parentId ?? null,
    transform: { position: options.position, rotation: { x: 0, y: 0, z: 0 } },
    dimensions,
    catalog: {
      itemId: definition.id,
      revision: definition.revision,
      ...(options.presetId ? { presetId: options.presetId } : {}),
      extensions: {},
    },
    overrides: {},
    ports: (options.ports ?? []).map((name) => ({
      id: createOpaqueId(nextId),
      name,
      kind: name,
      extensions: {},
    })),
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

function addConnection(
  scene: SceneDocument,
  nextId: IdFactory,
  kind: string,
  endpoints: readonly [Entity, number][],
): void {
  scene.connections.push({
    id: createOpaqueId(nextId),
    kind,
    endpoints: endpoints.map(([entity, portIndex]) => ({
      entityId: entity.id,
      portId: entity.ports[portIndex].id,
    })),
    properties: {},
    extensions: {},
  })
}

export function createFutureWorkstationScene(
  options?: CreateFutureWorkstationSceneOptions,
): SceneDocument
export function createFutureWorkstationScene(
  preset?: RoomPresetInput,
  options?: CreateFutureWorkstationSceneOptions,
): SceneDocument
export function createFutureWorkstationScene(
  presetOrOptions: RoomPresetInput | CreateFutureWorkstationSceneOptions = '6-tatami',
  providedOptions: CreateFutureWorkstationSceneOptions = {},
): SceneDocument {
  const optionsOnly =
    typeof presetOrOptions === 'object' &&
    presetOrOptions !== null &&
    !('id' in presetOrOptions)
  const options = optionsOnly ? presetOrOptions : providedOptions
  const preset: RoomPresetInput = optionsOnly ? '6-tatami' : presetOrOptions
  const supportedPreset = resolveRoomPreset(preset)
  const now: SceneClock = options.now ?? (() => new Date().toISOString())
  const scene = createEmptyScene(supportedPreset.id, {
    idFactory: options.idFactory,
    now,
  })
  const nextId = options.idFactory ?? (() => crypto.randomUUID())
  const add = (entityOptions: WorkstationEntityOptions) => {
    const entity = createEntity(nextId, entityOptions)
    scene.entities.push(entity)
    return entity
  }

  const desk = add({
    itemId: 'desk.l-shaped-sit-stand',
    name: 'L-shaped sit-stand desk',
    presetId: 'seated',
    position: { x: 0, y: 360, z: 0 },
    ports: ['cable'],
  })
  add({ itemId: 'seating.chair', name: 'Task chair', position: { x: 0, y: 575, z: 900 } })
  const windows = add({
    itemId: 'computer.windows-tower',
    name: 'Windows workstation',
    position: { x: -700, y: 225, z: 250 },
    ports: ['power', 'display', 'network'],
  })
  const mac = add({
    itemId: 'computer.mac',
    name: 'Mac workstation',
    position: { x: 700, y: 30, z: 250 },
    ports: ['power', 'display', 'network'],
  })
  const monitors = Array.from({ length: 4 }, (_, index) =>
    add({
      itemId: 'display.monitor',
      name: `Main monitor ${index + 1}`,
      presetId: 'monitor-27',
      position: { x: -450 + index * 300, y: 1000, z: -250 },
      ports: ['display'],
    }),
  )
  const informationDisplays = Array.from({ length: 2 }, (_, index) =>
    add({
      itemId: 'display.information',
      name: `Side information display ${index + 1}`,
      position: { x: index === 0 ? -1050 : 1050, y: 1000, z: -250 },
      ports: ['display'],
    }),
  )
  Array.from({ length: 6 }, (_, index) =>
    add({
      itemId: 'mount.monitor-arm',
      name: `Monitor arm ${index + 1}`,
      position: { x: -750 + index * 300, y: 950, z: -100 },
    }),
  )
  const displayLights = Array.from({ length: 2 }, (_, index) =>
    add({
      itemId: 'light.display',
      name: `Display light ${index + 1}`,
      position: { x: index === 0 ? -400 : 400, y: 1250, z: -80 },
      ports: ['power'],
    }),
  )
  add({
    itemId: 'desk.shelf',
    name: 'Desk shelf',
    parentId: desk.id,
    position: { x: 0, y: 580, z: -150 },
  })
  add({
    itemId: 'storage.shelf-cabinet',
    name: 'Storage cabinet',
    position: { x: 1050, y: 600, z: 1100 },
  })
  add({
    itemId: 'printer.generic',
    name: 'Printer',
    position: { x: 850, y: 150, z: 500 },
  })
  add({
    itemId: 'waste.trash-bin',
    name: 'Trash bin',
    position: { x: -1050, y: 250, z: 900 },
  })
  const powerStripOne = add({
    itemId: 'power.strip',
    name: 'Power strip one',
    position: { x: -400, y: 35, z: 200 },
    ports: ['outlet'],
  })
  const powerStripTwo = add({
    itemId: 'power.strip',
    name: 'Power strip two',
    position: { x: 400, y: 35, z: 200 },
    ports: ['outlet'],
  })
  const powerCable = add({
    itemId: 'cable.generic',
    name: 'Power cable',
    position: { x: -200, y: 20, z: 300 },
    ports: ['source', 'target'],
  })
  const displayCable = add({
    itemId: 'cable.generic',
    name: 'Display cable',
    position: { x: 0, y: 700, z: -200 },
    ports: ['source', 'target'],
  })
  const networkCable = add({
    itemId: 'cable.generic',
    name: 'Network cable',
    position: { x: 700, y: 30, z: 350 },
    ports: ['source', 'target'],
  })
  add({ itemId: 'sleep.bed-futon', name: 'Futon', position: { x: 700, y: 175, z: 1300 } })
  add({
    itemId: 'table.side',
    name: 'Side table',
    position: { x: -700, y: 250, z: 1300 },
  })
  add({ itemId: 'light.room', name: 'Room light', position: { x: 0, y: 1150, z: 1000 } })
  add({
    itemId: 'storage.clothes',
    name: 'Clothes storage',
    position: { x: 1000, y: 900, z: -1300 },
  })

  addConnection(scene, nextId, 'power', [
    [powerCable, 0],
    [powerStripOne, 0],
    [windows, 0],
  ])
  addConnection(scene, nextId, 'power', [
    [powerStripTwo, 0],
    [mac, 0],
    [displayLights[0], 0],
    [displayLights[1], 0],
  ])
  addConnection(scene, nextId, 'display', [
    [displayCable, 0],
    [windows, 1],
    [displayCable, 1],
    [monitors[0], 0],
  ])
  addConnection(scene, nextId, 'network', [
    [networkCable, 0],
    [windows, 2],
    [networkCable, 1],
    [mac, 2],
  ])
  addConnection(scene, nextId, 'display', [
    [mac, 1],
    [informationDisplays[0], 0],
    [informationDisplays[1], 0],
  ])

  return scene
}
