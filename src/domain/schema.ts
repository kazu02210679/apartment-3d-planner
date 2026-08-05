import { z } from 'zod'

import { RoomPresetIdSchema } from './room-presets'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

export const JsonObjectSchema = z.record(z.string(), JsonValueSchema)

export const OpaqueIdSchema = z.string().min(1)
export const FiniteNumberSchema = z.number().finite()
export const PositiveFiniteNumberSchema = FiniteNumberSchema.positive()

export const Vector3Schema = z
  .object({
    x: FiniteNumberSchema,
    y: FiniteNumberSchema,
    z: FiniteNumberSchema,
  })
  .strict()

export const DimensionsSchema = z
  .object({
    width: PositiveFiniteNumberSchema,
    depth: PositiveFiniteNumberSchema,
    height: PositiveFiniteNumberSchema,
  })
  .strict()

export const RoomDimensionsSchema = DimensionsSchema

export const TransformSchema = z
  .object({
    position: Vector3Schema,
    rotation: Vector3Schema,
  })
  .strict()

export const PortSchema = z
  .object({
    id: OpaqueIdSchema,
    name: z.string().min(1),
    kind: z.string().min(1).optional(),
    position: Vector3Schema.optional(),
    direction: Vector3Schema.optional(),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const CatalogReferenceSchema = z
  .object({
    itemId: z.string().min(1),
    revision: z.string().min(1),
    presetId: z.string().min(1).optional(),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const EntitySchema = z
  .object({
    id: OpaqueIdSchema,
    kind: z.string().min(1),
    name: z.string().min(1),
    parentId: OpaqueIdSchema.nullable().default(null),
    transform: TransformSchema,
    dimensions: DimensionsSchema,
    catalog: CatalogReferenceSchema.optional(),
    overrides: JsonObjectSchema.default({}),
    ports: z.array(PortSchema).default([]),
    properties: JsonObjectSchema.default({}),
    visible: z.boolean().default(true),
    locked: z.boolean().default(false),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const MetadataSchema = z
  .object({
    name: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const RoomSchema = z
  .object({
    id: OpaqueIdSchema,
    name: z.string().min(1),
    preset: RoomPresetIdSchema.nullable().default(null),
    width: PositiveFiniteNumberSchema,
    depth: PositiveFiniteNumberSchema,
    height: PositiveFiniteNumberSchema,
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const ConnectionEndpointSchema = z
  .object({
    entityId: OpaqueIdSchema,
    portId: OpaqueIdSchema,
  })
  .strict()

export const ConnectionSchema = z
  .object({
    id: OpaqueIdSchema,
    endpoints: z.array(ConnectionEndpointSchema).min(2),
    kind: z.string().min(1).optional(),
    properties: JsonObjectSchema.default({}),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

function isArrayIndexProperty(name: string): boolean {
  const index = Number(name)

  return (
    Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === name
  )
}

function findLosslessJsonViolation(
  value: unknown,
  ancestors = new Set<object>(),
): string | undefined {
  if (value === undefined) {
    return 'undefined values are not valid persisted JSON.'
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return undefined
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? undefined
      : 'non-finite numbers are not valid persisted JSON.'
  }

  if (
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    return `${typeof value} values are not valid persisted JSON.`
  }

  if (typeof value !== 'object') {
    return `Values of type ${typeof value} are not valid persisted JSON.`
  }

  if (ancestors.has(value)) {
    return 'cyclic object references are not valid persisted JSON.'
  }

  ancestors.add(value)

  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return 'symbol-keyed array properties are not valid persisted JSON.'
    }

    for (const propertyName of Object.getOwnPropertyNames(value)) {
      if (propertyName !== 'length' && !isArrayIndexProperty(propertyName)) {
        return 'arrays may only contain indexed JSON values.'
      }
    }

    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return 'sparse arrays are not valid persisted JSON.'
      }

      const violation = findLosslessJsonViolation(value[index], ancestors)

      if (violation) {
        return violation
      }
    }
  } else {
    const prototype = Object.getPrototypeOf(value)

    if (prototype !== Object.prototype && prototype !== null) {
      return 'only plain objects are valid persisted JSON objects.'
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return 'symbol-keyed object properties are not valid persisted JSON.'
    }

    const ownPropertyNames = Object.getOwnPropertyNames(value)
    const enumerablePropertyNames = Object.keys(value)

    if (ownPropertyNames.length !== enumerablePropertyNames.length) {
      return 'non-enumerable object properties are not valid persisted JSON.'
    }

    const objectValue = value as Record<string, unknown>

    for (const propertyName of enumerablePropertyNames) {
      const violation = findLosslessJsonViolation(objectValue[propertyName], ancestors)

      if (violation) {
        return violation
      }
    }
  }

  ancestors.delete(value)
  return undefined
}

const SceneDocumentBaseSchema = z
  .object({
    id: OpaqueIdSchema,
    format: z.literal('home-lab-scene'),
    schemaVersion: z.literal(1),
    metadata: MetadataSchema,
    room: RoomSchema,
    entities: z.array(EntitySchema).default([]),
    connections: z.array(ConnectionSchema).default([]),
    extensions: JsonObjectSchema.default({}),
  })
  .strict()

export const SceneDocumentSchema = z.preprocess((input, context) => {
  const violation = findLosslessJsonViolation(input)

  if (violation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: violation,
    })
    return z.NEVER
  }

  return input
}, SceneDocumentBaseSchema)

export type Vector3 = z.infer<typeof Vector3Schema>
export type Dimensions = z.infer<typeof DimensionsSchema>
export type Transform = z.infer<typeof TransformSchema>
export type Port = z.infer<typeof PortSchema>
export type CatalogReference = z.infer<typeof CatalogReferenceSchema>
export type Entity = z.infer<typeof EntitySchema>
export type Metadata = z.infer<typeof MetadataSchema>
export type Room = z.infer<typeof RoomSchema>
export type RoomDimensions = z.infer<typeof RoomDimensionsSchema>
export type ConnectionEndpoint = z.infer<typeof ConnectionEndpointSchema>
export type Connection = z.infer<typeof ConnectionSchema>
export type SceneDocument = z.infer<typeof SceneDocumentSchema>
export type SceneDocumentInput = z.input<typeof SceneDocumentSchema>
