import { describe, expect, it } from 'vitest'

import { detailedModelBounds, hasDetailedModel } from './model-layout'

describe('detailed workstation model layouts', () => {
  const dimensions = [1.2, 0.72, 0.7] as const

  it.each([
    'desk.l-shaped-sit-stand',
    'desk.straight',
    'display.monitor',
    'display.information',
    'mount.monitor-arm',
    'light.display',
    'desk.shelf',
    'printer.generic',
    'storage.shelf-cabinet',
    'storage.clothes',
    'computer.windows-tower',
    'computer.mac',
    'computer.mini-pc',
    'seating.chair',
    'sleep.bed-futon',
    'table.side',
    'light.room',
    'waste.trash-bin',
    'power.strip',
  ])('keeps %s geometry inside its resolved local bounds', (itemId) => {
    expect(hasDetailedModel(itemId)).toBe(true)
    expect(detailedModelBounds(itemId, dimensions)).toEqual({
      min: [-0.6, -0.36, -0.35],
      max: [0.6, 0.36, 0.35],
    })
  })

  it('leaves unsupported catalog items on the generic fallback path', () => {
    expect(hasDetailedModel('cable.generic')).toBe(false)
  })
})
