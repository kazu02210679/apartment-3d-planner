import type { Dimensions, Entity, JsonObject, JsonValue } from '../domain/schema'
import { GENERIC_CATALOG_DEFINITIONS } from './definitions/generic'
import type {
  CatalogDefinition,
  CatalogOverrideTarget,
  CatalogGeometryOverrides,
  CatalogInstanceOverrides,
  DimensionOverrides,
  GeometryDescriptor,
  PlacementProfile,
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

function assertAllowedKeys(
  value: JsonObject,
  allowedKeys: readonly string[],
  location: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unsupported ${location} override key: ${key}`)
    }
  }
}

function readDimensions(value: JsonValue | undefined): DimensionOverrides {
  if (value === undefined) {
    return {}
  }

  if (!isJsonObject(value)) {
    throw new Error('Catalog dimension overrides must be a JSON object.')
  }

  assertAllowedKeys(value, ['width', 'depth', 'height'], 'dimensions')
  const width = readPositiveNumber(value.width, 'dimensions.width')
  const depth = readPositiveNumber(value.depth, 'dimensions.depth')
  const height = readPositiveNumber(value.height, 'dimensions.height')

  return {
    ...(width !== undefined ? { width } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(height !== undefined ? { height } : {}),
  }
}

function readPlanarDimensions(value: JsonValue | undefined, name: string) {
  if (value === undefined) {
    return undefined
  }

  if (!isJsonObject(value)) {
    throw new Error(`Unsupported ${name} override: expected a JSON object.`)
  }

  assertAllowedKeys(value, ['width', 'depth'], name)
  const width = readPositiveNumber(value.width, `${name}.width`)
  const depth = readPositiveNumber(value.depth, `${name}.depth`)

  return {
    ...(width !== undefined ? { width } : {}),
    ...(depth !== undefined ? { depth } : {}),
  }
}

function readGeometryOverrides(
  value: JsonValue | undefined,
): CatalogGeometryOverrides | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isJsonObject(value)) {
    throw new Error('Unsupported geometry override: expected a JSON object.')
  }

  assertAllowedKeys(value, ['panel', 'lDesk'], 'geometry')

  const panel = value.panel
  const lDesk = value.lDesk

  if (panel !== undefined && !isJsonObject(panel)) {
    throw new Error('Unsupported geometry.panel override: expected a JSON object.')
  }

  if (lDesk !== undefined && !isJsonObject(lDesk)) {
    throw new Error('Unsupported geometry.lDesk override: expected a JSON object.')
  }

  if (isJsonObject(panel)) {
    assertAllowedKeys(panel, ['width', 'height'], 'geometry.panel')
  }

  if (isJsonObject(lDesk)) {
    assertAllowedKeys(lDesk, ['mainTop', 'returnTop', 'returnSide'], 'geometry.lDesk')
  }

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

function defaultPlacementProfile(): PlacementProfile {
  return {
    contactPlane: 'bottom',
    allowedTargetClasses: ['floor'],
    preferredTargetClass: 'floor',
    supportSurfaces: [],
  }
}

function resolvePlacementProfile(
  definition: CatalogDefinition,
  dimensions: Dimensions,
): PlacementProfile {
  const surface = (
    id: string,
    center: { x: number; y: number; z: number },
    width: number,
    depth: number,
    usableClearanceHeight?: number,
  ) => ({
    id,
    center,
    width,
    depth,
    ...(usableClearanceHeight === undefined ? {} : { usableClearanceHeight }),
  })
  const inferredProfile: PlacementProfile | undefined =
    definition.id === 'display.monitor'
      ? {
          contactPlane: 'bottom',
          allowedTargetClasses: ['floor', 'support-surface'],
          preferredTargetClass: 'support-surface',
          supportSurfaces: [],
        }
      : definition.id === 'desk.l-shaped-sit-stand'
        ? {
            contactPlane: 'bottom',
            allowedTargetClasses: ['floor', 'support-surface'],
            preferredTargetClass: 'support-surface',
            supportSurfaces: [
              surface('main-top', { x: 0, y: dimensions.height / 2, z: -350 }, 1800, 700),
              surface('return-top', { x: 200, y: dimensions.height / 2, z: 350 }, 1400, 600),
            ],
          }
        : definition.id === 'desk.straight'
          ? {
              contactPlane: 'bottom',
              allowedTargetClasses: ['floor', 'support-surface'],
              preferredTargetClass: 'support-surface',
              supportSurfaces: [
                surface('top', { x: 0, y: dimensions.height / 2, z: 0 }, dimensions.width, dimensions.depth),
              ],
            }
          : definition.id === 'desk.shelf'
            ? {
                contactPlane: 'bottom',
                allowedTargetClasses: ['floor', 'support-surface'],
                preferredTargetClass: 'support-surface',
                supportSurfaces: [
                  surface('top', { x: 0, y: dimensions.height / 2, z: 0 }, dimensions.width, dimensions.depth),
                ],
              }
            : definition.id === 'storage.shelf-cabinet'
              ? {
                  contactPlane: 'bottom',
                  allowedTargetClasses: ['floor', 'support-surface'],
                  preferredTargetClass: 'support-surface',
                  supportSurfaces: [
                    surface('interior-shelf-low', { x: 0, y: 320, z: 0 }, 700, 320, 520),
                    surface('top', { x: 0, y: dimensions.height / 2, z: 0 }, dimensions.width, dimensions.depth),
                  ],
                }
              : definition.id === 'table.side'
                ? {
                    contactPlane: 'bottom',
                    allowedTargetClasses: ['floor', 'support-surface'],
                    preferredTargetClass: 'support-surface',
                    supportSurfaces: [
                      surface('top', { x: 0, y: dimensions.height / 2, z: 0 }, dimensions.width, dimensions.depth),
                    ],
                  }
                : undefined
  const profile = definition.placement ?? inferredProfile ?? defaultPlacementProfile()
  const supportSurfaces = profile.supportSurfaces.map((surface) => {
    if (
      !Number.isFinite(surface.center.x) ||
      !Number.isFinite(surface.center.y) ||
      !Number.isFinite(surface.center.z) ||
      !Number.isFinite(surface.width) ||
      !Number.isFinite(surface.depth) ||
      surface.width <= 0 ||
      surface.depth <= 0 ||
      (surface.usableClearanceHeight !== undefined &&
        (!Number.isFinite(surface.usableClearanceHeight) ||
          surface.usableClearanceHeight <= 0))
    ) {
      throw new Error(`Invalid placement support surface ${surface.id} for ${definition.id}.`)
    }
    return {
      ...surface,
      center: { ...surface.center },
    }
  })
  const allowedTargetClasses = [...profile.allowedTargetClasses]
  const preferredTargetClass = profile.preferredTargetClass
  if (!allowedTargetClasses.includes(preferredTargetClass)) {
    throw new Error(`Invalid preferred placement target for ${definition.id}.`)
  }
  if (allowedTargetClasses.includes('support-surface') && supportSurfaces.length === 0) {
    // A support preference without declared surfaces is safe but can only fall back.
    return {
      ...defaultPlacementProfile(),
      allowedTargetClasses,
      preferredTargetClass,
      supportSurfaces,
    }
  }
  // Touch the resolved dimensions here so future dimension-dependent profiles have a
  // single validation boundary without adding placement data to SceneDocument.
  if (Object.values(dimensions).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`Invalid resolved dimensions for ${definition.id} placement.`)
  }
  return {
    contactPlane: 'bottom',
    allowedTargetClasses,
    preferredTargetClass,
    supportSurfaces,
  }
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

  if (entity.catalog.revision !== definition.revision) {
    throw new Error(
      `Catalog revision mismatch for ${definition.id}: expected ${definition.revision}, received ${entity.catalog.revision}.`,
    )
  }

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
    placement: resolvePlacementProfile(
      definition,
      resolveDimensions(definition, entity.catalog.presetId, overrides.dimensions),
    ),
  }
}

export function resetCatalogOverrides(
  entity: CatalogOverrideTarget,
  key?: string,
): CatalogOverrideTarget {
  if (!key) {
    return { ...entity, overrides: {} }
  }

  const supportedPaths: Record<string, readonly string[]> = {
    'dimensions.width': ['dimensions', 'width'],
    'dimensions.depth': ['dimensions', 'depth'],
    'dimensions.height': ['dimensions', 'height'],
    'geometry.panel.width': ['geometry', 'panel', 'width'],
    'geometry.panel.height': ['geometry', 'panel', 'height'],
    'geometry.lDesk.mainTop.width': ['geometry', 'lDesk', 'mainTop', 'width'],
    'geometry.lDesk.mainTop.depth': ['geometry', 'lDesk', 'mainTop', 'depth'],
    'geometry.lDesk.returnTop.width': ['geometry', 'lDesk', 'returnTop', 'width'],
    'geometry.lDesk.returnTop.depth': ['geometry', 'lDesk', 'returnTop', 'depth'],
    'geometry.lDesk.returnSide': ['geometry', 'lDesk', 'returnSide'],
    materialId: ['materialId'],
  }
  const path = supportedPaths[key]

  if (!path) {
    throw new Error(`Unsupported catalog override path: ${key}`)
  }

  const overrides = structuredClone(entity.overrides)
  const parents: JsonObject[] = []
  let current: JsonObject = overrides

  for (const part of path.slice(0, -1)) {
    const next = current[part]

    if (!isJsonObject(next)) {
      return { ...entity, overrides }
    }

    parents.push(current)
    current = next
  }

  delete current[path[path.length - 1]]

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index]
    const childKey = path[index]
    const child = parent[childKey]

    if (isJsonObject(child) && Object.keys(child).length === 0) {
      delete parent[childKey]
    }
  }

  return { ...entity, overrides }
}
