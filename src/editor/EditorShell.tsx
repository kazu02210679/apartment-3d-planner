import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'
import { CatalogPanel } from './CatalogPanel'
import { Inspector } from './Inspector'
import { Outliner } from './Outliner'
import { Toolbar } from './Toolbar'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function SceneStage({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  return (
    <section className="viewport" aria-label="3Dビューポート">
      <div className="viewport-toolbar">
        <div className="toolbar-context">
          <span className="status-dot" aria-hidden="true" />
          <span>{snapshot.mode === 'edit' ? '編集モード' : 'プレビューモード'}</span>
        </div>
        <div className="toolbar-tools" aria-label="ビューポート操作">
          <button type="button" aria-label="ズームアウト">
            −
          </button>
          <span>100%</span>
          <button type="button" aria-label="ズームイン">
            ＋
          </button>
          <button type="button" aria-label="ビューをリセット">
            ⟳
          </button>
        </div>
      </div>
      <div className="canvas-frame" data-testid="scene-stage">
        <div className="canvas-grid" aria-hidden="true" />
        <div className="stage-room" aria-hidden="true">
          <span className="stage-wall stage-wall--back" />
          <span className="stage-wall stage-wall--side" />
          <span className="stage-floor" />
        </div>
        <div className="stage-entities" aria-label="シーン内エンティティ">
          {snapshot.scene.entities.slice(0, 80).map((entity, index) => (
            <button
              key={entity.id}
              className={`stage-entity ${snapshot.selectedEntityId === entity.id ? 'is-selected' : ''} ${snapshot.outOfBoundsEntityIds.includes(entity.id) ? 'is-out-of-bounds' : ''}`}
              type="button"
              aria-label={`${entity.name}をステージで選択`}
              onClick={() => store.selectEntity(entity.id)}
              style={{ '--entity-index': index } as React.CSSProperties}
            >
              <span>{entity.name}</span>
            </button>
          ))}
        </div>
        <div className="viewport-center">
          <span className="viewport-badge">
            {snapshot.mode === 'edit' ? 'EDITING' : 'PREVIEW'}
          </span>
          <h2>{snapshot.scene.room.name}</h2>
          <p>シーンデータを表示中 · Task 7でWebGLレンダラーに接続します</p>
        </div>
        <div className="canvas-corner canvas-corner--top">TOP / MM</div>
        <div className="canvas-corner canvas-corner--bottom">
          {(snapshot.scene.room.width / 1000).toFixed(1)} ×{' '}
          {(snapshot.scene.room.depth / 1000).toFixed(1)} m
        </div>
      </div>
      <div className="viewport-footer">
        <span>{snapshot.scene.entities.length} エンティティ · ID選択同期</span>
        <span>
          {snapshot.outOfBoundsEntityIds.length > 0
            ? `${snapshot.outOfBoundsEntityIds.length}件が範囲外`
            : '範囲内'}
        </span>
      </div>
    </section>
  )
}

export function EditorShell({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const panel = snapshot.mobilePanel
  const left =
    snapshot.activeLeftTab === 'catalog' ? (
      <CatalogPanel store={store} />
    ) : (
      <Outliner store={store} />
    )
  return (
    <main className="app-shell">
      <Toolbar store={store} />
      {snapshot.errorMessage ? (
        <p className="global-error" role="alert">
          {snapshot.errorMessage}
        </p>
      ) : null}
      <div className="mobile-controls" aria-label="モバイルパネル操作">
        <button
          type="button"
          onClick={() => store.setMobilePanel(panel === 'catalog' ? 'none' : 'catalog')}
        >
          カタログ
        </button>
        <button
          type="button"
          onClick={() => store.setMobilePanel(panel === 'outliner' ? 'none' : 'outliner')}
        >
          アウトライナー
        </button>
        <button
          type="button"
          onClick={() =>
            store.setMobilePanel(panel === 'inspector' ? 'none' : 'inspector')
          }
        >
          プロパティ
        </button>
      </div>
      <div className="workspace-layout">
        <aside className="panel panel--left" aria-label="シーンパネル">
          <div className="tab-list" role="tablist" aria-label="左パネル">
            <button
              role="tab"
              type="button"
              aria-selected={snapshot.activeLeftTab === 'catalog'}
              className={snapshot.activeLeftTab === 'catalog' ? 'is-active' : ''}
              onClick={() => store.setLeftTab('catalog')}
            >
              カタログ
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={snapshot.activeLeftTab === 'outliner'}
              className={snapshot.activeLeftTab === 'outliner' ? 'is-active' : ''}
              onClick={() => store.setLeftTab('outliner')}
            >
              アウトライナー
            </button>
          </div>
          {left}
        </aside>
        <SceneStage store={store} />
        <Inspector store={store} />
      </div>
      {panel !== 'none' ? (
        <div
          className="mobile-sheet"
          data-testid="mobile-sheet"
          role="dialog"
          aria-label={`${panel === 'inspector' ? 'プロパティ' : panel === 'catalog' ? 'カタログ' : 'アウトライナー'}シート`}
        >
          <div className="sheet-heading">
            <strong>
              {panel === 'inspector'
                ? 'プロパティ'
                : panel === 'catalog'
                  ? 'カタログ'
                  : 'アウトライナー'}
            </strong>
            <button
              type="button"
              aria-label="シートを閉じる"
              onClick={() => store.setMobilePanel('none')}
            >
              閉じる
            </button>
          </div>
          {panel === 'inspector' ? (
            <Inspector store={store} />
          ) : panel === 'catalog' ? (
            <CatalogPanel store={store} />
          ) : (
            <Outliner store={store} />
          )}
        </div>
      ) : null}
    </main>
  )
}
