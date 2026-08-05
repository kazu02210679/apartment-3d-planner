import { useSyncExternalStore, useState } from 'react'

import { CATALOG_DEFINITIONS } from '../catalog/catalog'
import type { CatalogDefinition } from '../catalog/types'
import type { EditorStore } from '../app/editor-store'

function useSnapshot(store: EditorStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

const categoryLabels: Record<string, string> = {
  room: '部屋',
  desk: 'デスク',
  seating: 'チェア',
  computer: 'コンピュータ',
  display: 'ディスプレイ',
  mount: 'マウント',
  light: '照明',
  storage: '収納',
  printer: 'プリンター',
  power: '電源',
  cable: 'ケーブル',
  waste: '廃棄',
  sleep: '寝具',
  table: 'テーブル',
}

export function CatalogPanel({ store }: { store: EditorStore }) {
  useSnapshot(store)
  const [query, setQuery] = useState('')
  const groups = new Map<string, CatalogDefinition[]>()
  CATALOG_DEFINITIONS.filter((definition) => {
    const needle = query.trim().toLocaleLowerCase()
    return (
      !needle ||
      `${definition.displayName.ja} ${definition.displayName.en}`
        .toLocaleLowerCase()
        .includes(needle)
    )
  }).forEach((definition) => {
    const group = groups.get(definition.category) ?? []
    group.push(definition)
    groups.set(definition.category, group)
  })

  return (
    <section className="catalog-panel panel-scroll" aria-label="カタログパネル">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h2>カタログ</h2>
        </div>
        <span className="panel-count">{CATALOG_DEFINITIONS.length}</span>
      </div>
      <label className="search-field">
        <span>項目を検索</span>
        <input
          aria-label="カタログを検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="catalog-groups">
        {[...groups.entries()].map(([category, definitions]) => (
          <section
            className="catalog-group"
            key={category}
            aria-labelledby={`catalog-${category}`}
          >
            <h3 id={`catalog-${category}`}>
              {categoryLabels[category] ?? category}アイテム
            </h3>
            <div className="catalog-items">
              {definitions.map((definition) => (
                <div className="catalog-item" key={definition.id}>
                  <span className="catalog-item-icon" aria-hidden="true">
                    {definition.category.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="catalog-item-copy">
                    <strong title={definition.displayName.ja}>
                      {definition.displayName.ja}
                    </strong>
                    <small>{definition.displayName.en}</small>
                  </span>
                  <button
                    className="small-action"
                    type="button"
                    aria-label={`${definition.displayName.ja}を追加`}
                    data-testid={`catalog-add-${definition.id}`}
                    onClick={() => {
                      store.addCatalogItem(definition.id)
                      store.setMobilePanel('none')
                    }}
                  >
                    追加
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
