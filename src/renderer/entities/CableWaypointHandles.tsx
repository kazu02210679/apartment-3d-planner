import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'

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
  onOrbitEnabledChange,
}: {
  readonly cable: Entity
  readonly store: EditorStore
  readonly onOrbitEnabledChange: (enabled: boolean) => void
}) {
  const active = useRef<
    | {
        readonly waypointId: string
        readonly target: { releasePointerCapture?(pointerId: number): void }
        readonly pointerId: number
      }
    | undefined
  >(undefined)
  const clear = useCallback(
    (commit: boolean) => {
      const gesture = active.current
      if (!gesture) return
      if (commit) store.commitInteraction()
      else store.cancelInteraction()
      gesture.target.releasePointerCapture?.(gesture.pointerId)
      active.current = undefined
      onOrbitEnabledChange(true)
    },
    [onOrbitEnabledChange, store],
  )
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clear(false)
    }
  }, [clear])
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
                const target = event.target as unknown as {
                  setPointerCapture(id: number): void
                  releasePointerCapture?(id: number): void
                }
                target.setPointerCapture(event.pointerId)
                active.current = {
                  waypointId: waypoint.id,
                  target,
                  pointerId: event.pointerId,
                }
                onOrbitEnabledChange(false)
              }
            }}
            onPointerMove={(event) => {
              if (active.current?.waypointId === waypoint.id) {
                event.stopPropagation()
                store.updateCableWaypointInteraction(
                  cable.id,
                  waypoint.id,
                  localFromEvent(event),
                )
              }
            }}
            onPointerUp={(event) => {
              if (active.current?.waypointId === waypoint.id) {
                event.stopPropagation()
                clear(true)
              }
            }}
            onPointerCancel={(event) => {
              if (active.current?.waypointId === waypoint.id) {
                event.stopPropagation()
                clear(false)
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
