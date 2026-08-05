import type { SceneDocument } from '../domain/schema'
import { normalizeScene } from '../domain/normalize'
import { SceneStorage } from './storage'

export const DEFAULT_DEBOUNCE_MS = 250

export interface AutosaveTimers {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

export interface AutosaveOptions {
  readonly debounceMs?: number
  readonly timers?: AutosaveTimers
  readonly now?: () => number
  readonly clock?: () => number
}

export type AutosaveState = 'idle' | 'pending' | 'saved' | 'error'

export interface AutosaveStatus {
  readonly state: AutosaveState
  readonly error?: unknown
  readonly lastSuccessfulDigest?: string
  readonly lastSuccessfulAt?: number
}

const defaultTimers: AutosaveTimers = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
}

export interface AutosaveCoordinator {
  schedule(scene: SceneDocument): void
  flush(): AutosaveStatus
  dispose(): void
  getStatus(): AutosaveStatus
}

export function createAutosaveCoordinator(
  storage: SceneStorage,
  options: AutosaveOptions = {},
): AutosaveCoordinator {
  const timers = options.timers ?? defaultTimers
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const now = options.now ?? options.clock ?? Date.now
  let pending: SceneDocument | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let status: AutosaveStatus = { state: 'idle' }

  const clearTimer = () => {
    if (timer !== undefined) {
      timers.clearTimeout(timer)
      timer = undefined
    }
  }

  const flush = (): AutosaveStatus => {
    clearTimer()
    if (pending === undefined) return { ...status }
    const scene = pending
    pending = undefined
    const result = storage.save(scene)
    if (result.ok) {
      status = {
        state: 'saved',
        lastSuccessfulDigest: result.digest,
        lastSuccessfulAt: now(),
      }
    } else {
      status = { state: 'error', error: result.error, ...statusSuccess(status) }
    }
    return { ...status }
  }

  return {
    schedule(scene) {
      if (disposed) return
      try {
        pending = normalizeScene(scene)
        clearTimer()
        status = { state: 'pending', ...statusSuccess(status) }
        timer = timers.setTimeout(() => {
          timer = undefined
          flush()
        }, debounceMs)
      } catch (error) {
        pending = undefined
        clearTimer()
        status = { state: 'error', error, ...statusSuccess(status) }
      }
    },
    flush,
    dispose() {
      disposed = true
      clearTimer()
      pending = undefined
      status = { state: 'idle', ...statusSuccess(status) }
    },
    getStatus() {
      return { ...status }
    },
  }
}

function statusSuccess(
  status: AutosaveStatus,
): Pick<AutosaveStatus, 'lastSuccessfulDigest' | 'lastSuccessfulAt'> {
  return {
    ...(status.lastSuccessfulDigest
      ? { lastSuccessfulDigest: status.lastSuccessfulDigest }
      : {}),
    ...(status.lastSuccessfulAt !== undefined
      ? { lastSuccessfulAt: status.lastSuccessfulAt }
      : {}),
  }
}
