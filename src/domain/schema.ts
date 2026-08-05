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

function hasCyclicObjectReferences(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (ancestors.has(value)) {
    return true
  }

  ancestors.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  const containsCycle = children.some((child) =>
    hasCyclicObjectReferences(child, ancestors),
  )
  ancestors.delete(value)

  return containsCycle
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
  if (hasCyclicObjectReferences(input)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SceneDocument must not contain cyclic object references.',
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
