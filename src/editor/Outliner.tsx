import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function Outliner({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const children = (parentId: string | null) =>
    snapshot.scene.entities.filter((entity) => entity.parentId === parentId)

  const renderEntity = (entityId: string, level: number): React.ReactNode => {
    const entity = snapshot.scene.entities.find((candidate) => candidate.id === entityId)
    if (!entity) return null
    const selected = snapshot.selectedEntityIds.includes(entity.id)
    return (
      <div className="outliner-node" key={entity.id}>
        <button
          className={`outliner-row ${selected ? 'is-selected' : ''}`}
          type="button"
          aria-current={selected ? 'true' : undefined}
          aria-label={`${entity.name}を選択`}
          data-testid={`outliner-entity-${entity.id}`}
          style={{ paddingInlineStart: `${10 + level * 16}px` }}
          onClick={() => store.selectEntity(entity.id)}
        >
          <span className="outliner-kind" aria-hidden="true">
            {entity.kind.slice(0, 1).toUpperCase()}
          </span>
          <span className="outliner-copy">
            <strong title={entity.name}>{entity.name}</strong>
            <small>{entity.id}</small>
          </span>
          <span
            className="outliner-flags"
            aria-label={`${entity.visible ? '表示' : '非表示'}${entity.locked ? '・ロック' : ''}`}
          >
            {!entity.visible ? '非表示' : ''}
            {entity.locked ? '🔒' : ''}
          </span>
        </button>
        {children(entity.id).map((child) => renderEntity(child.id, level + 1))}
      </div>
    )
  }

  return (
    <section className="outliner-panel panel-scroll" aria-label="アウトライナーパネル">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">OUTLINER</p>
          <h2>アウトライナー</h2>
        </div>
        <span className="panel-count">{snapshot.scene.entities.length}</span>
      </div>
      <button
        className={`outliner-row room-row ${snapshot.selectedEntityId === null ? 'is-selected' : ''}`}
        type="button"
        aria-current={snapshot.selectedEntityId === null ? 'true' : undefined}
        data-testid="outliner-room"
        onClick={() => store.selectRoom()}
      >
        <span className="outliner-kind" aria-hidden="true">
          ⌂
        </span>
        <span className="outliner-copy">
          <strong title={snapshot.scene.room.name}>{snapshot.scene.room.name}</strong>
          <small>{snapshot.scene.room.id}</small>
        </span>
      </button>
      <div className="outliner-tree">
        {children(null).map((entity) => renderEntity(entity.id, 0))}
      </div>
      <p className="panel-note">階層とIDは3D選択と同期します。</p>
    </section>
  )
}
