import type { HistoryEntry, SceneCommand } from './types'
import type { SceneDocument } from '../domain/schema'

export function cloneScene(scene: SceneDocument): SceneDocument {
  return structuredClone(scene)
}
export function sameScene(left: SceneDocument, right: SceneDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export class SceneHistory {
  private undoEntries: HistoryEntry[] = []
  private redoEntries: HistoryEntry[] = []
  get undo(): readonly HistoryEntry[] {
    return structuredClone(this.undoEntries)
  }
  get redo(): readonly HistoryEntry[] {
    return structuredClone(this.redoEntries)
  }
  push(label: string, before: SceneDocument, after: SceneDocument): void {
    this.undoEntries.push({ label, before: cloneScene(before), after: cloneScene(after) })
    this.redoEntries = []
  }
  takeUndo(): HistoryEntry | undefined {
    const entry = this.undoEntries.pop()
    if (entry) this.redoEntries.push(entry)
    return entry && structuredClone(entry)
  }
  takeRedo(): HistoryEntry | undefined {
    const entry = this.redoEntries.pop()
    if (entry) this.undoEntries.push(entry)
    return entry && structuredClone(entry)
  }
  snapshot(): {
    readonly undo: readonly HistoryEntry[]
    readonly redo: readonly HistoryEntry[]
  } {
    return { undo: this.undo, redo: this.redo }
  }
}

export function commandLabel(command: SceneCommand): string {
  return command.type
}
