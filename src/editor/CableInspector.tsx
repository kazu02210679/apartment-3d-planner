import { useSyncExternalStore } from 'react'

import type { EditorStore } from '../app/editor-store'
import { getCableEndAttachment, getCableRouting } from '../domain/connections'
import type { Entity } from '../domain/schema'
import { NumericField } from './RoomInspector'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function CableInspector({
  store,
  entity,
}: {
  readonly store: EditorStore
  readonly entity: Entity
}) {
  const snapshot = useSnapshot(store)
  if (entity.catalog?.itemId !== 'cable.generic') return null
  const routing = getCableRouting(entity)
  const ends = entity.ports.filter(
    (port) =>
      port.extensions.catalogPortId === 'end-a' ||
      port.extensions.catalogPortId === 'end-b',
  )
  return (
    <section
      className="inspector-section"
      aria-label="ケーブル設定"
      data-testid="cable-inspector"
    >
      <div className="section-heading">
        <h3>ケーブル設定</h3>
        <span className="micro-label">ROUTING</span>
      </div>
      <p className="warning-box">
        配線は概略です。電気、長さ、負荷、曲げ半径は検証しません。
      </p>
      <label className="field">
        <span>ケーブル種別</span>
        <select
          aria-label="ケーブル種別"
          value={routing.kind}
          disabled={entity.locked}
          onChange={(event) =>
            store.setCableRouting(entity.id, {
              ...routing,
              kind: event.target.value as typeof routing.kind,
            })
          }
        >
          {(['power', 'display', 'network', 'generic'] as const).map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      {ends.map((end) => {
        const connection = getCableEndAttachment(snapshot.scene, entity.id, end.id)
        return (
          <div key={end.id} className="cable-end">
            <strong>{end.name}</strong>
            <span>{connection ? '接続済み' : '未接続'}</span>
            {connection ? (
              <button
                type="button"
                data-testid={`cable-end-${end.extensions.catalogPortId}-detach`}
                disabled={entity.locked}
                onClick={() => store.detachCableEnd(entity.id, end.id)}
              >
                取り外す
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid={`cable-end-${end.extensions.catalogPortId}-begin`}
                  disabled={entity.locked}
                  onClick={() => store.beginCableDraft(entity.id, end.id)}
                >
                  接続先を選ぶ
                </button>
                <div className="field-grid field-grid--three">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <NumericField
                      key={axis}
                      testId={`cable-end-${end.extensions.catalogPortId}-${axis}`}
                      label={`端子 ${axis.toUpperCase()} mm`}
                      value={end.position?.[axis] ?? 0}
                      disabled={entity.locked}
                      min={-Infinity}
                      onCommit={(value) =>
                        store.setCableEndPosition(entity.id, end.id, {
                          ...(end.position ?? { x: 0, y: 0, z: 0 }),
                          [axis]: value,
                        })
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
      <button
        type="button"
        data-testid="cable-waypoint-add"
        disabled={entity.locked || routing.waypoints.length >= 64}
        onClick={() => store.addCableWaypoint(entity.id)}
      >
        経由点を追加
      </button>
      {routing.waypoints.map((waypoint) => (
        <div className="cable-end" key={waypoint.id}>
          <strong>経由点 {waypoint.id}</strong>
          <div className="field-grid field-grid--three">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <NumericField
                key={axis}
                testId={`cable-waypoint-${waypoint.id}-${axis}`}
                label={`経由点 ${axis.toUpperCase()} mm`}
                value={waypoint.position[axis]}
                disabled={entity.locked}
                min={-Infinity}
                onCommit={(value) =>
                  store.updateCableWaypoint(entity.id, waypoint.id, {
                    ...waypoint.position,
                    [axis]: value,
                  })
                }
              />
            ))}
          </div>
          <button
            type="button"
            data-testid={`cable-waypoint-${waypoint.id}-delete`}
            disabled={entity.locked}
            onClick={() => store.deleteCableWaypoint(entity.id, waypoint.id)}
          >
            経由点を削除
          </button>
        </div>
      ))}
    </section>
  )
}
