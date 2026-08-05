import { describe, expect, it } from 'vitest'

import {
  CATALOG_DEFINITIONS,
  getCatalogDefinition,
  resetCatalogOverrides,
  resolveCatalogDimensions,
} from './catalog'
import { calculateSixteenByNinePanelDimensions } from './dimensions'

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

  it('resolves definition defaults, then preset, then instance override', () => {
    const monitor = getCatalogDefinition('display.monitor')

    expect(resolveCatalogDimensions(monitor)).toEqual({
      width: 598,
      depth: 220,
      height: 336,
    })
    expect(resolveCatalogDimensions(monitor, 'monitor-32')).toEqual({
      width: 708,
      depth: 220,
      height: 398,
    })
    expect(
      resolveCatalogDimensions(monitor, 'monitor-32', { width: 700, depth: 260 }),
    ).toEqual({ width: 700, depth: 260, height: 398 })
  })

  it('resets selected overrides without changing the entity identity', () => {
    const entity = {
      id: 'desk-instance-01',
      overrides: { width: 1900, height: 1100, finish: 'walnut' },
    }

    expect(resetCatalogOverrides(entity, 'width')).toEqual({
      id: 'desk-instance-01',
      overrides: { height: 1100, finish: 'walnut' },
    })
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
    const desk = getCatalogDefinition('desk.l-shaped-sit-stand')
    const entity = { id: 'l-desk-01', overrides: {} }

    expect(desk.geometry.kind).toBe('l-desk')
    expect(resolveCatalogDimensions(desk, 'seated')).toEqual({
      width: 1800,
      depth: 1400,
      height: 720,
    })
    expect(resolveCatalogDimensions(desk, 'standing')).toEqual({
      width: 1800,
      depth: 1400,
      height: 1100,
    })
    expect(resetCatalogOverrides(entity)).toMatchObject({ id: 'l-desk-01' })
  })
})
