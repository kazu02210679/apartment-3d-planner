import { BoxPart, BoundsOutline, type ModelProps } from './ModelPrimitives'

export function Computer({
  dimensions,
  material,
  outlineColor,
  kind,
}: ModelProps & { readonly kind: 'tower' | 'mac' | 'mini' }) {
  const [width, height, depth] = dimensions
  const isTower = kind === 'tower'
  return (
    <group name={`detailed-computer-${kind}`}>
      <BoxPart
        size={[width * (isTower ? 0.84 : 0.96), height * 0.9, depth * 0.9]}
        position={[0, -height * 0.02, 0]}
        material={material}
        color={isTower ? '#202b38' : '#596877'}
      />
      <BoxPart
        size={[
          width * 0.62,
          height * (isTower ? 0.28 : 0.18),
          Math.min(0.012, depth * 0.09),
        ]}
        position={[0, height * 0.13, depth / 2 - 0.005]}
        material={material}
        color="#101823"
      />
      {isTower ? (
        <BoxPart
          size={[width * 0.16, height * 0.07, Math.min(0.014, depth * 0.1)]}
          position={[0, height * 0.3, depth / 2]}
          material={material}
          color="#d7f36b"
        />
      ) : null}
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
