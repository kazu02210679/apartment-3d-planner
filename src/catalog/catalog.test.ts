import { describe, expect, it } from 'vitest'

import {
  CATALOG_DEFINITIONS,
  getCatalogDefinition,
  resetCatalogOverrides,
  resolveCatalogInstance,
  resolveCatalogDimensions,
} from './catalog'
import { calculateSixteenByNinePanelDimensions } from './dimensions'
import type { Entity, JsonObject } from '../domain/schema'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'

function templateEntity(itemId: string) {
  const scene = createFutureWorkstationScene({
    idFactory: (() => {
      let index = 0
      return () => `catalog-test-id-${++index}`
    })(),
    now: () => '2026-08-06T00:00:00.000Z',
  })
  const entity = scene.entities.find((candidate) => candidate.catalog?.itemId === itemId)

  if (!entity) {
    throw new Error(`Expected template entity ${itemId}`)
  }

  return entity
}

describe('generic catalog', () => {
  it('covers the renderer-independent generic equipment categories', () => {
    const ids = new Set(CATALOG_DEFINITIONS.map((definition) => definition.id))

    expect([...ids]).toEqual(
      expect.arrayContaining([
        'room.floor',
        'room.wall',
        'room.basic',
        'desk.l-shaped-sit-stand',
        'desk.straight',
        'desk.shelf',
        'storage.shelf-cabinet',
        'seating.chair',
        'computer.windows-tower',
        'computer.mac',
        'computer.mini-pc',
        'display.monitor',
        'display.information',
        'mount.monitor-arm',
        'light.display',
        'printer.generic',
        'power.strip',
        'cable.generic',
        'waste.trash-bin',
        'sleep.bed-futon',
        'table.side',
        'light.room',
        'storage.clothes',
      ]),
    )
    expect(getCatalogDefinition('display.monitor').geometry.kind).toBe('panel-with-stand')
    expect(JSON.parse(JSON.stringify(CATALOG_DEFINITIONS))).toEqual(CATALOG_DEFINITIONS)
    expect(Object.isFrozen(CATALOG_DEFINITIONS[0])).toBe(true)
  })

  it('defines stable local port anchors and copies them into catalog instances', () => {
    const cable = getCatalogDefinition('cable.generic')
    const endA = cable.ports.find((port) => port.id === 'end-a')
    const endB = cable.ports.find((port) => port.id === 'end-b')
    const templateCable = templateEntity('cable.generic')

    expect(endA?.position).toEqual({ x: -450, y: 0, z: 0 })
    expect(endB?.position).toEqual({ x: 450, y: 0, z: 0 })
    expect(templateCable.ports.map((port) => port.position)).toEqual(
      cable.ports.map((port) => port.position),
    )
  })

  it('resolves definition defaults, then preset, then instance override', () => {
    const monitor = getCatalogDefinition('display.monitor')

    expect(resolveCatalogDimensions(monitor)).toEqual({
      width: 598,
      depth: 220,
      height: 456,
    })
    expect(resolveCatalogDimensions(monitor, 'monitor-32')).toEqual({
      width: 708,
      depth: 220,
      height: 518,
    })
    expect(
      resolveCatalogDimensions('desk.l-shaped-sit-stand', 'standing', { width: 1900 }),
    ).toEqual({
      width: 1900,
      depth: 1400,
      height: 1100,
    })
  })

  it('resets a canonical nested override leaf without mutation and prunes empty parents', () => {
    const entity = {
      id: 'desk-instance-01',
      overrides: {
        dimensions: { width: 1900, height: 1100 },
        geometry: { lDesk: { returnSide: 'left' } },
        materialId: 'wood',
      },
    }
    const before = structuredClone(entity)

    expect(resetCatalogOverrides(entity, 'dimensions.width')).toEqual({
      id: 'desk-instance-01',
      overrides: {
        dimensions: { height: 1100 },
        geometry: { lDesk: { returnSide: 'left' } },
        materialId: 'wood',
      },
    })
    expect(entity).toEqual(before)
    expect(
      resetCatalogOverrides(
        { id: entity.id, overrides: { dimensions: { width: 1900 } } },
        'dimensions.width',
      ),
    ).toEqual({ id: entity.id, overrides: {} })
    expect(() => resetCatalogOverrides(entity, 'dimensions.radius')).toThrow(
      'Unsupported',
    )
    expect(resetCatalogOverrides(entity)).toEqual({
      id: 'desk-instance-01',
      overrides: {},
    })
  })

  it('calculates 16:9 monitor panels from diagonal inches using millimetres', () => {
    const expected = [
      [24, 531, 299],
      [27, 598, 336],
      [32, 708, 398],
    ] as const

    for (const [diagonalInches, width, height] of expected) {
      const panel = calculateSixteenByNinePanelDimensions(diagonalInches)

      expect(panel.width).toBeCloseTo(width, 0)
      expect(panel.height).toBeCloseTo(height, 0)
      expect(Math.abs(panel.width - width)).toBeLessThanOrEqual(1)
      expect(Math.abs(panel.height - height)).toBeLessThanOrEqual(1)
    }
  })

  it('changes the L-desk variant dimensions while preserving the instance ID', () => {
    const desk = templateEntity('desk.l-shaped-sit-stand')
    const seated = resolveCatalogInstance(desk)
    const standing = resolveCatalogInstance({
      ...desk,
      catalog: { ...desk.catalog!, presetId: 'standing' },
    })
    const freeHeight = resolveCatalogInstance({
      ...desk,
      catalog: { ...desk.catalog!, presetId: 'free-height' },
      overrides: {
        dimensions: { height: 930 },
        geometry: {
          lDesk: {
            mainTop: { width: 2000, depth: 750 },
            returnTop: { width: 1200, depth: 650 },
            returnSide: 'left',
          },
        },
      },
    })

    expect(seated.dimensions).toEqual({
      width: 1800,
      depth: 1400,
      height: 720,
    })
    expect(seated).toMatchObject({
      id: desk.id,
      materialId: 'laminate',
      properties: {},
      capabilities: ['sit-stand', 'l-shaped'],
      inspectorFields: [{ id: 'return-side' }],
      portDefinitions: [{ id: 'cable-tray' }],
    })
    expect(standing.dimensions).toEqual({
      width: 1800,
      depth: 1400,
      height: 1100,
    })
    expect(freeHeight.id).toBe(desk.id)
    expect(freeHeight.dimensions.height).toBe(930)
    expect(freeHeight.geometry).toMatchObject({
      kind: 'l-desk',
      mainTop: { width: 2000, depth: 750 },
      returnTop: { width: 1200, depth: 650 },
      returnSide: 'left',
    })
  })

  it('resolves each monitor preset into a panel and stand-inclusive device dimensions', () => {
    const monitor = templateEntity('display.monitor')
    const expected = [
      ['monitor-24', 531, 299],
      ['monitor-27', 598, 336],
      ['monitor-32', 708, 398],
    ] as const

    for (const [presetId, width, panelHeight] of expected) {
      const resolved = resolveCatalogInstance({
        ...monitor,
        catalog: { ...monitor.catalog!, presetId },
      })

      expect(resolved.geometry).toMatchObject({
        kind: 'panel-with-stand',
        panel: { width, height: panelHeight },
      })
      expect(resolved.dimensions.width).toBe(width)
      expect(resolved.dimensions.height).toBeGreaterThan(panelHeight)
      if (resolved.geometry.kind !== 'panel-with-stand') {
        throw new Error('Expected a panel-with-stand monitor geometry.')
      }
      expect(Math.abs(resolved.geometry.panel.width - width)).toBeLessThanOrEqual(1)
      expect(Math.abs(resolved.geometry.panel.height - panelHeight)).toBeLessThanOrEqual(
        1,
      )
    }
  })

  it('supports a custom monitor size without dropping its catalog reference', () => {
    const monitor = templateEntity('display.monitor')
    const resolved = resolveCatalogInstance({
      ...monitor,
      overrides: {
        dimensions: { width: 620, depth: 210, height: 470 },
        geometry: { panel: { width: 620, height: 350 } },
      },
    })

    expect(resolved.catalog.itemId).toBe('display.monitor')
    expect(resolved.dimensions).toEqual({ width: 620, depth: 210, height: 470 })
    expect(resolved.geometry).toEqual({
      kind: 'panel-with-stand',
      panel: { width: 620, height: 350 },
    })
  })

  it('enforces fixed, bounded, and free dimension policies during instance resolution', () => {
    const monitorArm = templateEntity('mount.monitor-arm')
    const desk = templateEntity('desk.l-shaped-sit-stand')
    const cable = templateEntity('cable.generic')

    expect(() =>
      resolveCatalogInstance({
        ...monitorArm,
        overrides: { dimensions: { width: 700 } },
      }),
    ).toThrow('fixed')
    expect(() =>
      resolveCatalogInstance({ ...desk, overrides: { dimensions: { height: 1300 } } }),
    ).toThrow('outside allowed')
    expect(() =>
      resolveCatalogInstance({ ...cable, overrides: { dimensions: { width: 0 } } }),
    ).toThrow('positive')
    expect(
      resolveCatalogInstance({ ...cable, overrides: { dimensions: { width: 2400 } } })
        .dimensions.width,
    ).toBe(2400)
  })

  it('rejects catalog revision mismatches before resolving an instance', () => {
    const desk = templateEntity('desk.l-shaped-sit-stand')

    expect(resolveCatalogInstance(desk).id).toBe(desk.id)
    expect(() =>
      resolveCatalogInstance({
        ...desk,
        catalog: { ...desk.catalog!, revision: 'outdated-revision' },
      }),
    ).toThrow('revision mismatch')
  })

  it('rejects unknown and malformed canonical nested override fields', () => {
    const desk = templateEntity('desk.l-shaped-sit-stand')
    const monitor = templateEntity('display.monitor')
    const invalidOverrides: readonly [Entity, JsonObject][] = [
      [desk, { dimensions: { widht: 1900 } }],
      [desk, { geometry: { angle: 90 } }],
      [desk, { geometry: { lDesk: { returnSde: 'left' } } }],
      [desk, { geometry: { lDesk: { mainTop: { widht: 1900 } } } }],
      [desk, { geometry: { lDesk: { returnTop: { deph: 700 } } } }],
      [monitor, { geometry: { panel: { widht: 600 } } }],
      [desk, { geometry: { lDesk: 3 } }],
      [desk, { geometry: { lDesk: { mainTop: 3 } } }],
      [desk, { geometry: { lDesk: { returnTop: 3 } } }],
      [monitor, { geometry: { panel: 3 } }],
    ]

    for (const [entity, overrides] of invalidOverrides) {
      expect(() => resolveCatalogInstance({ ...entity, overrides })).toThrow(
        'Unsupported',
      )
    }
  })

  it('resolves optional placement profiles without changing canonical entities', () => {
    const monitor = resolveCatalogInstance(templateEntity('display.monitor'))
    const desk = resolveCatalogInstance(templateEntity('desk.l-shaped-sit-stand'))
    const cabinet = resolveCatalogInstance(templateEntity('storage.shelf-cabinet'))
    const plain = resolveCatalogInstance(templateEntity('computer.mac'))

    expect(monitor.placement).toMatchObject({
      contactPlane: 'bottom',
      allowedTargetClasses: ['floor', 'support-surface'],
      preferredTargetClass: 'support-surface',
    })
    expect(desk.placement.supportSurfaces.map((surface) => surface.id)).toEqual([
      'main-top',
      'return-top',
    ])
    expect(desk.placement).toMatchObject({
      allowedTargetClasses: ['floor'],
      preferredTargetClass: 'floor',
    })
    expect(cabinet.placement.supportSurfaces[0]).toMatchObject({
      id: 'interior-shelf-low',
      usableClearanceHeight: expect.any(Number),
    })
    expect(cabinet.placement).toMatchObject({
      allowedTargetClasses: ['floor'],
      preferredTargetClass: 'floor',
    })
    expect(plain.placement).toMatchObject({
      allowedTargetClasses: ['floor'],
      preferredTargetClass: 'floor',
      supportSurfaces: [],
    })
    expect(templateEntity('desk.l-shaped-sit-stand')).not.toHaveProperty('placement')
  })

  it('derives L-desk support surfaces from the resolved rendered footprint', () => {
    const defaultDesk = resolveCatalogInstance(templateEntity('desk.l-shaped-sit-stand'))
    expect(defaultDesk.placement.supportSurfaces).toEqual([
      {
        id: 'main-top',
        center: { x: 0, y: 360, z: -275 },
        width: 1800,
        depth: 700,
      },
      {
        id: 'return-top',
        center: { x: 200, y: 360, z: 325 },
        width: 1400,
        depth: 600,
      },
    ])

    const customLeft = templateEntity('desk.l-shaped-sit-stand')
    customLeft.overrides = {
      dimensions: { width: 1500, depth: 1000, height: 800 },
      geometry: {
        lDesk: {
          mainTop: { width: 1600, depth: 800 },
          returnTop: { width: 900, depth: 500 },
          returnSide: 'left',
        },
      },
    }
    const leftDesk = resolveCatalogInstance(customLeft)
    expect(leftDesk.placement.supportSurfaces).toEqual([
      {
        id: 'main-top',
        center: { x: 0, y: 400, z: -180 },
        width: 1280,
        depth: 640,
      },
      {
        id: 'return-top',
        center: { x: -280, y: 400, z: 300 },
        width: 720,
        depth: 400,
      },
    ])
  })
})
