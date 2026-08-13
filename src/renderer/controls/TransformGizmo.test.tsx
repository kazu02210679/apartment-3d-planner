import { create } from '@react-three/test-renderer'
import { forwardRef, useImperativeHandle } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Object3D } from 'three'

const events = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: { readonly value?: boolean }) => void>>()
  return {
    control: {
      addEventListener: vi.fn(
        (type: string, listener: (event: { readonly value?: boolean }) => void) => {
          const entries = listeners.get(type) ?? new Set()
          entries.add(listener)
          listeners.set(type, entries)
        },
      ),
      removeEventListener: vi.fn(
        (type: string, listener: (event: { readonly value?: boolean }) => void) =>
          listeners.get(type)?.delete(listener),
      ),
    },
    emit: (type: string, event: { readonly value?: boolean } = {}) =>
      listeners.get(type)?.forEach((listener) => listener(event)),
    reset: () => {
      listeners.clear()
      events.control.addEventListener.mockClear()
      events.control.removeEventListener.mockClear()
    },
  }
})

vi.mock('@react-three/drei', () => ({
  TransformControls: forwardRef((_: object, ref) => {
    useImperativeHandle(ref, () => events.control)
    return <group name="transform-controls" />
  }),
}))

import type { InteractionController } from './interaction-controller'
import { TransformGizmo } from './TransformGizmo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TransformGizmo', () => {
  it('does not attach controls or gesture listeners when direct manipulation is disabled', async () => {
    events.reset()
    const controller: InteractionController = {
      active: false,
      start: vi.fn(),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    }
    const renderer = await create(
      <TransformGizmo
        entityId="locked"
        object={{} as Object3D}
        tool="move"
        enabled={false}
        controller={controller}
        onOrbitEnabledChange={vi.fn()}
      />,
    )

    expect(renderer.scene.children).toHaveLength(0)
    expect(events.control.addEventListener).not.toHaveBeenCalled()
  })

  it('disables orbit during a gesture, commits on mouse up, and cancels on Escape', async () => {
    events.reset()
    let active = false
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: vi.fn(() => {
        active = true
        return true
      }),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(() => {
        active = false
        return true
      }),
      cancel: vi.fn(() => {
        active = false
        return true
      }),
    }
    const object = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
    } as unknown as Object3D
    const orbit = vi.fn()
    await create(
      <TransformGizmo
        entityId="entity"
        object={object}
        tool="move"
        enabled
        controller={controller}
        onOrbitEnabledChange={orbit}
      />,
    )

    events.emit('mouseDown')
    events.emit('dragging-changed', { value: true })
    events.emit('objectChange')
    events.emit('mouseUp')
    expect(controller.start).toHaveBeenCalledWith('entity', 'move', object)
    expect(controller.updateTransform).toHaveBeenCalledWith([1, 2, 3], [0.1, 0.2, 0.3])
    expect(controller.commit).toHaveBeenCalledTimes(1)
    expect(orbit).toHaveBeenCalledWith(false)
    expect(orbit).toHaveBeenLastCalledWith(true)

    events.emit('mouseDown')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(controller.cancel).toHaveBeenCalledTimes(1)

    events.emit('mouseDown')
    window.dispatchEvent(new Event('blur'))
    expect(controller.cancel).toHaveBeenCalledTimes(2)

    events.emit('mouseDown')
    window.dispatchEvent(new Event('pointercancel'))
    expect(controller.cancel).toHaveBeenCalledTimes(3)
  })

  it('cancels an active gesture when the gizmo unmounts', async () => {
    events.reset()
    const controller: InteractionController = {
      active: true,
      start: vi.fn(),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(() => true),
    }
    const renderer = await create(
      <TransformGizmo
        entityId="entity"
        object={{
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        } as unknown as Object3D}
        tool="move"
        enabled
        controller={controller}
        onOrbitEnabledChange={vi.fn()}
      />,
    )

    await renderer.unmount()

    expect(controller.cancel).toHaveBeenCalledTimes(1)
  })
})
