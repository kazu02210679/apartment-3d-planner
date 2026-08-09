import { BoxPart, BoundsOutline, CylinderPart, type ModelProps } from './ModelPrimitives'

export type LivingFurnitureKind = 'chair' | 'bed' | 'side-table' | 'trash' | 'power-strip'

export function LivingFurniture({
  dimensions,
  material,
  outlineColor,
  kind,
}: ModelProps & { readonly kind: LivingFurnitureKind }) {
  const [width, height, depth] = dimensions
  const frame = material
  return (
    <group name={`detailed-${kind}`}>
      {kind === 'chair' ? (
        <>
          <BoxPart
            size={[width * 0.76, height * 0.18, depth * 0.68]}
            position={[0, -height * 0.12, 0]}
            material={frame}
            color="#43566c"
          />
          <BoxPart
            size={[width * 0.76, height * 0.48, depth * 0.12]}
            position={[0, height * 0.23, depth * 0.3]}
            material={frame}
            color="#43566c"
          />
          <CylinderPart
            radius={Math.min(width, depth) * 0.04}
            height={height * 0.52}
            position={[0, -height * 0.28, 0]}
            material={frame}
          />
          <BoxPart
            size={[width * 0.9, height * 0.04, depth * 0.12]}
            position={[0, -height * 0.49, 0]}
            material={frame}
          />
        </>
      ) : null}
      {kind === 'bed' ? (
        <>
          <BoxPart
            size={[width * 0.94, height * 0.38, depth * 0.94]}
            position={[0, -height * 0.18, 0]}
            material={frame}
            color="#405269"
          />
          <BoxPart
            size={[width * 0.9, height * 0.28, depth * 0.88]}
            position={[0, height * 0.16, 0]}
            material={frame}
            color="#c0c7d1"
          />
        </>
      ) : null}
      {kind === 'side-table' ? (
        <>
          <BoxPart
            size={[width, height * 0.12, depth]}
            position={[0, height * 0.42, 0]}
            material={frame}
          />
          {([-1, 1] as const)
            .flatMap((x) => ([-1, 1] as const).map((z) => [x, z] as const))
            .map(([x, z]) => (
              <CylinderPart
                key={`${x}-${z}`}
                radius={Math.min(width, depth) * 0.05}
                height={height * 0.82}
                position={[x * width * 0.36, 0, z * depth * 0.36]}
                material={frame}
              />
            ))}
        </>
      ) : null}
      {kind === 'trash' ? (
        <CylinderPart
          radius={Math.min(width, depth) * 0.38}
          height={height * 0.9}
          position={[0, 0, 0]}
          material={frame}
          color="#586a78"
        />
      ) : null}
      {kind === 'power-strip' ? (
        <>
          <BoxPart
            size={[width * 0.94, height * 0.72, depth * 0.9]}
            position={[0, 0, 0]}
            material={frame}
            color="#edf1f6"
          />
          {[-0.25, 0, 0.25].map((x) => (
            <CylinderPart
              key={x}
              radius={Math.min(height, depth) * 0.17}
              height={Math.min(0.01, depth * 0.1)}
              position={[x * width, 0, depth / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              material={frame}
              color="#253142"
            />
          ))}
        </>
      ) : null}
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
