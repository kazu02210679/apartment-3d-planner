import { describe, expect, it } from 'vitest'

import {
  classifyCableConnection,
  getCableRouting,
  resolveCableRoute,
  resolvePortWorldAnchor,
} from './connections'
import type { SceneDocument } from './schema'

const scene = {
  id: 'scene',
  format: 'home-lab-scene',
  schemaVersion: 1,
  metadata: {
    name: 'Scene',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    tags: [],
    extensions: {},
  },
  room: {
    id: 'room',
    name: 'Room',
    preset: null,
    width: 4000,
    depth: 4000,
    height: 2400,
    extensions: {},
  },
  entities: [
    {
      id: 'parent',
      kind: 'group',
      name: 'Parent',
      parentId: null,
      transform: { position: { x: 1000, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 90 } },
      dimensions: { width: 1, depth: 1, height: 1 },
      overrides: {},
      ports: [],
      properties: {},
      visible: true,
      locked: false,
      extensions: {},
    },
    {
      id: 'cable',
      kind: 'cable',
      name: 'Cable',
      parentId: 'parent',
      transform: { position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      dimensions: { width: 600, depth: 20, height: 20 },
      catalog: { itemId: 'cable.generic', revision: '1', extensions: {} },
      overrides: {},
      ports: [
        {
          id: 'end-a',
          name: 'End A',
          kind: 'power',
          position: { x: -200, y: 0, z: 0 },
          extensions: { catalogPortId: 'end-a' },
        },
        {
          id: 'end-b',
          name: 'End B',
          kind: 'power',
          position: { x: 200, y: 0, z: 0 },
          extensions: { catalogPortId: 'end-b' },
        },
      ],
      properties: {
        routing: {
          version: 1,
          kind: 'power',
          diameterMm: 8,
          waypoints: [{ id: 'waypoint-1', position: { x: 0, y: 100, z: 0 } }],
        },
      },
      visible: true,
      locked: false,
      extensions: {},
    },
    {
      id: 'target',
      kind: 'computer',
      name: 'Target',
      parentId: null,
      transform: { position: { x: 1500, y: 300, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      dimensions: { width: 200, depth: 200, height: 200 },
      overrides: {},
      ports: [
        {
          id: 'power-in',
          name: 'Power',
          kind: 'power',
          position: { x: 0, y: 0, z: 0 },
          extensions: {},
        },
      ],
      properties: {},
      visible: true,
      locked: false,
      extensions: {},
    },
  ],
  connections: [
    {
      id: 'attach-end-a',
      endpoints: [
        { entityId: 'cable', portId: 'end-a' },
        { entityId: 'target', portId: 'power-in' },
      ],
      kind: 'power',
      properties: {},
      extensions: {},
    },
  ],
  extensions: {},
} as unknown as SceneDocument

describe('cable connection domain helpers', () => {
  it('composes parent rotation and routes attached, waypoint, then free cable endpoints in order', () => {
    expect(resolvePortWorldAnchor(scene, { entityId: 'cable', portId: 'end-b' })).toEqual(
      { x: 1000, y: 300, z: 0 },
    )
    expect(resolveCableRoute(scene, scene.entities[1]!)).toEqual([
      { x: 1500, y: 300, z: 0 },
      { x: 900, y: 100, z: 0 },
      { x: 1000, y: 300, z: 0 },
    ])
  })

  it('uses a bounded, typed routing default for legacy cable entities', () => {
    const legacy = { ...scene.entities[1]!, properties: {} }
    expect(getCableRouting(legacy)).toMatchObject({
      version: 1,
      kind: 'generic',
      waypoints: [],
    })
  })

  it('classifies only pairwise cable-end attachments as canonical and retains legacy nets read-only', () => {
    expect(classifyCableConnection(scene, scene.connections[0]!)).toBe('canonical')
    expect(
      classifyCableConnection(scene, {
        ...scene.connections[0]!,
        id: 'legacy-net',
        endpoints: [
          ...scene.connections[0]!.endpoints,
          { entityId: 'target', portId: 'power-in' },
        ],
      }),
    ).toBe('legacy')
  })

  it('uses only non-cable endpoints for deterministic four-end legacy display routes', () => {
    const displayCable = structuredClone(scene)
    displayCable.entities[1]!.ports[0]!.kind = 'display'
    displayCable.entities[1]!.ports[1]!.kind = 'display'
    displayCable.connections = [
      {
        id: 'legacy-display-network',
        endpoints: [
          { entityId: 'cable', portId: 'end-a' },
          { entityId: 'cable', portId: 'end-b' },
          { entityId: 'target', portId: 'power-in' },
          { entityId: 'target-two', portId: 'network-in' },
        ],
        properties: {},
        extensions: {},
      },
    ]
    displayCable.entities.push({
      ...structuredClone(displayCable.entities[2]!),
      id: 'target-two',
      transform: { position: { x: 1800, y: 400, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      ports: [{ id: 'network-in', name: 'Network', kind: 'network', extensions: {} }],
    })

    expect(resolveCableRoute(displayCable, displayCable.entities[1]!)).toEqual([
      { x: 1500, y: 300, z: 0 },
      { x: 900, y: 100, z: 0 },
      { x: 1800, y: 400, z: 0 },
    ])
  })
})
