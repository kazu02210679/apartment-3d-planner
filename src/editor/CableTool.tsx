import { useMemo, useState, useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function CableTool({ store }: { readonly store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const [cableEnd, setCableEnd] = useState('')
  const [target, setTarget] = useState('')
  const choices = useMemo(
    () =>
      snapshot.scene.entities.flatMap((entity) =>
        entity.ports.map((port) => ({
          value: `${entity.id}:${port.id}`,
          label: `${entity.name} / ${port.name}`,
          cable: entity.catalog?.itemId === 'cable.generic',
        })),
      ),
    [snapshot.scene.entities],
  )
  if (snapshot.mode !== 'edit' || snapshot.activeTool !== 'cable') return null
  const draft = snapshot.cableDraft
  const parse = (value: string) => {
    const divider = value.indexOf(':')
    return divider < 0 ? undefined : [value.slice(0, divider), value.slice(divider + 1)]
  }
  return (
    <section className="cable-tool" aria-label="ケーブル接続ツール">
      <strong>ケーブル接続</strong>
      <p>配線は概略です。電気、長さ、負荷、曲げ半径は検証しません。</p>
      {draft ? <p role="status">端子を選択中: {draft.portId}</p> : null}
      <label>
        <span>ケーブル端子</span>
        <select
          data-testid="cable-tool-end"
          aria-label="ケーブル端子"
          value={cableEnd}
          onChange={(event) => setCableEnd(event.target.value)}
        >
          <option value="">選択</option>
          {choices
            .filter((choice) => choice.cable)
            .map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="cable-tool-begin"
        disabled={!cableEnd}
        onClick={() => {
          const selected = parse(cableEnd)
          if (selected) store.beginCableDraft(selected[0]!, selected[1]!)
        }}
      >
        端子を選ぶ
      </button>
      <label>
        <span>接続先ポート</span>
        <select
          data-testid="cable-tool-target"
          aria-label="接続先ポート"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">選択</option>
          {choices
            .filter((choice) => !choice.cable)
            .map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="cable-tool-complete"
        disabled={!draft || !target}
        onClick={() => {
          const selected = parse(target)
          if (selected) store.completeCableDraft(selected[0]!, selected[1]!)
        }}
      >
        接続する
      </button>
      {draft ? (
        <button
          type="button"
          data-testid="cable-tool-cancel"
          onClick={() => store.cancelCableDraft()}
        >
          キャンセル
        </button>
      ) : null}
    </section>
  )
}
