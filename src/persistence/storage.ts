import { normalizeScene } from '../domain/normalize'
import type { SceneDocument } from '../domain/schema'
import { assertSceneWithinLimits } from './limits'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('The memory adapter rejected the write.')
    this.values.set(key, value)
  }
}

export const createMemoryStorage = (): MemoryStorageAdapter => new MemoryStorageAdapter()

export interface PersistedEnvelope {
  readonly format: 'home-lab-scene-storage'
  readonly schemaVersion: 1
  readonly current: SceneDocument
  readonly lastKnownGood: SceneDocument
}

export type StorageErrorCode = 'not-found' | 'recovery-failed' | 'save-failed'

export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageError'
    this.code = code
  }
}

export type StorageResult =
  | { readonly ok: true; readonly scene: SceneDocument; readonly digest: string }
  | { readonly ok: false; readonly error: StorageError }

export const DEFAULT_STORAGE_KEY = 'home-lab-scene'

function cloneScene(scene: SceneDocument): SceneDocument {
  return JSON.parse(JSON.stringify(scene)) as SceneDocument
}

export function sceneDigest(scene: SceneDocument): string {
  const text = JSON.stringify(scene)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function validateStoredScene(value: unknown): SceneDocument {
  const scene = normalizeScene(value)
  assertSceneWithinLimits(scene)
  return scene
}

function parseEnvelope(value: string): {
  readonly format: 'home-lab-scene-storage'
  readonly schemaVersion: 1
  readonly current: unknown
  readonly lastKnownGood: unknown
} {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The persistence envelope is not an object.')
  }
  const envelope = parsed as Record<string, unknown>
  if (envelope.format !== 'home-lab-scene-storage' || envelope.schemaVersion !== 1) {
    throw new Error('The persistence envelope version is unsupported.')
  }
  return {
    format: 'home-lab-scene-storage',
    schemaVersion: 1,
    current: envelope.current,
    lastKnownGood: envelope.lastKnownGood,
  }
}

export class SceneStorage {
  readonly adapter: StorageAdapter
  readonly key: string

  constructor(adapter: StorageAdapter, key = DEFAULT_STORAGE_KEY) {
    this.adapter = adapter
    this.key = key
  }

  save(input: SceneDocument): StorageResult {
    try {
      const scene = validateStoredScene(input)
      let previous: SceneDocument | undefined
      const existing = this.adapter.getItem(this.key)
      if (existing !== null) {
        try {
          const envelope = parseEnvelope(existing)
          previous = validateStoredScene(envelope.current)
        } catch {
          try {
            previous = validateStoredScene(parseEnvelope(existing).lastKnownGood)
          } catch {
            previous = undefined
          }
        }
      }
      const envelope: PersistedEnvelope = {
        format: 'home-lab-scene-storage',
        schemaVersion: 1,
        current: cloneScene(scene),
        lastKnownGood: cloneScene(previous ?? scene),
      }
      const bytes = JSON.stringify(envelope)
      this.adapter.setItem(this.key, bytes)
      return { ok: true, scene: cloneScene(scene), digest: sceneDigest(scene) }
    } catch (error) {
      return {
        ok: false,
        error: new StorageError('save-failed', 'The scene could not be persisted.', {
          cause: error,
        }),
      }
    }
  }

  reload(): StorageResult {
    let stored: string | null
    try {
      stored = this.adapter.getItem(this.key)
    } catch (error) {
      return {
        ok: false,
        error: new StorageError('recovery-failed', 'The scene could not be read.', {
          cause: error,
        }),
      }
    }
    if (stored === null) {
      return {
        ok: false,
        error: new StorageError('not-found', 'No saved scene was found.'),
      }
    }
    try {
      const envelope = parseEnvelope(stored)
      const current = validateStoredScene(envelope.current)
      return {
        ok: true,
        scene: cloneScene(current),
        digest: sceneDigest(current),
      }
    } catch (currentError) {
      try {
        const parsed: unknown = JSON.parse(stored)
        if (typeof parsed !== 'object' || parsed === null) throw currentError
        const envelope = parseEnvelope(stored)
        const fallback = validateStoredScene(envelope.lastKnownGood)
        return { ok: true, scene: cloneScene(fallback), digest: sceneDigest(fallback) }
      } catch (fallbackError) {
        return {
          ok: false,
          error: new StorageError(
            'recovery-failed',
            'No valid persisted scene could be recovered.',
            { cause: fallbackError },
          ),
        }
      }
    }
  }
}

export function createSceneStorage(
  adapter: StorageAdapter,
  key = DEFAULT_STORAGE_KEY,
): SceneStorage {
  return new SceneStorage(adapter, key)
}

export function saveScene(
  adapter: StorageAdapter,
  scene: SceneDocument,
  key = DEFAULT_STORAGE_KEY,
): StorageResult {
  return new SceneStorage(adapter, key).save(scene)
}

export function loadScene(
  adapter: StorageAdapter,
  key = DEFAULT_STORAGE_KEY,
): StorageResult {
  return new SceneStorage(adapter, key).reload()
}
