import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'
import { SceneCanvas } from '../renderer/SceneCanvas'
import { CatalogPanel } from './CatalogPanel'
import { Inspector } from './Inspector'
import { Outliner } from './Outliner'
import { Toolbar } from './Toolbar'
import { CableTool } from './CableTool'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function SceneStage({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)

  return (
    <section className="viewport" aria-label="3Dビューポート">
      <div className="toolbar-context">
        <span className="status-dot" aria-hidden="true" />
        <span>{snapshot.mode === 'edit' ? '編集モード' : 'プレビューモード'}</span>
      </div>
      <div className="canvas-frame" data-testid="scene-stage">
        <SceneCanvas store={store} />
        <CableTool store={store} />
      </div>
      <div className="viewport-footer">
        <span>{snapshot.scene.entities.length} エンティティ</span>
        <span>
          {snapshot.outOfBoundsEntityIds.length > 0
            ? `${snapshot.outOfBoundsEntityIds.length} 件が部屋の外です`
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
          className={`mobile-sheet${panel === 'inspector' ? ' mobile-sheet--inspector' : ''}`}
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
