import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createEditorStore } from '../app/editor-store'
import { createFutureWorkstationScene } from '../domain/templates/future-workstation'
import { CableTool } from './CableTool'

describe('CableTool', () => {
  it('cancels an active draft on Escape without adding history or scheduling autosave', async () => {
    const autosave = {
      schedule: vi.fn(),
      flush: () => ({ state: 'idle' as const }),
      dispose: () => undefined,
      getStatus: () => ({ state: 'idle' as const }),
    }
    const scene = createFutureWorkstationScene({
      now: () => '2026-08-06T00:00:00.000Z',
    })
    const sourceCable = scene.entities.find((entity) => entity.name === 'Power cable')!
    const sourceEnd = sourceCable.ports.find(
      (port) => port.extensions.catalogPortId === 'end-a',
    )!
    scene.connections = scene.connections.filter(
      (connection) =>
        !connection.endpoints.some(
          (endpoint) =>
            endpoint.entityId === sourceCable.id && endpoint.portId === sourceEnd.id,
        ),
    )
    const store = createEditorStore({
      initialScene: scene,
      autosave,
    })
    const cable = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.name === 'Power cable')!
    const end = cable.ports.find((port) => port.extensions.catalogPortId === 'end-a')!
    store.setActiveTool('cable')
    autosave.schedule.mockClear()
    const exported = store.exportJson()
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(store.beginCableDraft(cable.id, end.id)).toBe(true)

    render(<CableTool store={store} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(store.getSnapshot().cableDraft).toBeUndefined())
    expect(store.exportJson()).toBe(exported)
    expect(store.getSnapshot().canUndo).toBe(false)
    expect(autosave.schedule).not.toHaveBeenCalled()
  })
})
