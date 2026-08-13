import type { CatalogReference, Dimensions, JsonObject, Vector3 } from '../domain/schema'

export type LocalizedText = Readonly<Record<'en' | 'ja', string>>

export type DimensionAxis = keyof Dimensions

export interface DimensionConstraint {
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

export interface DimensionPolicy {
  readonly mode: 'fixed' | 'bounded' | 'free'
  readonly axes: Readonly<Partial<Record<DimensionAxis, DimensionConstraint>>>
}

export type GeometryDescriptor =
  | Readonly<{ kind: 'box' }>
  | Readonly<{
      kind: 'panel-with-stand'
      panel: Readonly<{ width: number; height: number }>
    }>
  | Readonly<{
      kind: 'l-desk'
      mainTop: Readonly<{ width: number; depth: number }>
      returnTop: Readonly<{ width: number; depth: number }>
      returnSide: 'left' | 'right'
    }>

export type PlacementTargetClass = 'floor' | 'support-surface'

export interface SupportSurfaceDefinition {
  readonly id: string
  /** Center of the usable rectangle in catalog-local coordinates. */
  readonly center: Readonly<{ x: number; y: number; z: number }>
  readonly width: number
  readonly depth: number
  readonly usableClearanceHeight?: number
}

export interface PlacementProfile {
  readonly contactPlane: 'bottom'
  readonly allowedTargetClasses: readonly PlacementTargetClass[]
  readonly preferredTargetClass: PlacementTargetClass
  readonly supportSurfaces: readonly SupportSurfaceDefinition[]
}

export interface CatalogGeometryOverrides {
  readonly panel?: Readonly<Partial<{ width: number; height: number }>>
  readonly lDesk?: Readonly<{
    mainTop?: Readonly<Partial<{ width: number; depth: number }>>
    returnTop?: Readonly<Partial<{ width: number; depth: number }>>
    returnSide?: 'left' | 'right'
  }>
}

export interface CatalogInstanceOverrides {
  readonly dimensions?: Readonly<Partial<Dimensions>>
  readonly geometry?: CatalogGeometryOverrides
  readonly materialId?: string
  readonly properties?: JsonObject
}

export interface CatalogPreset {
  readonly id: string
  readonly displayName: LocalizedText
  readonly dimensions: Readonly<Partial<Dimensions>>
  readonly geometry?: CatalogGeometryOverrides
  readonly extensions: JsonObject
}

export interface CatalogMaterial {
  readonly id: string
  readonly displayName: LocalizedText
  readonly extensions: JsonObject
}

export interface InspectorField {
  readonly id: string
  readonly displayName: LocalizedText
  readonly type: 'text' | 'number' | 'select' | 'boolean'
  readonly extensions: JsonObject
}

export interface CatalogPortDefinition {
  readonly id: string
  readonly displayName: LocalizedText
  readonly kind: string
  readonly position?: Vector3
  readonly direction?: Vector3
  readonly extensions: JsonObject
}

export interface CatalogDefinition {
  readonly id: string
  readonly revision: string
  readonly category: string
  readonly displayName: LocalizedText
  readonly geometry: GeometryDescriptor
  readonly defaultDimensions: Readonly<Dimensions>
  readonly dimensionPolicy: DimensionPolicy
  readonly presets: readonly CatalogPreset[]
  readonly materials: readonly CatalogMaterial[]
  readonly capabilities: readonly string[]
  readonly inspectorFields: readonly InspectorField[]
  readonly ports: readonly CatalogPortDefinition[]
  readonly placement?: PlacementProfile
  readonly productUrl?: string
  readonly extensions: JsonObject
}

export type DimensionOverrides = Readonly<Partial<Dimensions>>

export interface CatalogOverrideTarget {
  readonly id: string
  readonly overrides: JsonObject
}

export interface ResolvedCatalogInstance {
  readonly id: string
  readonly catalog: CatalogReference
  readonly dimensions: Dimensions
  readonly geometry: GeometryDescriptor
  readonly materialId: string
  readonly properties: JsonObject
  readonly capabilities: readonly string[]
  readonly inspectorFields: readonly InspectorField[]
  readonly portDefinitions: readonly CatalogPortDefinition[]
  readonly placement: PlacementProfile
}
