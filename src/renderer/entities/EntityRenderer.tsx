import type { ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'
import type { Group } from 'three'

import { resolveCatalogInstance } from '../../catalog/catalog'
import type { GeometryDescriptor } from '../../catalog/types'
import type { Dimensions, Entity } from '../../domain/schema'
import {
  toRendererDimensions,
  toRendererTransform,
  type RendererTransform,
} from '../adapters'
import { resolveRendererMaterial, type RendererMaterial } from '../materials'
import type { RendererProfile } from '../quality'
import { Computer } from './Computer'
import { GenericBox } from './GenericBox'
import { LDesk } from './LDesk'
import { Lighting } from './Lighting'
import { LivingFurniture } from './LivingFurniture'
import { Monitor } from './Monitor'
import { MonitorArm } from './MonitorArm'
import { Printer } from './Printer'
import { Shelf } from './Shelf'

export interface RenderableEntity {
  readonly entity: Entity
  readonly dimensions: Dimensions
  readonly geometry: GeometryDescriptor
  readonly material: RendererMaterial
  readonly transform: RendererTransform
  readonly state: {
    readonly selected: boolean
    readonly locked: boolean
    readonly outOfBounds: boolean
  }
}

// This pure resolver intentionally shares the component module's public boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveRenderableEntity(
  entity: Entity,
  selected: boolean,
  outOfBounds: boolean,
  preview = false,
): RenderableEntity | null {
  if (!entity.visible) return null

  try {
    const resolved = entity.catalog ? resolveCatalogInstance(entity) : undefined
    return {
      entity,
      dimensions: resolved?.dimensions ?? entity.dimensions,
      geometry: resolved?.geometry ?? { kind: 'box' },
      material: resolveRendererMaterial(resolved?.materialId, preview),
      transform: toRendererTransform(entity.transform),
      state: { selected, locked: entity.locked, outOfBounds },
    }
  } catch {
    return {
      entity,
      dimensions: entity.dimensions,
      geometry: { kind: 'box' },
      material: resolveRendererMaterial(undefined, preview),
      transform: toRendererTransform(entity.transform),
      state: { selected, locked: entity.locked, outOfBounds },
    }
  }
}

function outlineFor(state: RenderableEntity['state']): string | undefined {
  if (state.selected) return '#d7f36b'
  if (state.outOfBounds) return '#ff8d91'
  if (state.locked) return '#7fc4ff'
  return undefined
}

function DetailedModel({ renderable }: { readonly renderable: RenderableEntity }) {
  const dimensions = toRendererDimensions(renderable.dimensions)
  const outlineColor = outlineFor(renderable.state)
  const props = { dimensions, material: renderable.material, outlineColor }

  switch (renderable.entity.catalog?.itemId) {
    case 'desk.l-shaped-sit-stand':
      return <LDesk {...props} geometry={renderable.geometry} />
    case 'desk.straight':
      return <LDesk {...props} />
    case 'display.monitor':
      return <Monitor {...props} />
    case 'display.information':
      return <Monitor {...props} mode="calendar" />
    case 'mount.monitor-arm':
      return <MonitorArm {...props} />
    case 'light.display':
      return <Lighting {...props} />
    case 'light.room':
      return <Lighting {...props} room />
    case 'desk.shelf':
      return <Shelf {...props} />
    case 'storage.shelf-cabinet':
      return <Shelf {...props} cabinet />
    case 'storage.clothes':
      return <Shelf {...props} cabinet />
    case 'printer.generic':
      return <Printer {...props} />
    case 'computer.windows-tower':
      return <Computer {...props} kind="tower" />
    case 'computer.mac':
      return <Computer {...props} kind="mac" />
    case 'computer.mini-pc':
      return <Computer {...props} kind="mini" />
    case 'seating.chair':
      return <LivingFurniture {...props} kind="chair" />
    case 'sleep.bed-futon':
      return <LivingFurniture {...props} kind="bed" />
    case 'table.side':
      return <LivingFurniture {...props} kind="side-table" />
    case 'waste.trash-bin':
      return <LivingFurniture {...props} kind="trash" />
    case 'power.strip':
      return <LivingFurniture {...props} kind="power-strip" />
    case 'cable.generic':
      return null
    default:
      return (
        <GenericBox
          dimensions={dimensions}
          material={renderable.material}
          outlineColor={outlineColor}
        />
      )
  }
}

interface EntityRendererProps {
  readonly entity: Entity
  readonly selected: boolean
  readonly outOfBounds: boolean
  readonly onSelect: (id: string) => void
  readonly onObjectReady?: (id: string, object: Group | null) => void
  readonly children?: ReactNode
  readonly profile?: RendererProfile
}

export function EntityRenderer({
  entity,
  selected,
  outOfBounds,
  onSelect,
  onObjectReady,
  children,
  profile,
}: EntityRendererProps) {
  const renderable = resolveRenderableEntity(
    entity,
    selected,
    outOfBounds,
    profile?.id === 'preview',
  )
  if (!renderable) return null
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(entity.id)
  }

  return (
    <group
      name={entity.id}
      ref={(object) => onObjectReady?.(entity.id, object)}
      position={renderable.transform.position}
      rotation={renderable.transform.rotation}
      onClick={select}
    >
      <DetailedModel renderable={renderable} />
      {children}
    </group>
  )
}
