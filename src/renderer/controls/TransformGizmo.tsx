import { TransformControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'

import type { EditorTool } from '../../app/editor-store'
import type { InteractionController } from './interaction-controller'

interface TransformGizmoProps {
  readonly entityId: string
  readonly object: Object3D | null
  readonly tool: EditorTool
  readonly enabled: boolean
  readonly controller: InteractionController
  readonly onOrbitEnabledChange: (enabled: boolean) => void
}

export function TransformGizmo({
  entityId,
  object,
  tool,
  enabled,
  controller,
  onOrbitEnabledChange,
}: TransformGizmoProps) {
  const controls = useRef<TransformControlsImpl>(null)

  useEffect(() => {
    const control = controls.current
    if (!control || !object || !enabled || tool === 'resize' || tool === 'cable') return
    const events = control as unknown as {
      addEventListener(
        type: string,
        listener: (event: { readonly value?: boolean }) => void,
      ): void
      removeEventListener(
        type: string,
        listener: (event: { readonly value?: boolean }) => void,
      ): void
    }
    const begin = () => controller.start(entityId, tool)
    const update = () => {
      if (!controller.active) return
      controller.updateTransform(
        [object.position.x, object.position.y, object.position.z],
        [object.rotation.x, object.rotation.y, object.rotation.z],
      )
    }
    const finish = () => {
      if (controller.active) controller.commit()
      onOrbitEnabledChange(true)
    }
    const dragging = (event: { readonly value?: boolean }) =>
      onOrbitEnabledChange(!event.value)
    events.addEventListener('mouseDown', begin)
    events.addEventListener('objectChange', update)
    events.addEventListener('mouseUp', finish)
    events.addEventListener('dragging-changed', dragging)
    return () => {
      events.removeEventListener('mouseDown', begin)
      events.removeEventListener('objectChange', update)
      events.removeEventListener('mouseUp', finish)
      events.removeEventListener('dragging-changed', dragging)
    }
  }, [controller, enabled, entityId, object, onOrbitEnabledChange, tool])

  useEffect(() => {
    if (!enabled) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !controller.active) return
      controller.cancel()
      onOrbitEnabledChange(true)
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [controller, enabled, onOrbitEnabledChange])

  useEffect(() => {
    if (!enabled && controller.active) controller.cancel()
  }, [controller, enabled])

  if (!object || !enabled || tool === 'resize' || tool === 'cable') return null
  return (
    <TransformControls
      ref={controls}
      object={object}
      mode={tool === 'move' ? 'translate' : 'rotate'}
    />
  )
}
