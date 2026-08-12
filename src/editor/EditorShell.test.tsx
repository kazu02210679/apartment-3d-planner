import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createEmptyScene } from '../domain/scene'
import { createEditorStore } from '../app/editor-store'
import { EditorShell } from './EditorShell'

vi.mock('../renderer/SceneCanvas', () => ({
  SceneCanvas: () => (
    <div data-testid="scene-canvas">
      <button type="button" aria-label="Zoom in">
        +
      </button>
    </div>
  ),
}))

function createStore() {
  let index = 0
  const idFactory = () => `ui-${++index}`
  return createEditorStore({
    initialScene: createEmptyScene('6-tatami', { idFactory, now: () => '2026-01-01' }),
    idFactory,
  })
}

describe('EditorShell', () => {
  it('makes live high-quality preview read-only and keeps the canonical export unchanged', () => {
    const store = createStore()
    render(<EditorShell store={store} />)
    const before = store.exportJson()

    fireEvent.click(screen.getByRole('button', { name: '高品質プレビュー' }))

    expect(screen.getByText('高品質プレビュー')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編集に戻る' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'シーンパネル' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'プロパティパネル' })).not.toBeInTheDocument()
    expect(store.getSnapshot().mode).toBe('preview')
    expect(store.exportJson()).toBe(before)

    fireEvent.click(screen.getByRole('button', { name: '編集に戻る' }))
    expect(screen.getByRole('button', { name: '高品質プレビュー' })).toBeInTheDocument()
    expect(store.getSnapshot().mode).toBe('edit')
    expect(store.exportJson()).toBe(before)
  })

  it('uses only the real canvas surface instead of legacy stage controls and entities', async () => {
    const store = createEditorStore()
    const { container } = render(<EditorShell store={store} />)

    await waitFor(() => expect(screen.getByTestId('scene-canvas')).toBeInTheDocument())
    expect(container.querySelector('.canvas-grid')).not.toBeInTheDocument()
    expect(container.querySelector('.stage-room')).not.toBeInTheDocument()
    expect(container.querySelector('.stage-entities')).not.toBeInTheDocument()
    expect(container.querySelector('.stage-entity')).not.toBeInTheDocument()
    expect(container.querySelector('.viewport-center')).not.toBeInTheDocument()
    expect(container.querySelector('.canvas-corner')).not.toBeInTheDocument()
    expect(container.querySelector('.toolbar-tools')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Zoom in' })).toHaveLength(1)
    expect(screen.queryByText(/Task 7/)).not.toBeInTheDocument()
  })

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

  it('keeps inspector numeric fields at committed values while a pointer draft is active', () => {
    const store = createStore()
    render(<EditorShell store={store} />)
    fireEvent.click(screen.getByTestId('catalog-add-display.monitor'))
    const position = screen.getByTestId('position-x')

    let started = false
    act(() => {
      started = store.beginInteraction('move entity', {
        entityId: store.getSnapshot().selectedEntityId,
      })
    })
    expect(started).toBe(true)
    expect(position).toHaveValue(0)

    act(() => store.cancelInteraction())
    expect(position).toHaveValue(0)
  })

  it('edits a stable outliner selection numerically and restores it with undo', () => {
    const store = createStore()
    render(<EditorShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'モニターを追加' }))
    const entityId = store.getSnapshot().selectedEntityId!
    fireEvent.click(screen.getByRole('tab', { name: 'アウトライナー' }))
    fireEvent.click(screen.getByTestId(`outliner-entity-${entityId}`))
    fireEvent.change(screen.getByLabelText('位置 X'), { target: { value: '240' } })
    fireEvent.blur(screen.getByLabelText('位置 X'))
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position.x,
    ).toBe(240)
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(
      store.getSnapshot().scene.entities.find((entity) => entity.id === entityId)
        ?.transform.position.x,
    ).toBe(0)
    expect(store.getSnapshot().selectedEntityId).toBe(entityId)
  })

  it('marks the inspector mobile sheet so its inspector panel remains visible', () => {
    const store = createStore()
    render(<EditorShell store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'プロパティ' }))

    const sheet = screen.getByTestId('mobile-sheet')
    expect(sheet).toHaveClass('mobile-sheet--inspector')
    expect(
      within(sheet).getByRole('complementary', { name: 'プロパティパネル' }),
    ).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: '部屋' })).toBeInTheDocument()
  })

  it('moves focus into a mobile dialog, closes it on Escape, and restores its exact opener', () => {
    const store = createStore()
    render(<EditorShell store={store} />)

    const opener = screen
      .getAllByRole('button', { name: /.+/ })
      .find((button) => button.textContent?.includes('プロパティ'))!
    opener.focus()
    fireEvent.click(opener)

    const sheet = screen.getByTestId('mobile-sheet')
    const close = sheet.querySelector<HTMLButtonElement>('.sheet-heading button')!
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(opener).toHaveAttribute('aria-controls', 'mobile-sheet')
    expect(close).toHaveFocus()

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(sheet).toContainElement(document.activeElement as HTMLElement)
    expect(document.activeElement).not.toBe(close)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('mobile-sheet')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('supports additive outliner selection, grouping, mobile sheets, and import errors through DOM semantics', async () => {
    const store = createStore()
    render(<EditorShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'L字昇降デスクを追加' }))
    const firstId = store.getSnapshot().selectedEntityId!
    fireEvent.click(screen.getByRole('button', { name: 'チェアを追加' }))
    const secondId = store.getSnapshot().selectedEntityId!
    fireEvent.click(screen.getByRole('tab', { name: 'アウトライナー' }))
    fireEvent.click(screen.getByTestId(`outliner-entity-${firstId}`))
    fireEvent.click(screen.getByTestId(`outliner-entity-${secondId}`), { ctrlKey: true })
    expect(screen.getByTestId('group-selected')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('group-selected'))
    expect(
      store.getSnapshot().scene.entities.some((entity) => entity.kind === 'group'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'プロパティ' }))
    expect(screen.getByTestId('mobile-sheet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'シートを閉じる' }))
    expect(screen.queryByTestId('mobile-sheet')).not.toBeInTheDocument()

    act(() => {
      expect(store.importJson('{ invalid json')).toBe(false)
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
