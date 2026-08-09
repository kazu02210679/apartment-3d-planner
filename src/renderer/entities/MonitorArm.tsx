import { BoxPart, BoundsOutline, CylinderPart, type ModelProps } from './ModelPrimitives'

export function MonitorArm({ dimensions, material, outlineColor }: ModelProps) {
  const [width, height, depth] = dimensions
  const radius = Math.min(width, depth) * 0.13
  return (
    <group name="detailed-monitor-arm">
      <BoxPart
        size={[width * 0.7, height * 0.1, depth * 0.7]}
        position={[0, -height / 2 + height * 0.05, 0]}
        material={material}
        color="#202c3c"
      />
      <CylinderPart
        radius={radius}
        height={height * 0.72}
        position={[-width * 0.2, -height * 0.04, 0]}
        material={material}
        color="#2d3b4d"
      />
      <CylinderPart
        radius={radius * 0.7}
        height={width * 0.5}
        position={[width * 0.06, height * 0.16, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={material}
        color="#35465b"
      />
      <CylinderPart
        radius={radius * 0.7}
        height={width * 0.38}
        position={[width * 0.28, height * 0.29, 0]}
        rotation={[0, 0, -Math.PI / 5]}
        material={material}
        color="#35465b"
      />
      <BoxPart
        size={[width * 0.26, height * 0.2, depth * 0.25]}
        position={[width * 0.36, height * 0.31, 0]}
        material={material}
        color="#161f2d"
      />
      <BoundsOutline dimensions={dimensions} outlineColor={outlineColor} />
    </group>
  )
}
