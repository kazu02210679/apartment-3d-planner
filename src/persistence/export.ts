import { normalizeScene } from '../domain/normalize'
import type { SceneDocument } from '../domain/schema'
import { assertSceneWithinLimits, MAX_INPUT_BYTES } from './limits'

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function exportScene(input: SceneDocument): string {
  const scene = normalizeScene(input)
  assertSceneWithinLimits(scene)
  const json = JSON.stringify(scene, null, 2)
  const result = `${json}\n`
  if (encode(result).byteLength > MAX_INPUT_BYTES) {
    throw new Error(`The exported scene exceeds the ${MAX_INPUT_BYTES}-byte limit.`)
  }
  return result
}

export const serializeScene = exportScene
