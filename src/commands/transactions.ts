import type { SceneCommand } from './types'
import type { SceneDocument } from '../domain/schema'

export interface ActiveInteraction {
  readonly label: string
  readonly before: SceneDocument
  readonly target?: unknown
  readonly commands: readonly SceneCommand[]
}
export function beginTransaction(
  label: string,
  before: SceneDocument,
  target?: unknown,
): ActiveInteraction {
  return {
    label,
    before: structuredClone(before),
    target: structuredClone(target),
    commands: [],
  }
}
export function appendTransactionCommand(
  transaction: ActiveInteraction,
  command: SceneCommand,
): ActiveInteraction {
  return { ...transaction, commands: [...transaction.commands, structuredClone(command)] }
}
