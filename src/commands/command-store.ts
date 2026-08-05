import { applyCommand } from './commands'
import { cloneScene, commandLabel, sameScene, SceneHistory } from './history'
import { getWorldTransform, type WorldTransform } from './math'
import {
  appendTransactionCommand,
  beginTransaction,
  type ActiveInteraction,
} from './transactions'
import type { CommandResult, CommandStoreOptions, SceneCommand } from './types'
import { normalizeScene } from '../domain/normalize'
import type { SceneDocument } from '../domain/schema'

export type { SceneCommand } from './types'

export class CommandStore {
  private current: SceneDocument
  private readonly nextId: () => string
  private readonly sceneHistory = new SceneHistory()
  private interaction: ActiveInteraction | undefined

  constructor(initial: SceneDocument, options: CommandStoreOptions = {}) {
    this.current = normalizeScene(initial)
    this.nextId = options.idFactory ?? (() => crypto.randomUUID())
  }
  get scene(): SceneDocument {
    return cloneScene(this.current)
  }
  get history() {
    return this.sceneHistory.snapshot()
  }
  get activeInteraction(): boolean {
    return this.interaction !== undefined
  }
  snapshot() {
    return { scene: this.scene, history: this.history }
  }
  worldTransform(entityId: string): WorldTransform {
    return structuredClone(getWorldTransform(entityId, this.current.entities))
  }
  execute(command: SceneCommand): CommandResult {
    if (this.interaction) throw new Error('An interaction is active.')
    const before = this.current
    const result = applyCommand(before, command, this.nextId)
    this.current = result.scene
    if (!sameScene(before, result.scene))
      this.sceneHistory.push(commandLabel(command), before, result.scene)
    return {
      ...result,
      scene: this.scene,
      outOfBoundsEntityIds: [...result.outOfBoundsEntityIds],
    }
  }
  undo(): boolean {
    if (this.interaction) throw new Error('An interaction is active.')
    const entry = this.sceneHistory.takeUndo()
    if (!entry) return false
    this.current = normalizeScene(entry.before)
    return true
  }
  redo(): boolean {
    if (this.interaction) throw new Error('An interaction is active.')
    const entry = this.sceneHistory.takeRedo()
    if (!entry) return false
    this.current = normalizeScene(entry.after)
    return true
  }
  beginInteraction(label: string, target?: unknown): void {
    if (this.interaction) throw new Error('An interaction is already active.')
    this.interaction = beginTransaction(label, this.current, target)
  }
  updateInteraction(command: SceneCommand): CommandResult {
    if (!this.interaction) throw new Error('No interaction is active.')
    const nextInteraction = appendTransactionCommand(this.interaction, command)
    const result = applyCommand(this.current, command, this.nextId)
    this.current = result.scene
    this.interaction = nextInteraction
    return {
      ...result,
      scene: this.scene,
      outOfBoundsEntityIds: [...result.outOfBoundsEntityIds],
    }
  }
  commitInteraction(): boolean {
    const interaction = this.interaction
    if (!interaction) throw new Error('No interaction is active.')
    this.interaction = undefined
    if (sameScene(interaction.before, this.current)) return false
    this.sceneHistory.push(interaction.label, interaction.before, this.current)
    return true
  }
  cancelInteraction(): boolean {
    const interaction = this.interaction
    if (!interaction) throw new Error('No interaction is active.')
    this.current = cloneScene(interaction.before)
    this.interaction = undefined
    return true
  }
}

export function createCommandStore(
  initial: SceneDocument,
  options: CommandStoreOptions = {},
): CommandStore {
  return new CommandStore(initial, options)
}
