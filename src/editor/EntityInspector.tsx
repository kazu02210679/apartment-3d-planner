import { useEffect, useState, useSyncExternalStore } from 'react'

import { getCatalogDefinition, resolveCatalogInstance } from '../catalog/catalog'
import type { Entity, JsonObject, Transform } from '../domain/schema'
import type { EditorStore } from '../app/editor-store'
import { NumericField } from './RoomInspector'
import { CableInspector } from './CableInspector'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function updateVector<T extends 'position' | 'rotation'>(
  entity: Entity,
  key: T,
  axis: keyof Entity['transform'][T],
  value: number,
): Transform {
  return { ...entity.transform, [key]: { ...entity.transform[key], [axis]: value } }
}

function sourceLabel(entity: Entity): string {
  if (!entity.catalog) return '個別調整'
  if (entity.catalog.presetId) return 'プリセット'
  return Object.keys(entity.overrides).length > 0 ? '個別調整' : 'カタログ'
}

export function EntityInspector({ store }: { store: EditorStore }) {
  const snapshot = useSnapshot(store)
  const entity = snapshot.selectedEntityId
    ? snapshot.scene.entities.find(
        (candidate) => candidate.id === snapshot.selectedEntityId,
      )
    : undefined
  const [nameDraft, setNameDraft] = useState(entity?.name ?? '')
  const [nameError, setNameError] = useState('')
  useEffect(() => {
    setNameDraft(entity?.name ?? '')
    setNameError('')
  }, [entity?.id, entity?.name])
  if (!entity) return null
  const locked = entity.locked
  const definition = entity.catalog
    ? (() => {
        try {
          return getCatalogDefinition(entity.catalog.itemId)
        } catch {
          return undefined
        }
      })()
    : undefined
  const resolved = entity.catalog
    ? (() => {
        try {
          return resolveCatalogInstance(entity)
        } catch {
          return undefined
        }
      })()
    : undefined
  const overrides = entity.overrides as JsonObject
  const geometry = (overrides.geometry ?? {}) as JsonObject
  const lDesk = (geometry.lDesk ?? {}) as JsonObject
  const hasCustomCatalogOverrides = Boolean(
    entity.overrides.dimensions || entity.overrides.geometry,
  )
  const monitorPreset =
    entity.catalog?.presetId ??
    (definition?.id === 'display.monitor'
      ? hasCustomCatalogOverrides
        ? 'custom'
        : 'monitor-27'
      : definition?.id === 'desk.l-shaped-sit-stand' && !hasCustomCatalogOverrides
        ? 'seated'
        : '')
  const setOverride = (next: JsonObject) => store.setCatalogOverrides(entity.id, next)
  const commitName = () => {
    if (!nameDraft.trim()) {
      setNameError('名前を入力してください。')
      return
    }
    setNameError('')
    store.renameEntity(entity.id, nameDraft)
  }

  return (
    <section
      className="inspector-content panel-scroll"
      aria-label="エンティティインスペクター"
    >
      <div className="inspector-title">
        <p className="eyebrow">ENTITY / {entity.kind.toUpperCase()}</p>
        <div className="inspector-heading-row">
          <h2>エンティティ</h2>
          <span className="source-badge">{sourceLabel(entity)}</span>
        </div>
        <p className="muted-copy" title={entity.id}>
          {entity.id}
        </p>
      </div>
      <label className="field">
        <span>名前</span>
        <input
          aria-label="名前"
          value={nameDraft}
          disabled={locked}
          aria-invalid={nameError ? 'true' : undefined}
          onChange={(event) => {
            setNameDraft(event.target.value)
            setNameError('')
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitName()
            }
          }}
        />
      </label>
      {nameError ? <p className="field-error">{nameError}</p> : null}
      <div className="inspector-actions">
        {snapshot.selectedEntityIds.length >= 2 ? (
          <button
            type="button"
            data-testid="group-selected"
            onClick={() => store.groupEntities(snapshot.selectedEntityIds)}
          >
            グループ化（{snapshot.selectedEntityIds.length}）
          </button>
        ) : null}
        <button type="button" onClick={() => store.setLocked(entity.id, !locked)}>
          {locked ? 'ロック解除' : 'ロック'}
        </button>
        <button
          type="button"
          onClick={() => store.setVisibility(entity.id, !entity.visible)}
          disabled={locked}
        >
          {entity.visible ? '非表示' : '表示'}
        </button>
        <button
          type="button"
          onClick={() => store.duplicateEntity(entity.id)}
          disabled={locked}
        >
          複製
        </button>
        <button
          type="button"
          className="danger-action"
          onClick={() => store.deleteEntity(entity.id)}
          disabled={locked}
        >
          削除
        </button>
      </div>
      {definition ? (
        <>
          <section className="inspector-section" aria-labelledby="catalog-detail-heading">
            <div className="section-heading">
              <h3 id="catalog-detail-heading">カタログ情報</h3>
              <span className="micro-label">{definition.displayName.ja}</span>
            </div>
            {definition.presets.length > 0 ? (
              <label className="field">
                <span>
                  {definition.id === 'display.monitor'
                    ? 'モニターサイズ'
                    : 'カタログプリセット'}
                </span>
                <select
                  aria-label="カタログプリセット"
                  value={monitorPreset}
                  disabled={locked}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === 'custom')
                      store.setCatalogCustomDimensions(entity.id, entity.dimensions)
                    else store.setCatalogPreset(entity.id, value)
                  }}
                >
                  {definition.id === 'display.monitor' ? (
                    <option value="custom">Custom</option>
                  ) : null}
                  {definition.presets.map((preset) => (
                    <option value={preset.id} key={preset.id}>
                      {preset.displayName.ja}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>マテリアル</span>
              <select
                aria-label="マテリアル"
                disabled={locked}
                value={String(
                  (overrides.materialId as string | undefined) ??
                    definition.materials[0]?.id ??
                    '',
                )}
                onChange={(event) => store.setMaterial(entity.id, event.target.value)}
              >
                {definition.materials.map((material) => (
                  <option value={material.id} key={material.id}>
                    {material.displayName.ja}
                  </option>
                ))}
              </select>
            </label>
            {definition.id === 'desk.l-shaped-sit-stand' ? (
              <>
                <label className="field">
                  <span>リターン位置</span>
                  <select
                    aria-label="リターン位置"
                    disabled={locked}
                    value={String(lDesk.returnSide ?? 'right')}
                    onChange={(event) =>
                      setOverride({
                        ...overrides,
                        geometry: {
                          ...geometry,
                          lDesk: { ...lDesk, returnSide: event.target.value },
                        },
                      })
                    }
                  >
                    <option value="left">左</option>
                    <option value="right">右</option>
                  </select>
                </label>
                <button
                  className="subtle-button"
                  type="button"
                  disabled={locked}
                  onClick={() => store.resetCatalogOverride(entity.id)}
                >
                  カタログ調整をすべてリセット
                </button>
              </>
            ) : null}
            {resolved ? (
              <p className="inspector-note">
                解決済み寸法: {resolved.dimensions.width} × {resolved.dimensions.depth} ×{' '}
                {resolved.dimensions.height} mm
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <p className="warning-box">このエンティティはカタログ定義を参照していません。</p>
      )}
      <section className="inspector-section" aria-labelledby="transform-heading">
        <div className="section-heading">
          <h3 id="transform-heading">位置（mm）</h3>
          <span className="micro-label">POSITION</span>
        </div>
        <div className="field-grid field-grid--three">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumericField
              key={axis}
              testId={`position-${axis}`}
              label={`位置 ${axis.toUpperCase()}`}
              value={entity.transform.position[axis]}
              disabled={locked}
              onCommit={(value) =>
                store.setTransform(
                  entity.id,
                  updateVector(entity, 'position', axis, value),
                )
              }
            />
          ))}
        </div>
        <div className="section-heading">
          <h3>回転（度）</h3>
          <span className="micro-label">ROTATION</span>
        </div>
        <div className="field-grid field-grid--three">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumericField
              key={axis}
              testId={`rotation-${axis}`}
              label={`回転 ${axis.toUpperCase()}`}
              value={entity.transform.rotation[axis]}
              disabled={locked}
              onCommit={(value) =>
                store.setTransform(
                  entity.id,
                  updateVector(entity, 'rotation', axis, value),
                )
              }
            />
          ))}
        </div>
      </section>
      <section className="inspector-section" aria-labelledby="dimensions-heading">
        <div className="section-heading">
          <h3 id="dimensions-heading">寸法（mm）</h3>
          <span className="micro-label">DIMENSIONS</span>
        </div>
        <div className="field-grid">
          {(['width', 'depth', 'height'] as const).map((axis) => (
            <NumericField
              key={axis}
              testId={`dimensions-${axis}`}
              label={
                axis === 'width'
                  ? '幅（mm）'
                  : axis === 'depth'
                    ? '奥行き（mm）'
                    : '高さ（mm）'
              }
              value={entity.dimensions[axis]}
              min={0}
              disabled={locked}
              onCommit={(value) => {
                const dimensions = { ...entity.dimensions, [axis]: value }
                if (definition?.id === 'display.monitor')
                  store.setCatalogCustomDimensions(entity.id, dimensions)
                else store.setDimensions(entity.id, dimensions)
              }}
            />
          ))}
        </div>
      </section>
      {entity.parentId ? (
        <button
          className="subtle-button"
          type="button"
          disabled={locked}
          onClick={() => store.ungroupEntity(entity.id)}
        >
          グループから外す
        </button>
      ) : null}
      <CableInspector store={store} entity={entity} />
      {snapshot.errorMessage ? (
        <p className="error-banner">{snapshot.errorMessage}</p>
      ) : null}
    </section>
  )
}
