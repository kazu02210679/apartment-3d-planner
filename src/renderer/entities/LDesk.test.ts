import { describe, expect, it } from 'vitest'

import { resolveDeskLayout } from './LDesk'

describe('resolveDeskLayout', () => {
  it('uses resolved L-desk tops, side, and height without moving the local origin', () => {
    const layout = resolveDeskLayout([1.8, 0.72, 1.4], {
      kind: 'l-desk',
      mainTop: { width: 1600, depth: 650 },
      returnTop: { width: 1200, depth: 550 },
      returnSide: 'left',
    })

    expect(layout.main.size).toEqual([1.6, 0.06, 0.65])
    expect(layout.return?.size).toEqual([1.2, 0.06, 0.55])
    expect(layout.return?.position[0]).toBeLessThan(0)
    expect(layout.topY).toBeCloseTo(0.33)
    expect(layout.origin).toEqual([0, 0, 0])
    const right = resolveDeskLayout([1.8, 0.72, 1.4], {
      kind: 'l-desk',
      mainTop: { width: 1600, depth: 650 },
      returnTop: { width: 1200, depth: 550 },
      returnSide: 'right',
    })
    expect(right.return?.position[0]).toBeGreaterThan(0)
    expect(layout.main.position[0]).toBeCloseTo(-right.main.position[0])
    expect(layout.return?.position[0]).toBeCloseTo(-right.return!.position[0])
  })

  it('renders a straight desk as one full-footprint top with no return', () => {
    const layout = resolveDeskLayout([1.4, 0.72, 0.7])
    expect(layout.main.size).toEqual([1.4, 0.06, 0.7])
    expect(layout.return).toBeUndefined()
  })

  it('uniformly fits an oversized L footprint without changing the main-to-return proportions', () => {
    const layout = resolveDeskLayout([1.8, 0.72, 1.2], {
      kind: 'l-desk',
      mainTop: { width: 2000, depth: 600 },
      returnTop: { width: 1200, depth: 800 },
      returnSide: 'right',
    })

    expect(layout.main.size[0] / layout.return!.size[0]).toBeCloseTo(2000 / 1200)
    expect(layout.main.size[2] / layout.return!.size[2]).toBeCloseTo(600 / 800)
    expect(layout.main.size[1]).toBeCloseTo(0.06)
    expect(layout.topY).toBeCloseTo(0.33)
    expect(layout.footprint[0]).toBeLessThanOrEqual(1.8)
    expect(layout.footprint[1]).toBeLessThanOrEqual(1.2)
  })

  it('keeps distinct valid top overrides visibly distinct after fitting', () => {
    const compact = resolveDeskLayout([1.8, 0.72, 1.2], {
      kind: 'l-desk',
      mainTop: { width: 1600, depth: 600 },
      returnTop: { width: 800, depth: 550 },
      returnSide: 'left',
    })
    const broad = resolveDeskLayout([1.8, 0.72, 1.2], {
      kind: 'l-desk',
      mainTop: { width: 1600, depth: 800 },
      returnTop: { width: 1200, depth: 350 },
      returnSide: 'left',
    })

    expect(compact.main.size[0] / compact.return!.size[0]).toBeCloseTo(2)
    expect(broad.main.size[0] / broad.return!.size[0]).toBeCloseTo(1600 / 1200)
    expect(compact.main.size[2] / compact.return!.size[2]).toBeCloseTo(600 / 550)
    expect(broad.main.size[2] / broad.return!.size[2]).toBeCloseTo(800 / 350)
  })
})
