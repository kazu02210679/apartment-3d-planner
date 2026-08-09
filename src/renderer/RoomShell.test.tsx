import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { Room } from '../domain/schema'
import { RoomShell } from './RoomShell'

const room: Room = {
  id: 'room-1',
  name: 'Room',
  preset: null,
  width: 2700,
  depth: 3600,
  height: 2400,
  extensions: {},
}

describe('RoomShell', () => {
  it('clears selection when room geometry receives an otherwise empty-stage hit', async () => {
    const onEmptyHit = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const renderer = await create(<RoomShell room={room} onEmptyHit={onEmptyHit} />)
      const shell = renderer.scene.findByProps({ name: 'room-shell' })

      await renderer.fireEvent(shell, 'click')

      expect(onEmptyHit).toHaveBeenCalledOnce()
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })
})
