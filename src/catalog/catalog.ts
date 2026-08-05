import type { Dimensions, Entity, JsonObject, JsonValue } from '../domain/schema'
import { GENERIC_CATALOG_DEFINITIONS } from './definitions/generic'
import type {
  CatalogDefinition,
  CatalogOverrideTarget,
  CatalogGeometryOverrides,
  CatalogInstanceOverrides,
  DimensionOverrides,
  GeometryDescriptor,
  ResolvedCatalogInstance,
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

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readPositiveNumber(
  value: JsonValue | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`)
  }

  return value
}

function readDimensions(value: JsonValue | undefined): DimensionOverrides {
  if (value === undefined) {
    return {}
  }

  if (!isJsonObject(value)) {
    throw new Error('Catalog dimension overrides must be a JSON object.')
  }

  return {
    ...(readPositiveNumber(value.width, 'dimensions.width') !== undefined
      ? { width: readPositiveNumber(value.width, 'dimensions.width') }
      : {}),
    ...(readPositiveNumber(value.depth, 'dimensions.depth') !== undefined
      ? { depth: readPositiveNumber(value.depth, 'dimensions.depth') }
      : {}),
    ...(readPositiveNumber(value.height, 'dimensions.height') !== undefined
      ? { height: readPositiveNumber(value.height, 'dimensions.height') }
      : {}),
  }
}

function readPlanarDimensions(value: JsonValue | undefined, name: string) {
  if (value === undefined) {
    return undefined
  }

  if (!isJsonObject(value)) {
    throw new Error(`${name} must be a JSON object.`)
  }

  return {
    ...(readPositiveNumber(value.width, `${name}.width`) !== undefined
      ? { width: readPositiveNumber(value.width, `${name}.width`) }
      : {}),
    ...(readPositiveNumber(value.depth, `${name}.depth`) !== undefined
      ? { depth: readPositiveNumber(value.depth, `${name}.depth`) }
      : {}),
  }
}

function readGeometryOverrides(
  value: JsonValue | undefined,
): CatalogGeometryOverrides | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isJsonObject(value)) {
    throw new Error('Catalog geometry overrides must be a JSON object.')
  }

  const panel = value.panel
  const lDesk = value.lDesk

  return {
    ...(isJsonObject(panel)
      ? {
          panel: {
            ...(readPositiveNumber(panel.width, 'geometry.panel.width') !== undefined
              ? { width: readPositiveNumber(panel.width, 'geometry.panel.width') }
              : {}),
            ...(readPositiveNumber(panel.height, 'geometry.panel.height') !== undefined
              ? { height: readPositiveNumber(panel.height, 'geometry.panel.height') }
              : {}),
          },
        }
      : {}),
    ...(isJsonObject(lDesk)
      ? {
          lDesk: {
            ...(readPlanarDimensions(lDesk.mainTop, 'geometry.lDesk.mainTop')
              ? { mainTop: readPlanarDimensions(lDesk.mainTop, 'geometry.lDesk.mainTop') }
              : {}),
            ...(readPlanarDimensions(lDesk.returnTop, 'geometry.lDesk.returnTop')
              ? {
                  returnTop: readPlanarDimensions(
                    lDesk.returnTop,
                    'geometry.lDesk.returnTop',
                  ),
                }
              : {}),
            ...(lDesk.returnSide === 'left' || lDesk.returnSide === 'right'
              ? { returnSide: lDesk.returnSide }
              : lDesk.returnSide === undefined
                ? {}
                : (() => {
                    throw new Error('geometry.lDesk.returnSide must be left or right.')
                  })()),
          },
        }
      : {}),
  }
}

function readCatalogInstanceOverrides(overrides: JsonObject): CatalogInstanceOverrides {
  const supportedKeys = new Set(['dimensions', 'geometry', 'materialId', 'properties'])

  for (const key of Object.keys(overrides)) {
    if (!supportedKeys.has(key)) {
      throw new Error(`Unsupported catalog override: ${key}`)
    }
  }

  const materialId = overrides.materialId
  const properties = overrides.properties

  if (materialId !== undefined && typeof materialId !== 'string') {
    throw new Error('materialId must be a string.')
  }

  if (properties !== undefined && !isJsonObject(properties)) {
    throw new Error('properties must be a JSON object.')
  }

  return {
    dimensions: readDimensions(overrides.dimensions),
    geometry: readGeometryOverrides(overrides.geometry),
    ...(materialId !== undefined ? { materialId } : {}),
    ...(properties !== undefined ? { properties } : {}),
  }
}

function validateDimensions(definition: CatalogDefinition, dimensions: Dimensions): void {
  for (const axis of ['width', 'depth', 'height'] as const) {
    const value = dimensions[axis]

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${definition.id} ${axis} must be a finite positive number.`)
    }

    if (definition.dimensionPolicy.mode === 'bounded') {
      const constraint = definition.dimensionPolicy.axes[axis]

      if (constraint?.min !== undefined && value < constraint.min) {
        throw new Error(`${definition.id} ${axis} is outside allowed bounds.`)
      }

      if (constraint?.max !== undefined && value > constraint.max) {
        throw new Error(`${definition.id} ${axis} is outside allowed bounds.`)
      }
    }
  }
}

