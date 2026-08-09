import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import type { SceneDocument } from '../domain/schema'
import { EntityRenderer } from './entities/EntityRenderer'
import { RoomShell } from './RoomShell'

export type CameraIntent = 'idle' | 'zoom-in' | 'zoom-out' | 'top' | 'reset'

function CameraControls({ intent }: { readonly intent: CameraIntent }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()

  useEffect(() => {
    const orbit = controls.current
    if (!orbit || intent === 'idle') return
    if (intent === 'zoom-in') orbit.dollyIn(1.25)
    if (intent === 'zoom-out') orbit.dollyOut(1.25)
    if (intent === 'top') {
      camera.position.set(0, 6, 0.001)
      orbit.target.set(0, 0, 0)
    }
    if (intent === 'reset') orbit.reset()
    orbit.update()
  }, [camera, intent])

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      enablePan
      enableZoom
      maxDistance={14}
      minDistance={1.1}
      target={[0, 0.8, 0]}
    />
  )
}

interface SceneRootProps {
  readonly scene: SceneDocument
  readonly selectedEntityIds: readonly string[]
  readonly outOfBoundsEntityIds: readonly string[]
  readonly cameraIntent: CameraIntent
  readonly onEntitySelect: (id: string) => void
  readonly onEmptyHit: () => void
}

export function SceneRoot({
  scene,
  selectedEntityIds,
  outOfBoundsEntityIds,
  cameraIntent,
  onEntitySelect,
  onEmptyHit,
}: SceneRootProps) {
  const childrenOf = (parentId: string | null) =>
    scene.entities.filter((entity) => entity.parentId === parentId)
  const renderEntity = (entity: SceneDocument['entities'][number]) => (
    <EntityRenderer
      key={entity.id}
      entity={entity}
      selected={selectedEntityIds.includes(entity.id)}
      outOfBounds={outOfBoundsEntityIds.includes(entity.id)}
      onSelect={onEntitySelect}
    >
      {childrenOf(entity.id).map(renderEntity)}
    </EntityRenderer>
  )

  return (
    <>
      <color attach="background" args={['#0d121d']} />
      <ambientLight intensity={0.68} />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[4, 7, 4]}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight intensity={0.4} position={[-4, 3, -2]} color="#7fc4ff" />
      <RoomShell room={scene.room} onEmptyHit={onEmptyHit} />
      {childrenOf(null).map(renderEntity)}
      <CameraControls intent={cameraIntent} />
    </>
  )
}
