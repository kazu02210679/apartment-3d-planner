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
    expect(
      resolveDeskLayout([1.8, 0.72, 1.4], {
        kind: 'l-desk',
        mainTop: { width: 1600, depth: 650 },
        returnTop: { width: 1200, depth: 550 },
        returnSide: 'right',
      }).return?.position[0],
    ).toBeGreaterThan(0)
  })

  it('renders a straight desk as one full-footprint top with no return', () => {
    const layout = resolveDeskLayout([1.4, 0.72, 0.7])
    expect(layout.main.size).toEqual([1.4, 0.06, 0.7])
    expect(layout.return).toBeUndefined()
  })
})
