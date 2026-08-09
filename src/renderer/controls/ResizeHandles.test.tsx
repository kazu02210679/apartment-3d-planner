import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { Object3D } from 'three'

import type { InteractionController } from './interaction-controller'
import { ResizeHandles } from './ResizeHandles'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function localPoint(x: number, y = 0, z = 0) {
  return {
    clone: () => localPoint(x, y, z),
    sub: (origin: { readonly x: number; readonly y: number; readonly z: number }) =>
      localPoint(x - origin.x, y - origin.y, z - origin.z),
    dot: (axis: { readonly x: number; readonly y: number; readonly z: number }) =>
      x * axis.x + y * axis.y + z * axis.z,
    x,
    y,
    z,
  }
}

const identityObject = {
  matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
} as unknown as Object3D

describe('ResizeHandles', () => {
  it('places each handle around the selected entity in its local dimensions', async () => {
    const controller: InteractionController = {
      active: false,
      start: () => false,
      updateTransform: () => false,
      updateDimensions: () => false,
      resizeByLocalDelta: () => false,
      commit: () => false,
      cancel: () => false,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
          entityObject={identityObject}
          dimensions={{ width: 1000, depth: 600, height: 400 }}
          enabled
          controller={controller}
        />,
      )

      expect(
        renderer.scene.findByProps({ name: 'resize-width-handle' }).props.position,
      ).toEqual([0.5, 0, 0])
      expect(
        renderer.scene.findByProps({ name: 'resize-height-handle' }).props.position,
      ).toEqual([0, 0.2, 0])
      expect(
        renderer.scene.findByProps({ name: 'resize-depth-handle' }).props.position,
      ).toEqual([0, 0, 0.3])
    } finally {
      warn.mockRestore()
    }
  })

  it('projects pointer movement onto a handle axis for both grow and shrink drags', async () => {
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
      cancel: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
          entityObject={identityObject}
          dimensions={{ width: 1000, depth: 600, height: 400 }}
          enabled
          controller={controller}
        />,
      )
      const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
      const target = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      }
      const event = (point: ReturnType<typeof localPoint>) =>
        ({
          pointerId: 1,
          target,
          stopPropagation: vi.fn(),
          unprojectedPoint: point,
        }) as never

      const origin = localPoint(0)
      await handle.props.onPointerDown(event(origin))
      // R3F may retain event point instances; the start frame must be copied.
      origin.x = 0.05
      await handle.props.onPointerMove(event(localPoint(0.1)))
      ;(identityObject.matrixWorld.elements as number[])[12] = 0.05
      await handle.props.onPointerMove(event(localPoint(0.2)))
      await handle.props.onPointerMove(event(localPoint(-0.05)))

      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(1, 0, 0.1)
      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(2, 0, 0.2)
      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(3, 0, -0.05)
      await handle.props.onPointerUp(event(localPoint(-0.05)))
      expect(target.setPointerCapture).toHaveBeenCalledWith(1)
      expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
      expect(controller.commit).toHaveBeenCalledTimes(1)

      active = true
      await handle.props.onPointerDown(event(localPoint(0)))
      await handle.props.onPointerCancel(event(localPoint(0)))
      expect(controller.cancel).toHaveBeenCalledTimes(1)
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  })
})
