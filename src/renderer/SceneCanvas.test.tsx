import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createEditorStore } from '../app/editor-store'
import { createEmptyScene } from '../domain/scene'
import { SceneCanvas } from './SceneCanvas'

describe('SceneCanvas', () => {
  it('keeps exact numeric editing available when WebGL is unavailable', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })

    render(<SceneCanvas store={store} webglAvailable={() => false} />)

    expect(screen.getByRole('status')).toHaveTextContent('3D rendering is unavailable')
    expect(
      screen.getByText('Exact numeric editing remains available.'),
    ).toBeInTheDocument()
  })
})
