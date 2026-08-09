import { describe, expect, it } from 'vitest'

import { createEmptyScene } from './scene'
import { SceneDocumentSchema, type SceneDocument } from './schema'

const fixedTimestamp = '2026-08-06T00:00:00.000Z'

function makeScene(): SceneDocument {
  let nextId = 0

  return createEmptyScene('6-tatami', {
    idFactory: () => `schema-id-${++nextId}`,
    now: () => fixedTimestamp,
  })
}

describe('SceneDocument runtime schema', () => {
  it('accepts the versioned persisted source of truth and preserves its JSON shape', () => {
    const scene = makeScene()
    const parsed = SceneDocumentSchema.parse(scene)

    expect(parsed.format).toBe('home-lab-scene')
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.metadata).toMatchObject({
      name: '新しいシーン',
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    })
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it('rejects a future schema version instead of silently accepting an unsupported document', () => {
    const scene = makeScene()

    expect(SceneDocumentSchema.safeParse({ ...scene, schemaVersion: 2 }).success).toBe(
      false,
    )
  })

  it('rejects non-finite persisted dimensions instead of exporting invalid geometry', () => {
    const scene = makeScene()

    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        room: { ...scene.room, width: Number.NaN },
      }).success,
    ).toBe(false)
    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        room: { ...scene.room, depth: Number.POSITIVE_INFINITY },
      }).success,
    ).toBe(false)
  })

  it('rejects functions and cyclic references instead of accepting transient runtime state', () => {
    const scene = makeScene()
    const cyclicExtensions: Record<string, unknown> = {}
    cyclicExtensions.self = cyclicExtensions

    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        extensions: { calculate: () => 42 },
      }).success,
    ).toBe(false)
    expect(
      SceneDocumentSchema.safeParse({ ...scene, extensions: cyclicExtensions }).success,
    ).toBe(false)
  })

  it('rejects explicit undefined keys after proving JSON round trips lose their shape', () => {
    const scene = makeScene()
    expect(SceneDocumentSchema.parse(scene)).toEqual(scene)

    const withUndefinedDescription = {
      ...scene,
      metadata: { ...scene.metadata, description: undefined },
    }
    const roundTripped = JSON.parse(JSON.stringify(withUndefinedDescription)) as {
      metadata: Record<string, unknown>
    }

    expect(withUndefinedDescription.metadata).toHaveProperty('description', undefined)
    expect(roundTripped.metadata).not.toHaveProperty('description')
    expect(SceneDocumentSchema.safeParse(withUndefinedDescription).success).toBe(false)
  })

  it('rejects non-plain objects that JSON would silently coerce while keeping arrays and plain objects', () => {
    const scene = makeScene()
    const customPrototype = Object.create({ inheritedValue: 'lost' }) as { value: string }
    customPrototype.value = 'kept'

    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        extensions: { values: [1, { valid: true }] },
      }).success,
    ).toBe(true)
    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        extensions: { pattern: /runtime-only/ },
      }).success,
    ).toBe(false)
    expect(
      SceneDocumentSchema.safeParse({
        ...scene,
        extensions: { customPrototype },
      }).success,
    ).toBe(false)
  })
})
