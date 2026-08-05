import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createEmptyScene } from '../domain/scene'
import { createEditorStore } from '../app/editor-store'
import { EditorShell } from './EditorShell'

function createStore() {
  let index = 0
  const idFactory = () => `ui-${++index}`
  return createEditorStore({
    initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
    idFactory,
  })
}

describe('EditorShell', () => {
  it('selects a catalog item by stable id and edits it in the inspector', () => {
    const store = createStore()
    render(<EditorShell store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'モニターを追加' }))
    const entityId = store.getSnapshot().selectedEntityId
    expect(entityId).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'エンティティ' })).toBeInTheDocument()

    const name = screen.getByLabelText('名前')
    fireEvent.change(name, { target: { value: '作業モニター' } })
    fireEvent.blur(name)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)?.name,
    ).toBe('作業モニター')

    fireEvent.click(screen.getByRole('tab', { name: 'アウトライナー' }))
    expect(screen.getByTestId(`outliner-entity-${entityId}`)).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('keeps room editing reachable when no entity is selected', () => {
    const store = createStore()
    render(<EditorShell store={store} />)

    expect(screen.getAllByRole('heading', { name: '部屋' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('部屋の幅（mm）')).toHaveValue(2700)
    fireEvent.change(screen.getByLabelText('部屋の幅（mm）'), {
      target: { value: '2000' },
    })
    fireEvent.blur(screen.getByLabelText('部屋の幅（mm）'))
    expect(store.getSnapshot().scene.room.width).toBe(2000)
  })

  it('disables locked fields and rejects invalid numeric edits', () => {
    const store = createStore()
    render(<EditorShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'モニターを追加' }))
    const entityId = store.getSnapshot().selectedEntityId!
    const before = store
      .getSnapshot()
      .scene.entities.find((entity) => entity.id === entityId)!.dimensions.width
    fireEvent.click(screen.getByRole('button', { name: 'ロック' }))
    expect(screen.getByLabelText('名前')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ロック解除' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'ロック解除' }))
    const width = screen.getByLabelText('幅（mm）')
    fireEvent.change(width, { target: { value: '0' } })
    fireEvent.blur(width)
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)!
        .dimensions.width,
    ).toBe(before)
    expect(screen.getByText('正の数値を入力してください。')).toBeInTheDocument()
  })
})
