import type { Dimensions, JsonObject } from '../domain/schema'
import { GENERIC_CATALOG_DEFINITIONS } from './definitions/generic'
import type {
  CatalogDefinition,
  CatalogOverrideTarget,
  DimensionOverrides,
} from './types'

function freezeCatalogData<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeCatalogData(child)
    }

    Object.freeze(value)
  }

  return value
}

export const CATALOG_DEFINITIONS = freezeCatalogData([...GENERIC_CATALOG_DEFINITIONS])

export function getCatalogDefinition(id: string): CatalogDefinition {
  const definition = CATALOG_DEFINITIONS.find((candidate) => candidate.id === id)

  if (!definition) {
    throw new Error(`Unknown catalog definition: ${id}`)
  }

  return definition
}

export function resolveCatalogDimensions(
  definitionOrId: CatalogDefinition | string,
  presetId?: string,
  overrides: DimensionOverrides = {},
): Dimensions {
  const definition =
    typeof definitionOrId === 'string'
      ? getCatalogDefinition(definitionOrId)
      : definitionOrId
  const preset = presetId
    ? definition.presets.find((candidate) => candidate.id === presetId)
    : undefined

  if (presetId && !preset) {
    throw new Error(`Unknown catalog preset ${presetId} for ${definition.id}`)
  }

  return { ...definition.defaultDimensions, ...preset?.dimensions, ...overrides }
}

export function resetCatalogOverrides(
  entity: CatalogOverrideTarget,
  key?: string,
): CatalogOverrideTarget {
  if (!key) {
    return { ...entity, overrides: {} }
  }

  const overrides: JsonObject = { ...entity.overrides }
  delete overrides[key]

  return { ...entity, overrides }
}
