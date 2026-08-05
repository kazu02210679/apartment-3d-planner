import { describe, expect, it, vi } from 'vitest'

import v0Scene from '../domain/fixtures/v0-scene.json'
import { createEmptyScene } from '../domain/scene'
import type { SceneDocument } from '../domain/schema'
import {
  MAX_CONNECTIONS,
  MAX_ENDPOINTS_PER_CONNECTION,
  MAX_ENTITIES,
  MAX_INPUT_BYTES,
  MAX_JSON_DEPTH,
  MAX_PORTS_PER_ENTITY,
} from './limits'
import { exportScene } from './export'
import { importScene } from './import'
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

  it('rejects malformed, wrong-format, future, unsupported, and invalid documents transactionally', () => {
    const replace = vi.fn()
    for (const input of [
      '{bad',
      JSON.stringify({ format: 'wrong', schemaVersion: 1 }),
      JSON.stringify({ format: 'home-lab-scene', schemaVersion: 2 }),
      JSON.stringify({ format: 'home-lab-scene', schemaVersion: -1 }),
      JSON.stringify({ ...makeScene(), entities: [{ id: 'bad' }] }),
    ]) {
      const result = importScene(input, { replace })
      expect(result.ok).toBe(false)
    }
    expect(replace).not.toHaveBeenCalled()
  })

  it('rejects resource and nesting limits before replacement', () => {
    const scene = makeScene()
    scene.entities = Array.from({ length: MAX_ENTITIES + 1 }, (_, index) => ({
      ...structuredClone(scene.entities[0]),
      id: `entity-${index}`,
    }))
    const replace = vi.fn()
    expect(importScene(JSON.stringify(scene), { replace }).ok).toBe(false)
    expect(replace).not.toHaveBeenCalled()

    const connectionScene = makeScene()
    connectionScene.connections = Array.from(
      { length: MAX_CONNECTIONS + 1 },
      (_, index) => ({
        id: `connection-${index}`,
        endpoints: [],
        properties: {},
        extensions: {},
      }),
    )
    expect(importScene(JSON.stringify(connectionScene)).ok).toBe(false)

    const endpointScene = makeScene()
    const endpointEntity = {
      ...structuredClone(endpointScene.entities[0]),
      id: 'endpoint-entity',
      ports: [{ id: 'endpoint-port', name: 'Endpoint', extensions: {} }],
    }
    endpointScene.entities = [endpointEntity]
    endpointScene.connections = [
      {
        id: 'endpoint-connection',
        endpoints: Array.from({ length: MAX_ENDPOINTS_PER_CONNECTION + 1 }, () => ({
          entityId: endpointEntity.id,
          portId: 'endpoint-port',
        })),
        properties: {},
        extensions: {},
      },
    ]
    expect(importScene(JSON.stringify(endpointScene)).ok).toBe(false)

    const portScene = makeScene()
    portScene.entities = [
      {
        ...structuredClone(portScene.entities[0]),
        id: 'port-entity',
        ports: Array.from({ length: MAX_PORTS_PER_ENTITY + 1 }, (_, index) => ({
          id: `port-${index}`,
          name: `Port ${index}`,
          extensions: {},
        })),
      },
    ]
    expect(importScene(JSON.stringify(portScene)).ok).toBe(false)

    const deep = {
      ...scene,
      extensions: { deep: { deeper: { deepest: { value: true } } } },
    }
    expect(importScene(JSON.stringify(deep), { maxJsonDepth: 2 }).ok).toBe(false)
    expect(MAX_JSON_DEPTH).toBeGreaterThan(0)
  })

  it('rejects oversized UTF-8 input and invokes replacement exactly once for valid input', () => {
    const scene = makeScene()
    const replace = vi.fn()
    const valid = importScene(exportScene(scene), { replace })
    expect(valid.ok).toBe(true)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(importScene('x'.repeat(MAX_INPUT_BYTES + 1)).ok).toBe(false)
  })
})
