import { describe, expect, it } from 'vitest'

import { validateSceneInvariants } from '../domain/invariants'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'

function deterministicIds(): () => string {
  let sequence = 0

  return () => `workstation-id-${++sequence}`
}

describe('future workstation template', () => {
  it('creates a deterministic valid scene with the required workstation inventory', () => {
    const first = createFutureWorkstationScene({
      idFactory: deterministicIds(),
      now: () => '2026-08-06T00:00:00.000Z',
    })
    const second = createFutureWorkstationScene({
      idFactory: deterministicIds(),
      now: () => '2026-08-06T00:00:00.000Z',
    })
    const counts = (itemId: string) =>
      first.entities.filter((entity) => entity.catalog?.itemId === itemId).length

    expect(first).toEqual(second)
    expect(first.room.preset).toBe('6-tatami')
    expect(counts('desk.l-shaped-sit-stand')).toBe(1)
    expect(counts('seating.chair')).toBe(1)
    expect(counts('computer.windows-tower')).toBe(1)
    expect(counts('computer.mac')).toBe(1)
    expect(counts('display.monitor')).toBe(4)
    expect(counts('display.information')).toBe(2)
    expect(counts('mount.monitor-arm')).toBeGreaterThanOrEqual(6)
    expect(counts('light.display')).toBeGreaterThanOrEqual(2)
    expect(counts('desk.shelf')).toBe(1)
    expect(counts('storage.shelf-cabinet')).toBe(1)
    expect(counts('printer.generic')).toBe(1)
    expect(counts('waste.trash-bin')).toBe(1)
    expect(counts('power.strip')).toBe(2)
    expect(counts('sleep.bed-futon')).toBe(1)
    expect(counts('table.side')).toBe(1)
    expect(counts('light.room')).toBe(1)
    expect(counts('storage.clothes')).toBe(1)
    expect(
      first.entities
        .filter((entity) => entity.catalog?.itemId === 'display.monitor')
        .map((entity) => entity.catalog?.presetId),
    ).toEqual(['monitor-27', 'monitor-27', 'monitor-27', 'monitor-27'])
    expect(validateSceneInvariants(first)).toEqual(first)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  it('allows another supported tatami preset without changing the entity inventory', () => {
    const scene = createFutureWorkstationScene('12-tatami', {
      idFactory: deterministicIds(),
      now: () => '2026-08-06T00:00:00.000Z',
    })

    expect(scene.room.preset).toBe('12-tatami')
    expect(scene.entities).toHaveLength(31)
  })
})
