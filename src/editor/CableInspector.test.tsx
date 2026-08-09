import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createEditorStore } from '../app/editor-store'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { CableInspector } from './CableInspector'

describe('CableInspector', () => {
  it('shows legacy cable membership as read-only without a detach action', () => {
    const scene = createFutureWorkstationScene()
    const cable = scene.entities.find((entity) => entity.name === 'Power cable')!
    const connection = scene.connections.find((candidate) =>
      candidate.endpoints.some((endpoint) => endpoint.entityId === cable.id),
    )!
    const extraTarget = scene.entities.find(
      (entity) => entity.name === 'Mac workstation',
    )!
    connection.endpoints.push({
      entityId: extraTarget.id,
      portId: extraTarget.ports[0]!.id,
    })
    const store = createEditorStore({ initialScene: scene })
    const storedCable = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === cable.id)!

    render(<CableInspector store={store} entity={storedCable} />)

    expect(screen.getAllByText(/レガシー/)).not.toHaveLength(0)
    expect(screen.queryByTestId('cable-end-end-a-detach')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cable-end-end-a-begin')).not.toBeInTheDocument()
    expect(screen.getByTestId('cable-end-end-b-detach')).toBeEnabled()
  })
})
