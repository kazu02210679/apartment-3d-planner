import { describe, expect, it } from 'vitest'

import {
  ROOM_PRESETS,
  TATAMI_AREA_SQUARE_METRES,
  type RoomPresetId,
} from './room-presets'
import { createOpaqueId, type IdFactory } from './ids'
import { createEmptyScene } from './scene'
import {
  degreesToRadians,
  millimetresToRendererUnits,
  radiansToDegrees,
  rendererUnitsToMillimetres,
} from './units'

const fixedTimestamp = '2026-08-06T00:00:00.000Z'

function deterministicIds(...ids: string[]): IdFactory {
  let index = 0

  return () => ids[index++] ?? `test-id-${index}`
}

describe('room presets and canonical units', () => {
  it('keeps the four tatami presets at the independently specified v1 dimensions', () => {
    const expected = [
      ['6-tatami', 6, 2700, 3600, 2400, 9.72],
      ['8-tatami', 8, 3600, 3600, 2400, 12.96],
      ['10-tatami', 10, 3600, 4500, 2400, 16.2],
      ['12-tatami', 12, 3600, 5400, 2400, 19.44],
    ] as const

    expect(TATAMI_AREA_SQUARE_METRES).toBe(1.62)

    for (const [id, tatamiCount, width, depth, height, areaSquareMetres] of expected) {
      const preset = ROOM_PRESETS[id as RoomPresetId]

      expect(preset).toMatchObject({
        id,
        tatamiCount,
        width,
        depth,
        height,
        areaSquareMetres,
      })
    }
  })

  it('converts persisted millimetres and degrees at the renderer boundary', () => {
    expect(millimetresToRendererUnits(2700)).toBe(2.7)
    expect(rendererUnitsToMillimetres(3.6)).toBe(3600)
    expect(degreesToRadians(180)).toBe(Math.PI)
    expect(radiansToDegrees(Math.PI / 2)).toBe(90)
  })

  it('creates opaque IDs through an injectable factory for deterministic callers', () => {
    expect(createOpaqueId(deterministicIds('opaque-test-id'))).toBe('opaque-test-id')
  })

  it('creates a JSON-serializable empty scene with stable document and room IDs', () => {
    const scene = createEmptyScene('8-tatami', {
      idFactory: deterministicIds('scene-id', 'room-id'),
      now: () => fixedTimestamp,
    })

    expect(scene.id).toBe('scene-id')
    expect(scene.room.id).toBe('room-id')
    expect(scene.room).toMatchObject({
      preset: '8-tatami',
      width: 3600,
      depth: 3600,
      height: 2400,
    })
    expect(scene.entities).toEqual([])
    expect(JSON.parse(JSON.stringify(scene))).toEqual(scene)
  })
})
