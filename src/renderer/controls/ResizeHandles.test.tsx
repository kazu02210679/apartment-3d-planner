import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { InteractionController } from './interaction-controller'
import { ResizeHandles } from './ResizeHandles'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ResizeHandles', () => {
  it('places each handle around the selected entity in its local dimensions', async () => {
    const controller: InteractionController = {
      active: false,
      start: () => false,
      updateTransform: () => false,
      updateDimensions: () => false,
      commit: () => false,
      cancel: () => false,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
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
})
