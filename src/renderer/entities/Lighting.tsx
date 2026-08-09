import {
  BoxPart,
  BoundsOutline,
  CylinderPart,
  ModelBoundsProvider,
  type ModelProps,
} from './ModelPrimitives'

export function Lighting({
  dimensions,
  material,
  outlineColor,
  room = false,
}: ModelProps & { readonly room?: boolean }) {
  const [width, height, depth] = dimensions
  return (
    <group name={room ? 'detailed-room-light' : 'detailed-display-light'}>
      <ModelBoundsProvider dimensions={dimensions}>
        {room ? (
          <CylinderPart
            radius={Math.min(width, depth) * 0.42}
            height={Math.max(0.025, height * 0.55)}
            position={[0, 0, 0]}
            material={material}
            color="#ece7ce"
          />
        ) : (
          <>
            <BoxPart
              size={[width * 0.9, height * 0.46, depth * 0.6]}
              position={[0, 0, 0]}
              material={material}
              color="#26394b"
            />
            <BoxPart
              size={[width * 0.78, height * 0.08, Math.min(0.015, depth * 0.22)]}
              position={[0, -height * 0.2, depth / 2]}
              material={material}
              color="#fff0bf"
            />
          </>
        )}
        <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
      </ModelBoundsProvider>
    </group>
  )
}
