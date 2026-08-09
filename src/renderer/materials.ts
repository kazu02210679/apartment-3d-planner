export interface RendererMaterial {
  readonly color: string
  readonly metalness: number
  readonly roughness: number
}

const MATERIALS: Readonly<Record<string, RendererMaterial>> = {
  laminate: { color: '#56677a', metalness: 0.08, roughness: 0.62 },
  'matte-black': { color: '#1d2430', metalness: 0.18, roughness: 0.78 },
  standard: { color: '#6d89a8', metalness: 0.12, roughness: 0.65 },
  wood: { color: '#8f6d4c', metalness: 0.04, roughness: 0.72 },
}

export const DEFAULT_RENDERER_MATERIAL: RendererMaterial = MATERIALS.standard

export function resolveRendererMaterial(
  materialId?: string,
  preview = false,
): RendererMaterial {
  const material = (materialId && MATERIALS[materialId]) || DEFAULT_RENDERER_MATERIAL
  return preview
    ? {
        ...material,
        roughness: Math.max(0.36, material.roughness - 0.18),
        metalness: Math.min(0.4, material.metalness + 0.08),
      }
    : material
}
