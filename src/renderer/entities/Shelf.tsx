import { BoxPart, BoundsOutline, type ModelProps } from './ModelPrimitives'

export function Shelf({
  dimensions,
  material,
  outlineColor,
  cabinet = false,
}: ModelProps & { readonly cabinet?: boolean }) {
  const [width, height, depth] = dimensions
  const board = Math.min(0.04, height * 0.12)
  const side = Math.min(0.04, width * 0.12)
  const levels = cabinet ? [-0.25, 0, 0.25] : [-0.3, 0.08, 0.33]
  return (
    <group name={cabinet ? 'detailed-cabinet' : 'detailed-shelf'}>
      <BoxPart
        size={[width, board, depth]}
        position={[0, -height / 2 + board / 2, 0]}
        material={material}
      />
      <BoxPart
        size={[width, board, depth]}
        position={[0, height / 2 - board / 2, 0]}
        material={material}
      />
      {([-1, 1] as const).map((sideDirection) => (
        <BoxPart
          key={sideDirection}
          size={[side, height, depth]}
          position={[sideDirection * (width / 2 - side / 2), 0, 0]}
          material={material}
        />
      ))}
      {levels.map((ratio) => (
        <BoxPart
          key={ratio}
          size={[width - side * 2, board, depth * 0.92]}
          position={[0, ratio * height, 0]}
          material={material}
          color="#4a5d72"
        />
      ))}
      {cabinet ? (
        <BoxPart
          size={[width * 0.8, height * 0.72, Math.min(0.025, depth * 0.08)]}
          position={[0, 0, depth / 2 - 0.01]}
          material={material}
          color="#35475d"
        />
      ) : null}
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
