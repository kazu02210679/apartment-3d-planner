import type { Room } from '../domain/schema'
import { toRendererDimensions } from './adapters'
import type { RendererProfile } from './quality'

interface RoomShellProps {
  readonly room: Room
  readonly onEmptyHit: () => void
  readonly profile?: RendererProfile
}

export function RoomShell({ room, onEmptyHit, profile }: RoomShellProps) {
  const [width, height, depth] = toRendererDimensions({
    width: room.width,
    depth: room.depth,
    height: room.height,
  })
  const wallThickness = 0.05
  const preview = profile?.id === 'preview'

  return (
    <group name="room-shell" onClick={onEmptyHit}>
      <mesh receiveShadow position={[0, -0.02, 0]}>
        <boxGeometry args={[width, 0.04, depth]} />
        <meshStandardMaterial
          color={preview ? '#4d4b48' : '#243448'}
          roughness={preview ? 0.82 : 0.96}
          metalness={0}
        />
      </mesh>
      {profile?.showGrid !== false ? (
        <gridHelper
          args={[
            Math.max(width, depth),
            Math.max(8, Math.ceil(Math.max(width, depth) * 4)),
            '#476787',
            '#344f69',
          ]}
          position={[0, 0.004, 0]}
        />
      ) : null}
      <mesh receiveShadow position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, wallThickness]} />
        <meshStandardMaterial
          color={preview ? '#3d4855' : '#172131'}
          roughness={preview ? 0.74 : 0.92}
          transparent
          opacity={preview ? 0.78 : 0.62}
        />
      </mesh>
      <mesh receiveShadow position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[wallThickness, height, depth]} />
        <meshStandardMaterial
          color={preview ? '#3d4855' : '#172131'}
          roughness={preview ? 0.74 : 0.92}
          transparent
          opacity={preview ? 0.78 : 0.62}
        />
      </mesh>
    </group>
  )
}
