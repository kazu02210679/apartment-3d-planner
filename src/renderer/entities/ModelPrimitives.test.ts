import { describe, expect, it } from 'vitest'

import { fitBoxToBounds, fitCylinderToBounds } from './ModelPrimitives'

describe('bounded model primitives', () => {
  const bounds = [1.2, 0.72, 0.7] as const

  it('insets front-facing accents and screens inside the local depth bound', () => {
    const fitted = fitBoxToBounds([0.3, 0.04, 0.02], [0, 0, 0.35], bounds)
    expect(fitted.size).toEqual([0.3, 0.04, 0.02])
    expect(fitted.position[2]).toBeCloseTo(0.34)
  })

  it('keeps horizontal outlet cylinders inside every local bound', () => {
    const fitted = fitCylinderToBounds(0.1, 0.08, [0.3, 0, 0.35], bounds, [
      Math.PI / 2,
      0,
      0,
    ])
    expect(fitted.position[2]).toBeLessThanOrEqual(0.35)
    expect(fitted.position[0]).toBeLessThanOrEqual(0.6)
    expect(fitted.position[1]).toBeGreaterThanOrEqual(-0.36)
  })
})
