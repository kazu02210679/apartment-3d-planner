import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'

import type { EditorStore } from '../../app/editor-store'
import {
  getWorldTransform,
  inverseTransformPoint,
  transformPoint,
} from '../../commands/math'
import type { Entity, Vector3 } from '../../domain/schema'

export function CableWaypointHandles({
  cable,
  store,
}: {
  readonly cable: Entity
  readonly store: EditorStore
}) {
  const active = useRef<string | undefined>(undefined)
  if (cable.locked || !cable.visible || cable.catalog?.itemId !== 'cable.generic')
    return null
  const routing = cable.properties.routing as
    | {
        readonly waypoints?: readonly {
          readonly id: string
          readonly position: Vector3
        }[]
      }
    | undefined
  const world = getWorldTransform(cable.id, store.getSnapshot().scene.entities)
  const localToWorld = (position: Vector3) => {
    const offset = transformPoint(world.rotation, position)
    return {
      x: world.position.x + offset.x,
      y: world.position.y + offset.y,
      z: world.position.z + offset.z,
    }
  }
  const localFromEvent = (event: ThreeEvent<PointerEvent>) =>
    inverseTransformPoint(world.rotation, {
      x: event.unprojectedPoint.x * 1000 - world.position.x,
      y: event.unprojectedPoint.y * 1000 - world.position.y,
      z: event.unprojectedPoint.z * 1000 - world.position.z,
    })
  return (
    <group name={`cable-waypoint-handles-${cable.id}`}>
      {(routing?.waypoints ?? []).map((waypoint) => {
        const position = localToWorld(waypoint.position)
        return (
          <mesh
            key={waypoint.id}
            name={`cable-waypoint-${cable.id}-${waypoint.id}`}
            position={[position.x / 1000, position.y / 1000, position.z / 1000]}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (store.beginCableWaypointInteraction(cable.id, waypoint.id)) {
                active.current = waypoint.id
                ;(
                  event.target as unknown as { setPointerCapture(id: number): void }
                ).setPointerCapture(event.pointerId)
              }
            }}
            onPointerMove={(event) => {
              if (active.current === waypoint.id) {
                event.stopPropagation()
                store.updateCableWaypointInteraction(
                  cable.id,
                  waypoint.id,
                  localFromEvent(event),
                )
              }
            }}
            onPointerUp={(event) => {
              if (active.current === waypoint.id) {
                event.stopPropagation()
                store.commitInteraction()
                active.current = undefined
              }
            }}
            onPointerCancel={(event) => {
              if (active.current === waypoint.id) {
                event.stopPropagation()
                store.cancelInteraction()
                active.current = undefined
              }
            }}
          >
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#ffca6b" />
          </mesh>
        )
      })}
    </group>
  )
}
