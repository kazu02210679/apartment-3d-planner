export class MigrationError extends Error {
  readonly code:
    'wrong-format' | 'unsupported-version' | 'future-version' | 'invalid-document'

  constructor(code: MigrationError['code'], message: string) {
    super(message)
    this.name = 'MigrationError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

export function migrateV0ToV1(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new MigrationError('invalid-document', 'The v0 document must be an object.')
  }
  const legacy = cloneJson(input)
  if (!isRecord(legacy) || legacy.schemaVersion !== 0) {
    throw new MigrationError(
      'unsupported-version',
      'Only schema version 0 can use this migration.',
    )
  }
  const legacyRoom = legacy.room
  if (!isRecord(legacyRoom) || !isRecord(legacyRoom.dimensions)) {
    throw new MigrationError(
      'invalid-document',
      'The v0 room must contain nested dimensions.',
    )
  }

  const dimensions = legacyRoom.dimensions
  const roomWithoutDimensions = { ...legacyRoom }
  delete roomWithoutDimensions.dimensions
  const { name, createdAt, updatedAt, description, tags, ...documentWithoutMetadata } =
    legacy

  return {
    ...documentWithoutMetadata,
    format: 'home-lab-scene',
    schemaVersion: 1,
    metadata: {
      name: typeof name === 'string' ? name : 'Imported scene',
      createdAt: typeof createdAt === 'string' ? createdAt : '1970-01-01T00:00:00.000Z',
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '1970-01-01T00:00:00.000Z',
      ...(typeof description === 'string' ? { description } : {}),
      tags: Array.isArray(tags) ? tags : [],
      extensions: {},
    },
    room: {
      ...roomWithoutDimensions,
      ...dimensions,
      extensions: roomWithoutDimensions.extensions ?? {},
    },
  }
}

export function migrateSceneDocument(input: unknown): unknown {
  if (!isRecord(input)) {
    throw new MigrationError('invalid-document', 'A scene document must be an object.')
  }
  if (input.format !== 'home-lab-scene') {
    throw new MigrationError('wrong-format', 'This is not a home-lab-scene document.')
  }
  if (input.schemaVersion === 1) return cloneJson(input)
  if (input.schemaVersion === 0) return migrateV0ToV1(input)
  if (typeof input.schemaVersion === 'number' && input.schemaVersion > 1) {
    throw new MigrationError('future-version', 'This scene uses a newer schema version.')
  }
  throw new MigrationError(
    'unsupported-version',
    'This scene schema version is unsupported.',
  )
}
