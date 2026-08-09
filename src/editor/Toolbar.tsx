import { useRef, useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function Toolbar({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const fileInput = useRef<HTMLInputElement>(null)
  const exportJson = () => {
    try {
      const blob = new Blob([store.exportJson()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${snapshot.scene.metadata.name || 'scene'}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      // Export remains a user-visible, non-mutating error.
      void error
    }
  }
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          ◇
        </span>
        <div>
          <p className="eyebrow">APARTMENT / EDITOR</p>
          <h1>暮らしの3Dプランナー</h1>
        </div>
      </div>
      <div className="header-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => store.resetScene()}
        >
          <span aria-hidden="true">＋</span>新規シーン
        </button>
        <div className="mode-switch" role="group" aria-label="表示モード">
          <button
            className={`mode-button ${snapshot.mode === 'edit' ? 'is-active' : ''}`}
            type="button"
            aria-pressed={snapshot.mode === 'edit'}
            onClick={() => store.setMode('edit')}
          >
            編集
          </button>
          <button
            className={`mode-button ${snapshot.mode === 'preview' ? 'is-active' : ''}`}
            type="button"
            aria-pressed={snapshot.mode === 'preview'}
            onClick={() => store.setMode('preview')}
          >
            プレビュー
          </button>
        </div>
        <div className="tool-switch" role="group" aria-label="Direct manipulation tool">
          {(
            [
              ['move', '移動'],
              ['rotate', '回転'],
              ['resize', 'サイズ'],
              ['cable', 'ケーブル'],
            ] as const
          ).map(([tool, label]) => (
            <button
              key={tool}
              data-testid={`tool-${tool}`}
              className={`mode-button ${snapshot.activeTool === tool ? 'is-active' : ''}`}
              type="button"
              aria-label={`${label}ツール`}
              aria-pressed={snapshot.activeTool === tool}
              disabled={snapshot.mode !== 'edit'}
              onClick={() => store.setActiveTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="toolbar-select">
          <span>移動スナップ</span>
          <select
            aria-label="移動スナップ"
            value={snapshot.translationSnap}
            onChange={(event) => store.setTranslationSnap(Number(event.target.value))}
          >
            <option value={1}>1 mm</option>
            <option value={10}>10 mm</option>
            <option value={50}>50 mm</option>
            <option value={100}>100 mm</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span>回転スナップ</span>
          <select
            aria-label="回転スナップ"
            value={snapshot.rotationSnap}
            onChange={(event) => store.setRotationSnap(Number(event.target.value))}
          >
            <option value={5}>5°</option>
            <option value={15}>15°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        </label>
        <button
          className={`toolbar-button toolbar-text ${snapshot.floorSnap ? 'is-active' : ''}`}
          type="button"
          aria-pressed={snapshot.floorSnap}
          onClick={() => store.setFloorSnap(!snapshot.floorSnap)}
        >
          床にスナップ
        </button>
        <button
          className="toolbar-button"
          type="button"
          aria-label="元に戻す"
          onClick={() => store.undo()}
          disabled={!snapshot.canUndo}
        >
          ↶
        </button>
        <button
          className="toolbar-button"
          type="button"
          aria-label="やり直す"
          onClick={() => store.redo()}
          disabled={!snapshot.canRedo}
        >
          ↷
        </button>
        <span
          className={`save-state save-state--${snapshot.saveStatus.state}`}
          role="status"
        >
          {snapshot.saveStatus.state === 'pending'
            ? '保存待機'
            : snapshot.saveStatus.state === 'error'
              ? '保存エラー'
              : snapshot.saveStatus.state === 'saved'
                ? '保存済み'
                : '未保存'}
        </span>
        <button
          className="toolbar-button toolbar-text"
          type="button"
          onClick={exportJson}
        >
          JSON書き出し
        </button>
        <button
          className="toolbar-button toolbar-text"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          JSON読み込み
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="JSONファイルを選択"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then((text) => store.importJson(text))
            event.target.value = ''
          }}
        />
      </div>
    </header>
  )
}
