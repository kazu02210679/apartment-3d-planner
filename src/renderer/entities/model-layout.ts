import type { RendererVector3 } from '../adapters'

const DETAILED_ITEM_IDS = new Set([
  'desk.l-shaped-sit-stand',
  'desk.straight',
  'display.monitor',
  'display.information',
  'mount.monitor-arm',
  'light.display',
  'desk.shelf',
  'printer.generic',
  'storage.shelf-cabinet',
  'storage.clothes',
  'computer.windows-tower',
  'computer.mac',
  'computer.mini-pc',
  'seating.chair',
  'sleep.bed-futon',
  'table.side',
  'light.room',
  'waste.trash-bin',
  'power.strip',
])

export interface ModelBounds {
  readonly min: RendererVector3
  readonly max: RendererVector3
}

export function hasDetailedModel(itemId: string | undefined): boolean {
  return Boolean(itemId && DETAILED_ITEM_IDS.has(itemId))
}

// Every model composes inside this immutable catalog-derived envelope.  Keeping
// the local origin at its center preserves Task 8 transforms and resize bounds.
export function detailedModelBounds(
  _itemId: string,
  dimensions: RendererVector3,
): ModelBounds {
  return {
    min: [-dimensions[0] / 2, -dimensions[1] / 2, -dimensions[2] / 2],
    max: [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2],
  }
}
