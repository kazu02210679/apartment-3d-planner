import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function Outliner({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const scene = snapshot.scene
  const selectedIds = snapshot.selectedEntityIds
  const entityById = new Map(scene.entities.map((entity) => [entity.id, entity]))
  const childrenByParent = new Map<string | null, typeof scene.entities>()
  for (const entity of scene.entities) {
    const children = childrenByParent.get(entity.parentId)
    if (children) children.push(entity)
    else childrenByParent.set(entity.parentId, [entity])
  }

  const renderEntity = (entityId: string, level: number): React.ReactNode => {
    const entity = entityById.get(entityId)
    if (!entity) return null
    const selected = selectedIds.includes(entity.id)
    return (
      <div className="outliner-node" key={entity.id}>
        <button
          className={`outliner-row ${selected ? 'is-selected' : ''}`}
          type="button"
          aria-current={selected ? 'true' : undefined}
          aria-pressed={selected}
          aria-label={`${entity.name}を選択`}
          data-testid={`outliner-entity-${entity.id}`}
          style={{ paddingInlineStart: `${10 + level * 16}px` }}
          onClick={(event) =>
            store.selectEntity(entity.id, event.ctrlKey || event.metaKey)
          }
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
        {childrenByParent
          .get(entity.id)
          ?.map((child) => renderEntity(child.id, level + 1))}
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
        <span className="panel-count">{scene.entities.length}</span>
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
          <strong title={scene.room.name}>{scene.room.name}</strong>
          <small>{scene.room.id}</small>
        </span>
      </button>
      <div className="outliner-tree">
        {childrenByParent.get(null)?.map((entity) => renderEntity(entity.id, 0))}
      </div>
      <p className="panel-note">階層とIDは3D選択と同期します。</p>
    </section>
  )
}
