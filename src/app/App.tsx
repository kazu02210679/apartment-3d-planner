import { useState } from 'react'

type ViewMode = 'edit' | 'preview'

export function App() {
  const [mode, setMode] = useState<ViewMode>('edit')
  const [sceneName, setSceneName] = useState('リビングルーム')

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            ◇
          </span>
          <div>
            <p className="eyebrow">APARTMENT / 01</p>
            <h1>暮らしの3Dプランナー</h1>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => setSceneName('新しいシーン')}
          >
            <span aria-hidden="true">＋</span>
            新規シーン
          </button>
          <div className="mode-switch" role="group" aria-label="表示モード">
            <button
              className={mode === 'edit' ? 'mode-button is-active' : 'mode-button'}
              type="button"
              aria-pressed={mode === 'edit'}
              onClick={() => setMode('edit')}
            >
              編集
            </button>
            <button
              className={mode === 'preview' ? 'mode-button is-active' : 'mode-button'}
              type="button"
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              プレビュー
            </button>
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="panel panel--left" aria-label="シーンパネル">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PROJECT</p>
              <h2>シーン</h2>
            </div>
            <span className="panel-count">01</span>
          </div>

          <button className="scene-card is-selected" type="button">
            <span className="scene-card-icon" aria-hidden="true">
              ◇
            </span>
            <span className="scene-card-copy">
              <strong>{sceneName}</strong>
              <small>更新済み · たった今</small>
            </span>
            <span className="scene-card-arrow" aria-hidden="true">
              ›
            </span>
          </button>

          <div className="panel-divider" />

          <section className="panel-section" aria-labelledby="floor-heading">
            <div className="section-heading">
              <h3 id="floor-heading">フロア</h3>
              <button className="icon-button" type="button" aria-label="フロアを追加">
                ＋
              </button>
            </div>
            <div className="floor-row is-selected">
              <span className="floor-index">01</span>
              <span>リビング</span>
              <span className="floor-arrow" aria-hidden="true">
                ›
              </span>
            </div>
            <div className="floor-row">
              <span className="floor-index">02</span>
              <span>ベッドルーム</span>
              <span className="floor-arrow" aria-hidden="true">
                ›
              </span>
            </div>
          </section>

          <section className="panel-note" aria-label="ヒント">
            <span className="note-icon" aria-hidden="true">
              ✦
            </span>
            <p>空間を選択すると、右側のパネルから詳細を編集できます。</p>
          </section>
        </aside>

        <section className="viewport" aria-label="3Dビューポート">
          <div className="viewport-toolbar">
            <div className="toolbar-context">
              <span className="status-dot" aria-hidden="true" />
              <span>{mode === 'edit' ? '編集モード' : 'プレビューモード'}</span>
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

          <div className="canvas-frame">
            <div className="canvas-grid" aria-hidden="true" />
            <div className="room-outline" aria-hidden="true">
              <div className="room-wall room-wall--back" />
              <div className="room-wall room-wall--side" />
              <div className="room-window" />
              <div className="room-sofa" />
              <div className="room-table" />
              <div className="room-rug" />
            </div>

            <div className="viewport-center">
              <span className="viewport-badge">
                {mode === 'edit' ? 'EDITING' : 'PREVIEW'}
              </span>
              <h2>{sceneName}</h2>
              <p>
                {mode === 'edit' ? '空間を選択して編集を始める' : 'プレビューを確認中'}
              </p>
            </div>

            <div className="canvas-corner canvas-corner--top" aria-hidden="true">
              <span>TOP</span>
            </div>
            <div className="canvas-corner canvas-corner--bottom" aria-hidden="true">
              <span>12.4 × 8.6 m</span>
            </div>
          </div>

          <div className="viewport-footer">
            <span>シーンの準備ができています</span>
            <span>最終保存 01:42</span>
          </div>
        </section>

        <aside className="panel panel--right" aria-label="プロパティパネル">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">INSPECTOR</p>
              <h2>プロパティ</h2>
            </div>
            <button className="icon-button" type="button" aria-label="プロパティを閉じる">
              ×
            </button>
          </div>

          <section className="property-section" aria-labelledby="selection-heading">
            <div className="section-heading">
              <h3 id="selection-heading">選択中の空間</h3>
              <span className="selection-state">ACTIVE</span>
            </div>
            <div className="property-highlight">
              <span className="property-highlight-icon" aria-hidden="true">
                ◈
              </span>
              <span>
                <strong>{sceneName}</strong>
                <small>Room / Living area</small>
              </span>
            </div>
          </section>

          <section className="property-section" aria-labelledby="settings-heading">
            <div className="section-heading">
              <h3 id="settings-heading">シーン設定</h3>
              <span className="section-more" aria-hidden="true">
                ···
              </span>
            </div>
            <div className="setting-row">
              <span>床の高さ</span>
              <strong>2.4 m</strong>
            </div>
            <div className="setting-row">
              <span>光の向き</span>
              <strong>南東</strong>
            </div>
            <div className="setting-row">
              <span>表示グリッド</span>
              <span
                className="toggle is-on"
                aria-label="表示グリッド オン"
                role="switch"
                aria-checked="true"
              >
                <span />
              </span>
            </div>
          </section>

          <section
            className="property-section property-section--help"
            aria-label="ショートカット"
          >
            <p className="eyebrow">QUICK TIP</p>
            <p className="shortcut-copy">
              <kbd>⌘</kbd> + <kbd>K</kbd> でコマンドを検索
            </p>
          </section>
        </aside>
      </div>
    </main>
  )
}
