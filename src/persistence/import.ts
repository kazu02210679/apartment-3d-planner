import { normalizeScene } from '../domain/normalize'
import { SceneDocumentSchema, type SceneDocument } from '../domain/schema'
import { validateSceneInvariants } from '../domain/invariants'
import { MigrationError, migrateSceneDocument } from './migrations'
import {
  assertSceneWithinLimits,
  MAX_INPUT_BYTES,
  SceneLimitError,
  type SceneLimits,
} from './limits'

export type ImportErrorCode =
  | 'invalid-utf8'
  | 'too-large'
  | 'malformed-json'
  | 'wrong-format'
  | 'future-version'
  | 'unsupported-version'
  | 'schema-invalid'
  | 'invariant-invalid'
  | 'limit-exceeded'
  | 'replacement-failed'

export class SceneImportError extends Error {
  readonly code: ImportErrorCode
  readonly cause?: unknown

  constructor(code: ImportErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'SceneImportError'
    this.code = code
    this.cause = cause
  }
}

export interface ImportOptions extends SceneLimits {
  readonly replace?: (scene: SceneDocument) => void
}

export type ImportResult =
  | { readonly ok: true; readonly scene: SceneDocument }
  | { readonly ok: false; readonly error: SceneImportError }

function asBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input
}

function parseText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new SceneImportError('invalid-utf8', 'The import is not valid UTF-8.', error)
  }
}

function detectFormat(input: unknown): void {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SceneImportError('wrong-format', 'A scene import must be a JSON object.')
  }
  const record = input as Record<string, unknown>
  if (record.format !== 'home-lab-scene') {
    throw new SceneImportError('wrong-format', 'The imported format is unsupported.')
  }
  if (
    typeof record.schemaVersion !== 'number' ||
    !Number.isInteger(record.schemaVersion)
  ) {
    throw new SceneImportError(
      'unsupported-version',
      'The scene schema version is invalid.',
    )
  }
  if (record.schemaVersion > 1) {
    throw new SceneImportError(
      'future-version',
      'The scene schema version is newer than supported.',
    )
  }
  if (record.schemaVersion < 0) {
    throw new SceneImportError(
      'unsupported-version',
      'The scene schema version is unsupported.',
    )
  }
}

export function importScene(
  input: string | Uint8Array,
  options: ImportOptions = {},
): ImportResult {
  const bytes = asBytes(input)
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: new SceneImportError('too-large', 'The import exceeds the byte limit.'),
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(parseText(bytes)) as unknown
  } catch (error) {
    if (error instanceof SceneImportError) return { ok: false, error }
    return {
      ok: false,
      error: new SceneImportError(
        'malformed-json',
        'The import is not valid JSON.',
        error,
      ),
    }
  }

  try {
    detectFormat(parsed)
    const migrated = migrateSceneDocument(parsed)
    let structured: SceneDocument
    try {
      structured = SceneDocumentSchema.parse(migrated)
    } catch (error) {
      throw new SceneImportError(
        'schema-invalid',
        'The scene does not match the v1 schema.',
        error,
      )
    }
    try {
      validateSceneInvariants(structured)
    } catch (error) {
      throw new SceneImportError(
        'invariant-invalid',
        'The scene graph invariants are invalid.',
        error,
      )
    }
    try {
      assertSceneWithinLimits(structured, options)
    } catch (error) {
      if (error instanceof SceneLimitError) {
        throw new SceneImportError('limit-exceeded', error.message, error)
      }
      throw error
    }
    const scene = normalizeScene(structured)
    const resultScene = JSON.parse(JSON.stringify(scene)) as SceneDocument
    if (options.replace) {
      try {
        options.replace(JSON.parse(JSON.stringify(resultScene)) as SceneDocument)
      } catch (error) {
        throw new SceneImportError(
          'replacement-failed',
          'The atomic replacement callback failed.',
          error,
        )
      }
    }
    return { ok: true, scene: resultScene }
  } catch (error) {
    if (error instanceof SceneImportError) return { ok: false, error }
    if (error instanceof MigrationError) {
      const code =
        error.code === 'future-version'
          ? 'future-version'
          : error.code === 'wrong-format'
            ? 'wrong-format'
            : 'unsupported-version'
      return { ok: false, error: new SceneImportError(code, error.message, error) }
    }
    return {
      ok: false,
      error: new SceneImportError(
        'schema-invalid',
        'The scene could not be imported.',
        error,
      ),
    }
  }
}

export const deserializeScene = importScene
