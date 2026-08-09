import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3 } from '../../domain/schema'

export function PortMarker({
  entityId,
  portId,
  position,
  onSelect,
}: {
  readonly entityId: string
  readonly portId: string
  readonly position: Vector3
  readonly onSelect: (entityId: string, portId: string) => void
}) {
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(entityId, portId)
  }
  return (
    <mesh
      name={`port-marker-${entityId}-${portId}`}
      position={[position.x / 1000, position.y / 1000, position.z / 1000]}
      onClick={select}
    >
      <sphereGeometry args={[0.035, 12, 12]} />
      <meshBasicMaterial color="#d7f36b" />
    </mesh>
  )
}
