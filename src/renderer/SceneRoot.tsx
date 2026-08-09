import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import type { SceneDocument } from '../domain/schema'
import { EntityRenderer } from './entities/EntityRenderer'
import { PreviewEnvironment } from './PreviewEnvironment'
import { getRendererProfile } from './quality'
import { RoomShell } from './RoomShell'
import type { EditorStore, EditorTool } from '../app/editor-store'
import { getCatalogDefinition, resolveCatalogInstance } from '../catalog/catalog'
import { ResizeHandles } from './controls/ResizeHandles'
import { TransformGizmo } from './controls/TransformGizmo'
import { createInteractionController } from './controls/interaction-controller'

export type CameraIntent = 'idle' | 'zoom-in' | 'zoom-out' | 'top' | 'reset'

function CameraControls({
  intent,
  enabled,
}: {
  readonly intent: CameraIntent
  readonly enabled: boolean
}) {
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
      enabled={enabled}
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
  readonly store: EditorStore
  readonly mode: 'edit' | 'preview'
  readonly activeTool: EditorTool
  readonly onEntitySelect: (id: string) => void
  readonly onEmptyHit: () => void
}

export function SceneRoot({
  scene,
  selectedEntityIds,
  outOfBoundsEntityIds,
  cameraIntent,
  store,
  mode,
  activeTool,
  onEntitySelect,
  onEmptyHit,
}: SceneRootProps) {
  const profile = getRendererProfile(mode)
  const objects = useRef(new Map<string, Group>())
  const [selectedObject, setSelectedObject] = useState<Group | null>(null)
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const controller = useMemo(() => createInteractionController(store), [store])
  const selectedId = selectedEntityIds[0] ?? null
  const selectedEntity = selectedId
    ? scene.entities.find((entity) => entity.id === selectedId)
    : undefined
  const canDirectManipulate = Boolean(
    selectedEntity && selectedEntity.visible && !selectedEntity.locked,
  )
  const canResize = Boolean(
    selectedEntity &&
    selectedEntity.visible &&
    !selectedEntity.locked &&
    Object.values(selectedEntity.dimensions).every(
      (value) => Number.isFinite(value) && value > 0,
    ) &&
    (!selectedEntity.catalog ||
      getCatalogDefinition(selectedEntity.catalog.itemId)?.dimensionPolicy.mode !==
        'fixed'),
  )
  const resolvedSelectedDimensions = (() => {
    if (!selectedEntity?.catalog) return selectedEntity?.dimensions
    try {
      return resolveCatalogInstance(selectedEntity).dimensions
    } catch {
      return selectedEntity.dimensions
    }
  })()
  const registerObject = useCallback(
    (id: string, object: Group | null) => {
      if (object) objects.current.set(id, object)
      else objects.current.delete(id)
      if (id === selectedId) setSelectedObject(object)
    },
    [selectedId],
  )
  useEffect(
    () =>
      setSelectedObject(selectedId ? (objects.current.get(selectedId) ?? null) : null),
    [selectedId],
  )
  const childrenOf = (parentId: string | null) =>
    scene.entities.filter((entity) => entity.parentId === parentId)
  const renderEntity = (entity: SceneDocument['entities'][number]) => (
    <EntityRenderer
      key={entity.id}
      entity={entity}
      selected={selectedEntityIds.includes(entity.id)}
      outOfBounds={outOfBoundsEntityIds.includes(entity.id)}
      onSelect={onEntitySelect}
      onObjectReady={registerObject}
    >
      {mode === 'edit' &&
      entity.id === selectedId &&
      activeTool === 'resize' &&
      canResize &&
      selectedObject &&
      resolvedSelectedDimensions ? (
        <ResizeHandles
          entityId={entity.id}
          entityObject={selectedObject}
          dimensions={resolvedSelectedDimensions}
          enabled={mode === 'edit' && canDirectManipulate}
          controller={controller}
        />
      ) : null}
      {childrenOf(entity.id).map(renderEntity)}
    </EntityRenderer>
  )

  return (
    <>
      <PreviewEnvironment profile={profile} />
      <RoomShell room={scene.room} onEmptyHit={onEmptyHit} profile={profile} />
      {childrenOf(null).map(renderEntity)}
      {mode === 'edit' && selectedId ? (
        <TransformGizmo
          entityId={selectedId}
          object={selectedObject}
          tool={activeTool}
          enabled={mode === 'edit' && canDirectManipulate}
          controller={controller}
          onOrbitEnabledChange={setOrbitEnabled}
        />
      ) : null}
      <CameraControls intent={cameraIntent} enabled={orbitEnabled} />
    </>
  )
}
