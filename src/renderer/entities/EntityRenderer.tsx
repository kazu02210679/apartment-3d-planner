import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'

import { resolveCatalogInstance } from '../../catalog/catalog'
import type { GeometryDescriptor } from '../../catalog/types'
import type { Dimensions, Entity } from '../../domain/schema'
import {
  millimetresToRendererLength,
  toRendererDimensions,
  toRendererTransform,
  type RendererTransform,
} from '../adapters'
import { resolveRendererMaterial, type RendererMaterial } from '../materials'
import { GenericBox } from './GenericBox'

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
): RenderableEntity | null {
  if (!entity.visible) return null

  try {
    const resolved = entity.catalog ? resolveCatalogInstance(entity) : undefined
    return {
      entity,
      dimensions: resolved?.dimensions ?? entity.dimensions,
      geometry: resolved?.geometry ?? { kind: 'box' },
      material: resolveRendererMaterial(resolved?.materialId),
      transform: toRendererTransform(entity.transform),
      state: { selected, locked: entity.locked, outOfBounds },
    }
  } catch {
    return {
      entity,
      dimensions: entity.dimensions,
      geometry: { kind: 'box' },
      material: resolveRendererMaterial(),
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

function PanelWithStand({ renderable }: { readonly renderable: RenderableEntity }) {
  const { dimensions, geometry, material } = renderable
  if (geometry.kind !== 'panel-with-stand') return null
  const total = toRendererDimensions(dimensions)
  const panelWidth = millimetresToRendererLength(geometry.panel.width)
  const panelHeight = millimetresToRendererLength(geometry.panel.height)
  const standHeight = Math.max(0.04, total[1] - panelHeight)
  const outlineColor = outlineFor(renderable.state)

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, standHeight / 2, 0]}>
        <boxGeometry args={[0.05, standHeight, 0.05]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, total[1] / 2 - panelHeight / 2, 0]}>
        <boxGeometry args={[panelWidth, panelHeight, Math.max(0.025, total[2] * 0.25)]} />
        <meshStandardMaterial {...material} />
        {outlineColor ? <Edges color={outlineColor} threshold={15} /> : null}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, -total[1] / 2 + 0.025, total[2] * 0.1]}
      >
        <boxGeometry
          args={[Math.min(panelWidth * 0.55, 0.45), 0.05, Math.max(0.12, total[2] * 0.8)]}
        />
        <meshStandardMaterial {...material} />
      </mesh>
    </group>
  )
}

function LDesk({ renderable }: { readonly renderable: RenderableEntity }) {
  const { dimensions, geometry, material } = renderable
  if (geometry.kind !== 'l-desk') return null
  const total = toRendererDimensions(dimensions)
  const topThickness = 0.06
  const main = [
    millimetresToRendererLength(geometry.mainTop.width),
    topThickness,
    millimetresToRendererLength(geometry.mainTop.depth),
  ] as const
  const returnTop = [
    millimetresToRendererLength(geometry.returnTop.width),
    topThickness,
    millimetresToRendererLength(geometry.returnTop.depth),
  ] as const
  const returnDirection = geometry.returnSide === 'left' ? -1 : 1
  const outlineColor = outlineFor(renderable.state)

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, total[1] / 2 - topThickness / 2, 0]}>
        <boxGeometry args={main} />
        <meshStandardMaterial {...material} />
        {outlineColor ? <Edges color={outlineColor} threshold={15} /> : null}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[
          returnDirection * (main[0] / 2 - returnTop[0] / 2),
          total[1] / 2 - topThickness / 2,
          main[2] / 2 + returnTop[2] / 2 - 0.05,
        ]}
      >
        <boxGeometry args={returnTop} />
        <meshStandardMaterial {...material} />
        {outlineColor ? <Edges color={outlineColor} threshold={15} /> : null}
      </mesh>
    </group>
  )
}

interface EntityRendererProps {
  readonly entity: Entity
  readonly selected: boolean
  readonly outOfBounds: boolean
  readonly onSelect: (id: string) => void
  readonly children?: ReactNode
}

export function EntityRenderer({
  entity,
  selected,
  outOfBounds,
  onSelect,
  children,
}: EntityRendererProps) {
  const renderable = resolveRenderableEntity(entity, selected, outOfBounds)
  if (!renderable) return null
  const dimensions = toRendererDimensions(renderable.dimensions)
  const outlineColor = outlineFor(renderable.state)
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(entity.id)
  }

  return (
    <group
      name={entity.id}
      position={renderable.transform.position}
      rotation={renderable.transform.rotation}
      onClick={select}
    >
      {renderable.geometry.kind === 'panel-with-stand' ? (
        <PanelWithStand renderable={renderable} />
      ) : renderable.geometry.kind === 'l-desk' ? (
        <LDesk renderable={renderable} />
      ) : (
        <GenericBox
          dimensions={dimensions}
          material={renderable.material}
          outlineColor={outlineColor}
        />
      )}
      {children}
    </group>
  )
}
