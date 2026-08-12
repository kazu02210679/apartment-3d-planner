import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import type { SceneDocument } from '../domain/schema'
import { EntityRenderer } from './entities/EntityRenderer'
import { Cable } from './entities/Cable'
import { PortMarker } from './entities/PortMarker'
import { CableWaypointHandles } from './entities/CableWaypointHandles'
import {
  getCableRouting,
  resolveCableRoute,
  resolvePortWorldAnchor,
} from '../domain/connections'
import { PreviewEnvironment } from './PreviewEnvironment'
import type { RendererProfile } from './quality'
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
  readonly profile: RendererProfile
  readonly activeTool: EditorTool
  readonly onEntitySelect: (id: string) => void
  readonly onEntityContextMenu?: (id: string, event: MouseEvent) => void
  readonly onEmptyHit: () => void
  readonly onResizeStart?: () => void
}

export function SceneRoot({
  scene,
  selectedEntityIds,
  outOfBoundsEntityIds,
  cameraIntent,
  store,
  mode,
  profile,
  activeTool,
  onEntitySelect,
  onEntityContextMenu = () => undefined,
  onEmptyHit,
  onResizeStart = () => undefined,
}: SceneRootProps) {
  const objects = useRef(new Map<string, Group>())
  const [selectedObject, setSelectedObject] = useState<Group | null>(null)
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const controller = useMemo(() => createInteractionController(store), [store])
  const selectedId = selectedEntityIds[0] ?? null
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
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
      (() => {
        try {
          return (
            getCatalogDefinition(selectedEntity.catalog.itemId).dimensionPolicy.mode !==
            'fixed'
          )
        } catch {
          return true
        }
      })()),
  )
  const resolvedSelectedDimensions = (() => {
    if (!selectedEntity?.catalog) return selectedEntity?.dimensions
    try {
      return resolveCatalogInstance(selectedEntity).dimensions
    } catch {
      return selectedEntity.dimensions
    }
  })()
  const registerObject = useCallback((id: string, object: Group | null) => {
    if (object) objects.current.set(id, object)
    else objects.current.delete(id)
    if (id === selectedIdRef.current) setSelectedObject(object)
  }, [])
  useEffect(
    () =>
      setSelectedObject(selectedId ? (objects.current.get(selectedId) ?? null) : null),
    [selectedId],
  )
  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, SceneDocument['entities']>()
    for (const entity of scene.entities) {
      const children = result.get(entity.parentId)
      if (children) children.push(entity)
      else result.set(entity.parentId, [entity])
    }
    return result
  }, [scene.entities])
  const cables = scene.entities.filter(
    (entity) => entity.catalog?.itemId === 'cable.generic' && entity.visible,
  )
  const selectPort = (entityId: string, portId: string) => {
    const draft = store.getSnapshot().cableDraft
    if (draft) store.completeCableDraft(entityId, portId)
    else store.beginCableDraft(entityId, portId)
  }
  const renderEntity = (entity: SceneDocument['entities'][number]) => {
    const children = childrenByParent.get(entity.id)
    const resizeHandle =
      mode === 'edit' &&
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
          onResizeStart={onResizeStart}
        />
      ) : undefined
    const childNodes = children?.length ? children.map(renderEntity) : undefined
    const content = resizeHandle ? (
      <>
        {resizeHandle}
        {childNodes}
      </>
    ) : (
      childNodes
    )
    return (
      <EntityRenderer
        key={entity.id}
        entity={entity}
        selected={mode === 'edit' && selectedEntityIds.includes(entity.id)}
        outOfBounds={outOfBoundsEntityIds.includes(entity.id)}
        onSelect={onEntitySelect}
        onContextMenu={onEntityContextMenu}
        onObjectReady={registerObject}
        profile={profile}
      >
        {content}
      </EntityRenderer>
    )
  }

  return (
    <>
      <PreviewEnvironment profile={profile} />
      <RoomShell room={scene.room} onEmptyHit={onEmptyHit} profile={profile} />
      {mode === 'preview' && profile.contactGrounding ? (
        <ContactShadows
          position={[0, 0.01, 0]}
          scale={4.5}
          far={4.5}
          blur={2.4}
          opacity={0.24}
          frames={1}
          resolution={512}
        />
      ) : null}
      {childrenByParent.get(null)?.map(renderEntity)}
      {cables.map((cable) => {
        try {
          const routing = getCableRouting(cable)
          return (
            <Cable
              key={`route-${cable.id}`}
              id={cable.id}
              kind={routing.kind}
              diameterMm={routing.diameterMm}
              points={resolveCableRoute(scene, cable)}
              selected={mode === 'edit' && selectedEntityIds.includes(cable.id)}
              onSelect={onEntitySelect}
            />
          )
        } catch {
          return null
        }
      })}
      {mode === 'edit' && activeTool === 'cable'
        ? scene.entities.flatMap((entity) => {
            if (!entity.visible || entity.locked) return []
            return entity.ports.map((port) => {
              const endpoint = { entityId: entity.id, portId: port.id }
              try {
                return (
                  <PortMarker
                    key={`marker-${entity.id}-${port.id}`}
                    entityId={entity.id}
                    portId={port.id}
                    position={resolvePortWorldAnchor(scene, endpoint)}
                    onSelect={selectPort}
                  />
                )
              } catch {
                return null
              }
            })
          })
        : null}
      {mode === 'edit' && activeTool === 'cable'
        ? cables.map((cable) => (
            <CableWaypointHandles
              key={`waypoint-handles-${cable.id}`}
              cable={cable}
              store={store}
              onOrbitEnabledChange={setOrbitEnabled}
            />
          ))
        : null}
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
