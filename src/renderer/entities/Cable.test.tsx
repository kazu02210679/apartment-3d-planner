import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { Cable } from './Cable'

describe('Cable', () => {
  it('renders a selectable bounded route with selected styling', async () => {
    const onSelect = vi.fn()
    const renderer = await create(
      <Cable
        id="cable-1"
        kind="power"
        diameterMm={8}
        points={[
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 100, z: 0 },
          { x: 200, y: 0, z: 0 },
        ]}
        selected
        onSelect={onSelect}
      />,
    )
    const cable = renderer.scene.findByProps({ name: 'cable-route-cable-1' })

    expect(cable).toBeDefined()
    await renderer.fireEvent(cable, 'click')
    expect(onSelect).toHaveBeenCalledWith('cable-1')
  })
})
