import { describe, expect, it } from 'vitest'

import { getCatalogDefinition, resolveCatalogDimensions } from '../catalog/catalog'
import { applyCommand } from '../commands/commands'
import { getWorldTransform, matrixToEuler, rotationMatrix } from '../commands/math'
import type { Entity, SceneDocument } from './schema'
import { createEmptyScene } from './scene'
import { isPlacementEntityEligible, solvePlacement } from './placement'
import { Matrix4, Euler } from 'three'

function ids(): () => string {
  let index = 0
  return () => `placement-${++index}`
}

function scene(): SceneDocument {
  return createEmptyScene('6-tatami', {
    idFactory: ids(),
    now: () => '2026-08-11T00:00:00.000Z',
  })
}

function box(
  id: string,
  position: Entity['transform']['position'],
  dimensions: Entity['dimensions'] = { width: 100, depth: 100, height: 100 },
  parentId: string | null = null,
): Entity {
  return {
    id,
    kind: 'generic',
    name: id,
    parentId,
    transform: {
      position,
      rotation: { x: 0, y: 0, z: 0 },
    },
    dimensions,
    overrides: {},
    ports: [],
    properties: {},
    visible: true,
    locked: false,
    extensions: {},
  }
}

function catalogBox(
  id: string,
  itemId: string,
  position: Entity['transform']['position'],
  parentId: string | null = null,
): Entity {
  const definition = getCatalogDefinition(itemId)
  return {
    ...box(id, position, resolveCatalogDimensions(definition), parentId),
    kind: definition.category,
    catalog: {
      itemId,
      revision: definition.revision,
      extensions: {},
    },
  }
}

