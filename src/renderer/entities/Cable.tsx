import type { ThreeEvent } from '@react-three/fiber'
import { CatmullRomCurve3, Vector3 } from 'three'

import type { CableRoutingKind } from '../../domain/connections'
import type { Vector3 as SceneVector3 } from '../../domain/schema'

const COLORS: Record<CableRoutingKind, string> = {
  power: '#d7a45c',
  display: '#7fc4ff',
  network: '#d576d5',
  generic: '#aab6c7',
}

export function Cable({
  id,
  kind,
  diameterMm,
  points,
  selected = false,
  onSelect,
}: {
  readonly id: string
  readonly kind: CableRoutingKind
  readonly diameterMm: number
  readonly points: readonly SceneVector3[]
  readonly selected?: boolean
  readonly onSelect?: (id: string) => void
}) {
  if (points.length < 2) return null
  const curve = new CatmullRomCurve3(
    points.map((point) => new Vector3(point.x / 1000, point.y / 1000, point.z / 1000)),
    false,
    'centripetal',
  )
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect?.(id)
  }
  return (
    <mesh name={`cable-route-${id}`} onClick={select} castShadow receiveShadow>
      <tubeGeometry
        args={[
          curve,
          Math.min(96, Math.max(8, points.length * 16)),
          Math.max(0.001, diameterMm / 2000),
          6,
          false,
        ]}
      />
      <meshStandardMaterial
        color={selected ? '#d7f36b' : COLORS[kind]}
        roughness={0.45}
        metalness={0.2}
      />
    </mesh>
  )
}
