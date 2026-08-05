import { describe, expect, it, vi } from 'vitest'

import v0Scene from '../domain/fixtures/v0-scene.json'
import { createEmptyScene } from '../domain/scene'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import type { JsonObject, SceneDocument } from '../domain/schema'
import {
  MAX_CONNECTIONS,
  MAX_ENDPOINTS_PER_CONNECTION,
  MAX_ENTITIES,
  MAX_INPUT_BYTES,
  MAX_JSON_DEPTH,
  MAX_PORTS_PER_ENTITY,
  SceneLimitError,
  getJsonDepth,
} from './limits'
import { exportScene } from './export'
import { importScene, SceneImportError } from './import'
import { migrateSceneDocument } from './migrations'

function makeScene(): SceneDocument {
  return createEmptyScene('6-tatami', {
    idFactory: (() => {
      let i = 0
      return () => `import-${++i}`
    })(),
    now: () => '2026-08-06T00:00:00.000Z',
  })
}

function makeEntity(id: string, portCount = 0): SceneDocument['entities'][number] {
  return {
    id,
    kind: 'fixture',
    name: `Entity ${id}`,
    parentId: null,
    transform: {
      position: { x: 0, y: 100, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    dimensions: { width: 10, depth: 10, height: 10 },
    overrides: {},
    ports: Array.from({ length: portCount }, (_, index) => ({
      id: `${id}-port-${index}`,
      name: `Port ${index}`,
      extensions: {},
    })),
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

function makeEntityScene(count: number, portCount = 0): SceneDocument {
  const scene = makeScene()
  scene.entities = Array.from({ length: count }, (_, index) =>
    makeEntity(`entity-${index}`, portCount),
  )
  return scene
}

function makeConnectedScene(connectionCount: number, endpointCount = 2): SceneDocument {
  const scene = makeEntityScene(2, 1)
  scene.connections = Array.from({ length: connectionCount }, (_, index) => ({
    id: `connection-${index}`,
    endpoints: Array.from({ length: endpointCount }, (_, endpointIndex) => ({
      entityId: `entity-${endpointIndex % 2}`,
      portId: `entity-${endpointIndex % 2}-port-0`,
    })),
    properties: {},
    extensions: {},
  }))
  return scene
}

function makeSceneAtDepth(targetDepth: number): SceneDocument {
  const scene = makeScene()
  let nested: JsonObject = {}
  scene.extensions = { nested }
  while (getJsonDepth(scene) < targetDepth) {
    const next: JsonObject = {}
    nested.next = next
    nested = next
  }
  return scene
}

function expectImportFailure(
  input: string | Uint8Array,
  code: SceneImportError['code'],
  limitCode?: SceneLimitError['code'],
): void {
  const replace = vi.fn()
  const result = importScene(input, { replace })
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('Expected the import to fail.')
  expect(result.error).toBeInstanceOf(SceneImportError)
  expect(result.error.code).toBe(code)
  if (limitCode) {
    expect(result.error.cause).toBeInstanceOf(SceneLimitError)
    expect((result.error.cause as SceneLimitError).code).toBe(limitCode)
  }
  expect(replace).not.toHaveBeenCalled()
}

describe('bounded scene import and migration', () => {
  it('migrates v0 sequentially without mutating the fixture or losing references', () => {
    const input = structuredClone(v0Scene)
    const before = structuredClone(input)
    const migrated = migrateSceneDocument(input)
    expect(input).toEqual(before)
    expect(migrated).toMatchObject({
      format: 'home-lab-scene',
      schemaVersion: 1,
      id: 'legacy-scene-1',
      metadata: {
        name: 'Legacy study',
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      },
      room: { width: 2700, depth: 3600, height: 2400 },
    })
    const imported = importScene(JSON.stringify(input))
    expect(imported.ok).toBe(true)
    if (imported.ok) {
      const roundTrip = importScene(exportScene(imported.scene))
      expect(roundTrip.ok).toBe(true)
      if (roundTrip.ok)
        expect(exportScene(imported.scene)).toBe(exportScene(roundTrip.scene))
    }
  })

  it('rejects malformed, wrong-format, future, unsupported, schema, and invariant data transactionally', () => {
    expectImportFailure('{bad', 'malformed-json')
    expectImportFailure(
      JSON.stringify({ format: 'wrong', schemaVersion: 1 }),
      'wrong-format',
    )
    expectImportFailure(
      JSON.stringify({ format: 'home-lab-scene', schemaVersion: 2 }),
      'future-version',
    )
    expectImportFailure(
      JSON.stringify({ format: 'home-lab-scene', schemaVersion: -1 }),
      'unsupported-version',
    )
    expectImportFailure(
      JSON.stringify({ ...makeScene(), entities: [{ id: 'bad' }] }),
      'schema-invalid',
    )

    const invalidInvariant = makeEntityScene(2, 1)
    invalidInvariant.connections = [
      {
        id: 'dangling-connection',
        endpoints: [
          { entityId: 'entity-0', portId: 'entity-0-port-0' },
          { entityId: 'missing-entity', portId: 'missing-port' },
        ],
        properties: {},
        extensions: {},
      },
    ]
    expectImportFailure(JSON.stringify(invalidInvariant), 'invariant-invalid')
    expectImportFailure(new Uint8Array([0xc3, 0x28]), 'invalid-utf8')
  })

  it('accepts exact resource boundaries and rejects one-above with limit errors', () => {
    const exactEntities = makeEntityScene(MAX_ENTITIES)
    expect(importScene(JSON.stringify(exactEntities)).ok).toBe(true)
    expectImportFailure(
      JSON.stringify(makeEntityScene(MAX_ENTITIES + 1)),
      'limit-exceeded',
      'too-many-entities',
    )

    const exactConnections = makeConnectedScene(MAX_CONNECTIONS)
    expect(importScene(JSON.stringify(exactConnections)).ok).toBe(true)
    expectImportFailure(
      JSON.stringify(makeConnectedScene(MAX_CONNECTIONS + 1)),
      'limit-exceeded',
      'too-many-connections',
    )

    const exactPorts = makeEntityScene(1, MAX_PORTS_PER_ENTITY)
    expect(importScene(JSON.stringify(exactPorts)).ok).toBe(true)
    expectImportFailure(
      JSON.stringify(makeEntityScene(1, MAX_PORTS_PER_ENTITY + 1)),
      'limit-exceeded',
      'too-many-ports',
    )

    const exactEndpoints = makeConnectedScene(1, MAX_ENDPOINTS_PER_CONNECTION)
    expect(importScene(JSON.stringify(exactEndpoints)).ok).toBe(true)
    expectImportFailure(
      JSON.stringify(makeConnectedScene(1, MAX_ENDPOINTS_PER_CONNECTION + 1)),
      'limit-exceeded',
      'too-many-endpoints',
    )

    const exactDepth = makeSceneAtDepth(MAX_JSON_DEPTH)
    expect(importScene(JSON.stringify(exactDepth)).ok).toBe(true)
    expectImportFailure(
      JSON.stringify(makeSceneAtDepth(MAX_JSON_DEPTH + 1)),
      'limit-exceeded',
      'too-deep',
    )
  })

  it('rejects oversized UTF-8 input and invokes replacement exactly once for valid input', () => {
    const scene = makeScene()
    const replace = vi.fn()
    const valid = importScene(exportScene(scene), { replace })
    expect(valid.ok).toBe(true)
    expect(replace).toHaveBeenCalledTimes(1)
    expectImportFailure('x'.repeat(MAX_INPUT_BYTES + 1), 'too-large')
  })

  it('accepts the workstation template plus 100 additional valid entities', () => {
    const scene = createFutureWorkstationScene({
      idFactory: (() => {
        let i = 0
        return () => `workstation-workload-${++i}`
      })(),
      now: () => '2026-08-06T00:00:00.000Z',
    })
    const templateEntityCount = scene.entities.length
    scene.entities.push(
      ...Array.from({ length: 100 }, (_, index) => makeEntity(`additional-${index}`)),
    )
    expect(templateEntityCount).toBe(31)
    expect(scene.entities).toHaveLength(templateEntityCount + 100)
    const imported = importScene(exportScene(scene))
    expect(imported.ok).toBe(true)
  })
})