function resolvePreset(definition: CatalogDefinition, presetId?: string) {
  const preset = presetId
    ? definition.presets.find((candidate) => candidate.id === presetId)
    : undefined

  if (presetId && !preset) {
    throw new Error(`Unknown catalog preset ${presetId} for ${definition.id}`)
  }

  return preset
}

function resolveDimensions(
  definition: CatalogDefinition,
  presetId?: string,
  overrides: DimensionOverrides = {},
): Dimensions {
  const preset = resolvePreset(definition, presetId)

  if (definition.dimensionPolicy.mode === 'fixed' && Object.keys(overrides).length > 0) {
    throw new Error(`${definition.id} uses fixed dimensions and rejects overrides.`)
  }

  const dimensions = {
    ...definition.defaultDimensions,
    ...preset?.dimensions,
    ...overrides,
  }
  validateDimensions(definition, dimensions)
  return dimensions
}

function resolveGeometry(
  definition: CatalogDefinition,
  presetId: string | undefined,
  overrides: CatalogGeometryOverrides | undefined,
): GeometryDescriptor {
  const preset = resolvePreset(definition, presetId)
  const geometry = { ...definition.geometry } as GeometryDescriptor

  if (geometry.kind === 'panel-with-stand') {
    const panel = {
      ...geometry.panel,
      ...preset?.geometry?.panel,
      ...overrides?.panel,
    }

    if (overrides?.lDesk) {
      throw new Error(`${definition.id} does not support L-desk geometry overrides.`)
    }

    return { kind: geometry.kind, panel }
  }

  if (geometry.kind === 'l-desk') {
    const lDesk = overrides?.lDesk

    if (overrides?.panel) {
      throw new Error(`${definition.id} does not support panel geometry overrides.`)
    }

    return {
      kind: geometry.kind,
      mainTop: { ...geometry.mainTop, ...lDesk?.mainTop },
      returnTop: { ...geometry.returnTop, ...lDesk?.returnTop },
      returnSide: lDesk?.returnSide ?? geometry.returnSide,
    }
  }

  if (overrides?.panel || overrides?.lDesk) {
    throw new Error(`${definition.id} does not support geometry overrides.`)
  }

  return geometry
}

for (const definition of GENERIC_CATALOG_DEFINITIONS) {
  validateDimensions(definition, definition.defaultDimensions)
  for (const preset of definition.presets) {
    validateDimensions(definition, {
      ...definition.defaultDimensions,
      ...preset.dimensions,
    })
  }
}

export const CATALOG_DEFINITIONS: readonly CatalogDefinition[] = freezeCatalogData([
  ...GENERIC_CATALOG_DEFINITIONS,
])

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
  return resolveDimensions(definition, presetId, overrides)
}

export function resolveCatalogInstance(entity: Entity): ResolvedCatalogInstance {
  if (!entity.catalog) {
    throw new Error(`Entity ${entity.id} does not reference a catalog definition.`)
  }

  const definition = getCatalogDefinition(entity.catalog.itemId)
  const overrides = readCatalogInstanceOverrides(entity.overrides)
  const materialId = overrides.materialId ?? definition.materials[0]?.id

  if (
    !materialId ||
    !definition.materials.some((material) => material.id === materialId)
  ) {
    throw new Error(`Unknown material ${String(materialId)} for ${definition.id}`)
  }

  return {
    id: entity.id,
    catalog: entity.catalog,
    dimensions: resolveDimensions(
      definition,
      entity.catalog.presetId,
      overrides.dimensions,
    ),
    geometry: resolveGeometry(definition, entity.catalog.presetId, overrides.geometry),
    materialId,
    properties: { ...entity.properties, ...overrides.properties },
    capabilities: definition.capabilities,
    inspectorFields: definition.inspectorFields,
    portDefinitions: definition.ports,
  }
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
