import {
  BoxPart,
  BoundsOutline,
  ModelBoundsProvider,
  type ModelProps,
} from './ModelPrimitives'

export function Printer({ dimensions, material, outlineColor }: ModelProps) {
  const [width, height, depth] = dimensions
  return (
    <group name="detailed-printer">
      <ModelBoundsProvider dimensions={dimensions}>
        <BoxPart
          size={[width * 0.92, height * 0.62, depth * 0.86]}
          position={[0, -height * 0.12, 0]}
          material={material}
          color="#3c4d62"
        />
        <BoxPart
          size={[width * 0.72, height * 0.18, depth * 0.68]}
          position={[0, height * 0.25, 0]}
          material={material}
          color="#596c81"
        />
        <BoxPart
          size={[width * 0.62, height * 0.05, depth * 0.35]}
          position={[0, -height * 0.14, depth / 2 - depth * 0.17]}
          material={material}
          color="#182433"
        />
        <BoxPart
          size={[width * 0.24, height * 0.06, Math.min(0.015, depth * 0.08)]}
          position={[0, height * 0.05, depth / 2]}
          material={material}
          color="#d7f36b"
        />
        <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
      </ModelBoundsProvider>
    </group>
  )
}
