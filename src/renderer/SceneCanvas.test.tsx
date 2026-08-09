import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./SceneRoot', () => ({ SceneRoot: () => null }))

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

  it('disables the accessible direct nudge for a locked selected entity', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.setLocked(entityId, true)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)

    expect(screen.getByRole('button', { name: '選択対象を右へ移動' })).toBeDisabled()
  })

  it('disables the accessible direct nudge for a hidden selected entity', () => {
    let id = 0
    const store = createEditorStore({
      initialScene: createEmptyScene('6-tatami', {
        idFactory: () => `scene-id-${++id}`,
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    })
    const entityId = store.addCatalogItem('power.strip')!
    store.setVisibility(entityId, false)

    render(<SceneCanvas store={store} webglAvailable={() => true} />)

    expect(screen.getByRole('button', { name: '選択対象を右へ移動' })).toBeDisabled()
  })
})
