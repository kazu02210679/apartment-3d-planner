import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'
import { EntityInspector } from './EntityInspector'
import { RoomInspector } from './RoomInspector'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function Inspector({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  return (
    <aside className="inspector panel panel--right" aria-label="プロパティパネル">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">INSPECTOR</p>
          <h2>プロパティ</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="プロパティを閉じる"
          onClick={() => store.setMobilePanel('none')}
        >
          ×
        </button>
      </div>
      {snapshot.selectedEntityId ? (
        <EntityInspector store={store} />
      ) : (
        <RoomInspector store={store} />
      )}
    </aside>
  )
}
