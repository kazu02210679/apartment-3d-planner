import { describe, expect, it } from 'vitest'

import {
  millimetresToRendererLength,
  toRendererDimensions,
  toRendererTransform,
  toSceneTransform,
} from './adapters'

describe('renderer adapters', () => {
  it('converts persisted millimetres and degrees without changing axes', () => {
    expect(
      toRendererTransform({
        position: { x: 1250, y: 700, z: -250 },
        rotation: { x: 90, y: 45, z: -45 },
      }),
    ).toEqual({
      position: [1.25, 0.7, -0.25],
      rotation: [1.57079633, 0.78539816, -0.78539816],
    })
    expect(toRendererDimensions({ width: 1800, depth: 700, height: 720 })).toEqual([
      1.8, 0.72, 0.7,
    ])
  })

  it('rounds renderer values deterministically when converting to persisted data', () => {
    expect(
      toSceneTransform({
        position: [1.23456789, 0.70000004, -0.24999996],
        rotation: [1.5707963268, 0.7853981634, -0.7853981634],
      }),
    ).toEqual({
      position: { x: 1234.568, y: 700, z: -250 },
      rotation: { x: 90, y: 45, z: -45 },
    })
  })

  it('converts procedural geometry lengths through the same renderer boundary', () => {
    expect(millimetresToRendererLength(597.84)).toBe(0.59784)
  })
})
