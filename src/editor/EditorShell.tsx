import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import type { EditorStore } from '../app/editor-store'
import { CatalogPanel } from './CatalogPanel'
import { Inspector } from './Inspector'
import { Outliner } from './Outliner'
import { Toolbar } from './Toolbar'
import { CableTool } from './CableTool'
import { FallbackPanel } from '../renderer/FallbackPanel'

const LazySceneCanvas = lazy(async () => {
  const module = await import('../renderer/SceneCanvas')
  return { default: module.SceneCanvas }
})

class LazyRendererBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <FallbackPanel /> : this.props.children
  }
}

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
        <LazyRendererBoundary>
          <Suspense
            fallback={
              <div
                className="scene-canvas scene-canvas--loading"
                data-testid="scene-canvas-loading"
                role="status"
                aria-live="polite"
              >
                3Dビューを読み込んでいます…
              </div>
            }
          >
            <LazySceneCanvas store={store} />
          </Suspense>
        </LazyRendererBoundary>
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
  const editing = snapshot.mode === 'edit'
  const mobileOpenerRef = useRef<HTMLButtonElement | null>(null)
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null)
  const mobileSheetRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (panel === 'none') {
      mobileOpenerRef.current?.focus()
      return
    }
    mobileCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        store.setMobilePanel('none')
        return
      }
      if (event.key !== 'Tab') return
      const focusable = mobileSheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [panel, store])
  const toggleMobilePanel = (
    nextPanel: Exclude<typeof panel, 'none'>,
    opener: HTMLButtonElement,
  ) => {
    if (panel === nextPanel) {
      store.setMobilePanel('none')
      return
    }
    mobileOpenerRef.current = opener
    store.setMobilePanel(nextPanel)
  }
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
      {editing ? <div className="mobile-controls" aria-label="モバイルパネル操作">
        <button
          type="button"
          aria-expanded={panel === 'catalog'}
          aria-controls={panel === 'catalog' ? 'mobile-sheet' : undefined}
          onClick={(event) => toggleMobilePanel('catalog', event.currentTarget)}
        >
          カタログ
        </button>
        <button
          type="button"
          aria-expanded={panel === 'outliner'}
          aria-controls={panel === 'outliner' ? 'mobile-sheet' : undefined}
          onClick={(event) => toggleMobilePanel('outliner', event.currentTarget)}
        >
          アウトライナー
        </button>
        <button
          type="button"
          aria-expanded={panel === 'inspector'}
          aria-controls={panel === 'inspector' ? 'mobile-sheet' : undefined}
          onClick={(event) => toggleMobilePanel('inspector', event.currentTarget)}
        >
          プロパティ
        </button>
      </div> : null}
      <div className={`workspace-layout${editing ? '' : ' workspace-layout--preview'}`}>
        {editing ? <aside className="panel panel--left" aria-label="シーンパネル">
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
        </aside> : null}
        <SceneStage store={store} />
        {editing ? <Inspector store={store} /> : null}
      </div>
      {editing && panel !== 'none' ? (
        <div
          ref={mobileSheetRef}
          id="mobile-sheet"
          className={`mobile-sheet${panel === 'inspector' ? ' mobile-sheet--inspector' : ''}`}
          data-testid="mobile-sheet"
          role="dialog"
          aria-modal="true"
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
              ref={mobileCloseRef}
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