describe('placement solver', () => {
  it('matches Three XYZ rotation matrices for mixed and nested transforms', () => {
    const mixed = { x: 23, y: -37, z: 41 }
    const actual = getWorldTransform('child', [
      {
        ...box('parent', { x: 100, y: 200, z: -300 }),
        transform: {
          position: { x: 100, y: 200, z: -300 },
          rotation: { x: -11, y: 19, z: 7 },
        },
      },
      {
        ...box(
          'child',
          { x: 40, y: 50, z: 60 },
          { width: 100, depth: 100, height: 100 },
          'parent',
        ),
        transform: { position: { x: 40, y: 50, z: 60 }, rotation: mixed },
      },
    ])
    const parentMatrix = new Matrix4().makeRotationFromEuler(
      new Euler((-11 * Math.PI) / 180, (19 * Math.PI) / 180, (7 * Math.PI) / 180, 'XYZ'),
    )
    const childMatrix = new Matrix4().makeRotationFromEuler(
      new Euler((23 * Math.PI) / 180, (-37 * Math.PI) / 180, (41 * Math.PI) / 180, 'XYZ'),
    )
    const expected = parentMatrix.clone().multiply(childMatrix)
    const expectedRotation = [
      expected.elements[0]!,
      expected.elements[4]!,
      expected.elements[8]!,
      expected.elements[1]!,
      expected.elements[5]!,
      expected.elements[9]!,
      expected.elements[2]!,
      expected.elements[6]!,
      expected.elements[10]!,
    ]
    actual.rotation.forEach((value, index) =>
      expect(value).toBeCloseTo(expectedRotation[index], 9),
    )
  })

  it('round-trips mixed XYZ scene rotations through the Three-compatible matrix', () => {
    const rotation = { x: 23, y: -37, z: 41 }
    const matrix = rotationMatrix(rotation)
    const restored = matrixToEuler(matrix)
    expect(restored.x).toBeCloseTo(rotation.x, 9)
    expect(restored.y).toBeCloseTo(rotation.y, 9)
    expect(restored.z).toBeCloseTo(rotation.z, 9)
  })

  it.each([
    { x: 30, y: 89.99, z: 40 },
    { x: 30, y: -89.99, z: 40 },
  ])('matches Three XYZ near-gimbal extraction for $y degrees', (rotation) => {
    const matrix = rotationMatrix(rotation)
    const threeMatrix = new Matrix4().set(
      matrix[0],
      matrix[1],
      matrix[2],
      0,
      matrix[3],
      matrix[4],
      matrix[5],
      0,
      matrix[6],
      matrix[7],
      matrix[8],
      0,
      0,
      0,
      0,
      1,
    )
    const expected = new Euler().setFromRotationMatrix(threeMatrix, 'XYZ')
    const actual = matrixToEuler(matrix)
    expect(actual.x).toBeCloseTo((expected.x * 180) / Math.PI, 6)
    expect(actual.y).toBeCloseTo((expected.y * 180) / Math.PI, 6)
    expect(actual.z).toBeCloseTo((expected.z * 180) / Math.PI, 6)
  })

  it('drops a floor-only item vertically while preserving world X/Z and rotation', () => {
    const input = scene()
    input.entities.push({
      ...box('item', { x: 240, y: 700, z: -180 }),
      transform: {
        position: { x: 240, y: 700, z: -180 },
        rotation: { x: 0, y: 30, z: 0 },
      },
    })

    const solution = solvePlacement(input, { kind: 'floor', entityId: 'item' })

    expect(solution.status).toBe('changed')
    expect(solution.transform?.position.x).toBe(240)
    expect(solution.transform?.position.z).toBe(-180)
    expect(solution.transform?.position.y).toBeGreaterThan(0)
    expect(solution.transform?.rotation).toEqual({ x: 0, y: 30, z: 0 })
  })

  it('writes a parented solution in local space while solving the same world position', () => {
    const input = scene()
    input.entities.push(box('parent', { x: 500, y: 101, z: 200 }, { width: 1, depth: 1, height: 1 }))
    input.entities[0]!.transform.rotation.y = 90
    input.entities.push(box('child', { x: 0, y: 700, z: 0 }, { width: 100, depth: 100, height: 100 }, 'parent'))

    const solution = solvePlacement(input, { kind: 'floor', entityId: 'child' })

    expect(solution.status).toBe('changed')
    expect(solution.transform?.position.x).toBeCloseTo(0)
    expect(solution.transform?.position.y).toBeCloseTo(-51)
    expect(solution.transform?.position.z).toBeCloseTo(0)
    expect(solution.transform?.rotation).toEqual({ x: 0, y: 0, z: 0 })
    expect(solution.worldDelta?.x).toBeCloseTo(0)
    expect(solution.worldDelta?.z).toBeCloseTo(0)
  })

  it('selects a declared support surface and ignores incidental geometry', () => {
    const input = scene()
    input.entities.push(catalogBox('desk', 'desk.straight', { x: 0, y: 360, z: 0 }))
    input.entities.push(catalogBox('monitor', 'display.monitor', { x: 0, y: 100, z: 0 }))

    const solution = solvePlacement(input, { kind: 'nearest', entityId: 'monitor' })

    expect(solution.status).toBe('changed')
    expect(solution.target).toMatchObject({
      kind: 'support-surface',
      hostEntityId: 'desk',
    })
    expect(solution.transform?.position.y).toBeCloseTo(360 + 720 / 2 + 456 / 2)
  })

  it('does not place a support-capable desk on another desk', () => {
    const input = scene()
    input.entities.push(
      catalogBox('host-desk', 'desk.straight', { x: 0, y: 360, z: 0 }),
      catalogBox('selected-desk', 'desk.straight', { x: 0, y: 1200, z: 0 }),
    )

    const solution = solvePlacement(input, { kind: 'nearest', entityId: 'selected-desk' })

    expect(solution).toMatchObject({ status: 'changed', target: { kind: 'floor' } })
  })

  it('returns a no-op for an already valid floor placement and rejects locked or hidden entities', () => {
    const input = scene()
    input.entities.push(box('item', { x: 0, y: 50, z: 0 }))

    expect(solvePlacement(input, { kind: 'floor', entityId: 'item' }).status).toBe('noop')
    input.entities[0]!.locked = true
    expect(isPlacementEntityEligible(input, 'item')).toBe(false)
    input.entities[0]!.locked = false
    input.entities[0]!.visible = false
    expect(solvePlacement(input, { kind: 'floor', entityId: 'item' }).status).toBe(
      'unavailable',
    )
  })

  it('chooses a bounded collision-free correction and rejects an oversized item', () => {
    const input = scene()
    input.entities.push(box('item', { x: 0, y: 50, z: 0 }))
    input.entities.push(box('obstacle', { x: 0, y: 50, z: 0 }))

    const corrected = solvePlacement(input, { kind: 'floor', entityId: 'item' })

    expect(corrected.status).toBe('changed')
    expect(Math.abs(corrected.transform?.position.x ?? 0)).toBeGreaterThan(0)

    const oversized = scene()
    oversized.entities.push(box('huge', { x: 0, y: 0, z: 0 }, { width: 3000, depth: 4000, height: 3000 }))
    expect(solvePlacement(oversized, { kind: 'in-bounds', entityId: 'huge' }).status).toBe(
      'unavailable',
    )
  })

  it('keeps equal-distance support selection and canonical bytes stable when hosts are permuted', () => {
    const createTieScene = (reverseHosts: boolean): SceneDocument => {
      const input = scene()
      const hosts = [
        catalogBox('host-a', 'desk.straight', { x: 0, y: 360, z: -1100 }),
        catalogBox('host-b', 'desk.straight', { x: 0, y: 360, z: 1100 }),
      ]
      const monitor = catalogBox('monitor', 'display.monitor', { x: 0, y: 100, z: 0 })
      input.entities.push(...(reverseHosts ? [hosts[1]!, hosts[0]!, monitor] : [...hosts, monitor]))
      return input
    }

    const first = createTieScene(false)
    const second = createTieScene(true)
    const firstSolution = solvePlacement(first, { kind: 'nearest', entityId: 'monitor' })
    const secondSolution = solvePlacement(second, { kind: 'nearest', entityId: 'monitor' })

    expect(firstSolution).toMatchObject({
      status: 'changed',
      target: { kind: 'support-surface', hostEntityId: 'host-a', surfaceId: 'top' },
    })
    expect(secondSolution).toEqual(firstSolution)

    const command = { type: 'place-entity' as const, entityId: 'monitor', placement: 'nearest' as const }
    const firstApplied = applyCommand(first, command, () => 'unused-id').scene
    const secondApplied = applyCommand(second, command, () => 'unused-id').scene
    expect(JSON.stringify(firstApplied)).toBe(JSON.stringify(secondApplied))
  })

  it('keeps a parented placement in local space and moves a rigid subtree as one world translation', () => {
    const createEquivalentScene = (withParent: boolean): SceneDocument => {
      const input = scene()
      if (withParent) {
        const group = box('group', { x: 400, y: 0, z: -500 }, { width: 1, depth: 1, height: 1 })
        group.transform.rotation.y = 30
        const desk = catalogBox('desk', 'desk.straight', { x: 0, y: 360, z: 0 }, 'group')
        desk.transform.rotation.y = 15
        desk.dimensions = { ...desk.dimensions, depth: 1000 }
        desk.overrides = { dimensions: { depth: 1000 } }
        const monitor = catalogBox(
          'monitor',
          'display.monitor',
          { x: 0, y: 1200, z: 0 },
          'group',
        )
        const accessory = box(
          'accessory',
          { x: 0, y: 300, z: 0 },
          { width: 80, depth: 80, height: 80 },
          'monitor',
        )
        input.entities.push(group, desk, monitor, accessory)
      } else {
        const desk = catalogBox('desk', 'desk.straight', { x: 400, y: 360, z: -500 })
        desk.transform.rotation.y = 45
        desk.dimensions = { ...desk.dimensions, depth: 1000 }
        desk.overrides = { dimensions: { depth: 1000 } }
        const monitor = catalogBox('monitor', 'display.monitor', {
          x: 400,
          y: 1200,
          z: -500,
        })
        monitor.transform.rotation.y = 30
        const accessory = box(
          'accessory',
          { x: 0, y: 300, z: 0 },
          { width: 80, depth: 80, height: 80 },
          'monitor',
        )
        input.entities.push(desk, monitor, accessory)
      }
      return input
    }

    const parented = createEquivalentScene(true)
    const unparented = createEquivalentScene(false)
    const command = {
      type: 'place-entity' as const,
      entityId: 'monitor',
      placement: 'nearest' as const,
    }
    const request = { entityId: 'monitor', kind: 'nearest' as const }
    const parentedSolution = solvePlacement(parented, request)
    const unparentedSolution = solvePlacement(unparented, request)

    expect(parentedSolution).toMatchObject({
      status: 'changed',
      target: { kind: 'support-surface', hostEntityId: 'desk', surfaceId: 'top' },
    })
    expect(unparentedSolution.status).toBe(parentedSolution.status)
    expect(unparentedSolution.target).toEqual(parentedSolution.target)
    expect(parentedSolution.worldDelta?.x).toBeCloseTo(unparentedSolution.worldDelta?.x ?? 0)
    expect(parentedSolution.worldDelta?.y).toBeCloseTo(unparentedSolution.worldDelta?.y ?? 0)
    expect(parentedSolution.worldDelta?.z).toBeCloseTo(unparentedSolution.worldDelta?.z ?? 0)

    const parentedRootBefore = getWorldTransform('monitor', parented.entities)
    const parentedAccessoryBefore = getWorldTransform('accessory', parented.entities)
    const parentedApplied = applyCommand(parented, command, () => 'unused-id').scene
    const parentedRootAfter = getWorldTransform('monitor', parentedApplied.entities)
    const parentedAccessoryAfter = getWorldTransform('accessory', parentedApplied.entities)
    const delta = parentedSolution.worldDelta!

    expect(parentedApplied.entities.find((entity) => entity.id === 'monitor')?.parentId).toBe(
      'group',
    )
    expect(parentedRootAfter.position.x).toBeCloseTo(parentedRootBefore.position.x + delta.x)
    expect(parentedRootAfter.position.y).toBeCloseTo(parentedRootBefore.position.y + delta.y)
    expect(parentedRootAfter.position.z).toBeCloseTo(parentedRootBefore.position.z + delta.z)
    expect(parentedAccessoryAfter.position.x).toBeCloseTo(
      parentedAccessoryBefore.position.x + delta.x,
    )
    expect(parentedAccessoryAfter.position.y).toBeCloseTo(
      parentedAccessoryBefore.position.y + delta.y,
    )
    expect(parentedAccessoryAfter.position.z).toBeCloseTo(
      parentedAccessoryBefore.position.z + delta.z,
    )

    const unparentedApplied = applyCommand(unparented, command, () => 'unused-id').scene
    const unparentedRootAfter = getWorldTransform('monitor', unparentedApplied.entities)
    expect(parentedRootAfter.position.x).toBeCloseTo(unparentedRootAfter.position.x)
    expect(parentedRootAfter.position.y).toBeCloseTo(unparentedRootAfter.position.y)
    expect(parentedRootAfter.position.z).toBeCloseTo(unparentedRootAfter.position.z)
  })

  it('keeps locked visible hosts eligible while hidden, tilted, or occupied hosts fall back safely', () => {
    const createSupportScene = (occupied = false): SceneDocument => {
      const input = scene()
      input.entities.push(
        catalogBox('desk', 'desk.straight', { x: 0, y: 360, z: 0 }),
        catalogBox('monitor', 'display.monitor', { x: 0, y: 1100, z: 0 }),
      )
      if (occupied) {
        input.entities.push(
          box('occupant', { x: 0, y: 1000, z: 0 }, { width: 1400, depth: 700, height: 400 }),
        )
      }
      return input
    }

    const lockedHost = createSupportScene()
    lockedHost.entities[0]!.locked = true
    expect(solvePlacement(lockedHost, { kind: 'nearest', entityId: 'monitor' })).toMatchObject({
      status: 'changed',
      target: { kind: 'support-surface', hostEntityId: 'desk' },
    })

    const hiddenHost = createSupportScene()
    hiddenHost.entities[0]!.visible = false
    expect(solvePlacement(hiddenHost, { kind: 'nearest', entityId: 'monitor' })).toMatchObject({
      status: 'changed',
      target: { kind: 'floor' },
    })

    const tiltedHost = createSupportScene()
    tiltedHost.entities[0]!.transform.rotation.x = 10
    expect(solvePlacement(tiltedHost, { kind: 'nearest', entityId: 'monitor' })).toMatchObject({
      status: 'changed',
      target: { kind: 'floor' },
    })

    const occupiedHost = createSupportScene(true)
    expect(solvePlacement(occupiedHost, { kind: 'nearest', entityId: 'monitor' })).toMatchObject({
      status: 'changed',
      target: { kind: 'floor' },
    })
  })

  it('enforces enclosed shelf clearance and chooses the declared top when the lower shelf cannot fit', () => {
    const createShelfScene = (tall: boolean): SceneDocument => {
      const input = scene()
      input.entities.push(catalogBox('shelf', 'storage.shelf-cabinet', { x: 0, y: 600, z: 0 }))
      const baseMonitor = catalogBox('monitor', 'display.monitor', { x: 0, y: 600, z: 0 })
      input.entities.push(
        tall
          ? {
              ...baseMonitor,
              dimensions: { ...baseMonitor.dimensions, height: 1000 },
              overrides: { dimensions: { height: 1000 } },
            }
          : baseMonitor,
      )
      return input
    }

    expect(
      solvePlacement(createShelfScene(false), { kind: 'nearest', entityId: 'monitor' }),
    ).toMatchObject({
      status: 'changed',
      target: {
        kind: 'support-surface',
        hostEntityId: 'shelf',
        surfaceId: 'interior-shelf-low',
      },
    })
    expect(
      solvePlacement(createShelfScene(true), { kind: 'nearest', entityId: 'monitor' }),
    ).toMatchObject({
      status: 'changed',
      target: { kind: 'support-surface', hostEntityId: 'shelf', surfaceId: 'top' },
    })
  })

  it('keeps in-bounds correction translation-only and preserves non-transform fields', () => {
    const input = scene()
    const item = box('item', { x: 2000, y: 400, z: -180 }, { width: 100, depth: 100, height: 100 })
    item.transform.rotation = { x: 12, y: 30, z: -8 }
    input.entities.push(item)
    const before = structuredClone(item)
    const solution = solvePlacement(input, { kind: 'in-bounds', entityId: 'item' })

    expect(solution.status).toBe('changed')
    expect(solution.transform?.rotation).toEqual(before.transform.rotation)

    const applied = applyCommand(
      input,
      { type: 'place-entity', entityId: 'item', placement: 'in-bounds' },
      () => 'unused-id',
    ).scene
    const after = applied.entities.find((entity) => entity.id === 'item')!
    expect(after.transform.rotation).toEqual(before.transform.rotation)
    expect(after.dimensions).toEqual(before.dimensions)
    expect(after.properties).toEqual(before.properties)
    expect(after.ports).toEqual(before.ports)
    expect(after.catalog).toEqual(before.catalog)
  })
})
