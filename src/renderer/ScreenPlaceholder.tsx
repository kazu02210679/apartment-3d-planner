import type { RendererVector3 } from './adapters'

export type ScreenPlaceholderMode = 'workstation' | 'market' | 'calendar' | 'photo'

export function ScreenPlaceholder({
  width,
  height,
  position,
  mode = 'workstation',
}: {
  readonly width: number
  readonly height: number
  readonly position: RendererVector3
  readonly mode?: ScreenPlaceholderMode
}) {
  const accent =
    mode === 'market'
      ? '#36d39b'
      : mode === 'calendar'
        ? '#7fc4ff'
        : mode === 'photo'
          ? '#f4b860'
          : '#d7f36b'
  const tileHeight = height * 0.25
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#111a29" />
      </mesh>
      {[-0.3, 0, 0.3].map((offset, index) => (
        <mesh key={offset} position={[offset * width, height * 0.18, 0.002]}>
          <planeGeometry args={[width * 0.22, tileHeight]} />
          <meshBasicMaterial color={index === 1 ? accent : '#25344b'} />
        </mesh>
      ))}
      {[-0.18, -0.32].map((offset) => (
        <mesh key={offset} position={[-width * 0.12, offset * height, 0.002]}>
          <planeGeometry args={[width * 0.55, height * 0.045]} />
          <meshBasicMaterial color="#657895" />
        </mesh>
      ))}
    </group>
  )
}
