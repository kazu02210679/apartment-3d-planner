import { useEffect, useState, useSyncExternalStore } from 'react'

import { ROOM_PRESETS, ROOM_PRESET_IDS } from '../domain/room-presets'
import type { Dimensions } from '../domain/schema'
import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function NumericField({
  label,
  value,
  onCommit,
  disabled = false,
  min = -Infinity,
  testId,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  min?: number
  testId?: string
}) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState('')
  useEffect(() => {
    setDraft(String(value))
    setError('')
  }, [value])
  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= min) {
      setError(
        min >= 0 ? '正の数値を入力してください。' : '有限の数値を入力してください。',
      )
      return
    }
    setError('')
    onCommit(parsed)
  }
  return (
    <label className="field numeric-field">
      <span>{label}</span>
      <input
        type="number"
        data-testid={testId}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setError('')
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  )
}

export function RoomInspector({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const room = snapshot.scene.room
  const dimensions: Dimensions = {
    width: room.width,
    depth: room.depth,
    height: room.height,
  }
  const presetValue = room.preset ?? 'custom'
  return (
    <section className="inspector-content panel-scroll" aria-label="部屋インスペクター">
      <div className="inspector-title">
        <p className="eyebrow">ROOM / MM</p>
        <h2>部屋</h2>
        <p className="muted-copy">{room.name} · 1畳 = 1.62 m²</p>
      </div>
      <label className="field">
        <span>部屋プリセット</span>
        <select
          aria-label="部屋プリセット"
          value={presetValue}
          onChange={(event) => {
            const value = event.target.value
            if (value !== 'custom')
              store.setRoomPreset(value as (typeof ROOM_PRESET_IDS)[number])
          }}
        >
          {ROOM_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {ROOM_PRESETS[id].label}
            </option>
          ))}
          <option value="custom">カスタム</option>
        </select>
      </label>
      <div className="preset-chips" aria-label="部屋サイズプリセット">
        {ROOM_PRESET_IDS.map((id) => (
          <button
            className={room.preset === id ? 'chip is-active' : 'chip'}
            key={id}
            type="button"
            onClick={() => store.setRoomPreset(id)}
          >
            {ROOM_PRESETS[id].label}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <NumericField
          label="部屋の幅（mm）"
          value={room.width}
          min={0}
          onCommit={(width) => store.setRoomDimensions({ ...dimensions, width })}
        />
        <NumericField
          label="部屋の奥行き（mm）"
          value={room.depth}
          min={0}
          onCommit={(depth) => store.setRoomDimensions({ ...dimensions, depth })}
        />
        <NumericField
          label="部屋の高さ（mm）"
          value={room.height}
          min={0}
          onCommit={(height) => store.setRoomDimensions({ ...dimensions, height })}
        />
      </div>
      <div className="derived-grid" aria-label="部屋の算出値">
        <div>
          <span>幅 × 奥行き</span>
          <strong>
            {(room.width / 1000).toFixed(2)} × {(room.depth / 1000).toFixed(2)} m
          </strong>
        </div>
        <div>
          <span>面積</span>
          <strong>{((room.width * room.depth) / 1_000_000).toFixed(2)} m²</strong>
        </div>
        <div>
          <span>寸法状態</span>
          <strong>{room.preset ? 'プリセット' : 'カスタム'}</strong>
        </div>
      </div>
      <section className="warning-box" aria-label="部屋の範囲警告">
        <strong>範囲外チェック</strong>
        {snapshot.outOfBoundsEntityIds.length === 0 ? (
          <p>すべてのエンティティが部屋内です。</p>
        ) : (
          <p>
            {snapshot.outOfBoundsEntityIds.length}
            件が部屋の範囲外です。移動や削除は行いません。
          </p>
        )}
        {snapshot.outOfBoundsEntityIds.length > 0 ? (
          <ul>
            {snapshot.outOfBoundsEntityIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  )
}
