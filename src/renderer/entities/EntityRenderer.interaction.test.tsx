import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { Entity } from '../../domain/schema'
import { EntityRenderer } from './EntityRenderer'

vi.mock('@react-three/drei', () => ({
  Edges: () => <lineSegments name="selection-outline" />,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const entity: Entity = {
  id: 'entity-1',
  kind: 'group',
  name: 'Group',
  parentId: null,
  transform: {
    position: { x: 0, y: 200, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  },
  dimensions: { width: 1000, depth: 500, height: 400 },
  overrides: {},
  ports: [],
  properties: {},
  visible: true,
  locked: false,
  extensions: {},
}

describe('EntityRenderer interactions', () => {
  it('selects on click while preserving secondary-button context menus', async () => {
    const onSelect = vi.fn()
    const onContextMenu = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const renderer = await create(
        <EntityRenderer
          entity={entity}
          selected
          outOfBounds={false}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />,
      )
      const renderedEntity = renderer.scene.findByProps({ name: entity.id })

      expect(renderedEntity.findByProps({ name: 'selection-outline' })).toBeDefined()
      await renderer.fireEvent(renderedEntity, 'click')

      expect(onSelect).toHaveBeenCalledOnce()
      expect(onSelect).toHaveBeenCalledWith(entity.id)

      const contextMenuEvent = { button: 2 } as unknown as MouseEvent
      const stopPropagation = vi.fn()
      await renderer.fireEvent(renderedEntity, 'contextMenu', {
        nativeEvent: contextMenuEvent,
        stopPropagation,
      })

      expect(stopPropagation).toHaveBeenCalledOnce()
      expect(onContextMenu).toHaveBeenCalledWith(entity.id, contextMenuEvent)
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })
})
