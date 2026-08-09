import { create } from '@react-three/test-renderer'
import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'

import { getCatalogDefinition, resolveCatalogDimensions } from '../../catalog/catalog'
import type { GeometryDescriptor } from '../../catalog/types'
import type { RendererVector3 } from '../adapters'
import { DEFAULT_RENDERER_MATERIAL } from '../materials'
import { Computer } from './Computer'
import { LDesk } from './LDesk'
import { Lighting } from './Lighting'
import { LivingFurniture } from './LivingFurniture'
import { Monitor } from './Monitor'
import { MonitorArm } from './MonitorArm'
import { Printer } from './Printer'
import { Shelf } from './Shelf'

const dimensionsFor = (itemId: string, presetId?: string): RendererVector3 => {
  const { width, height, depth } = resolveCatalogDimensions(itemId, presetId)
  return [width / 1000, height / 1000, depth / 1000]
}

const lDesk = getCatalogDefinition('desk.l-shaped-sit-stand').geometry as Extract<
  GeometryDescriptor,
  { readonly kind: 'l-desk' }
>

const cases = [
  [
    'straight desk',
    dimensionsFor('desk.straight'),
    (d: RendererVector3) => <LDesk dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />,
  ],
  [
    'L desk left',
    dimensionsFor('desk.l-shaped-sit-stand'),
    (d: RendererVector3) => (
      <LDesk
        dimensions={d}
        material={DEFAULT_RENDERER_MATERIAL}
        geometry={{ ...lDesk, returnSide: 'left' }}
      />
    ),
  ],
  [
    'L desk right',
    dimensionsFor('desk.l-shaped-sit-stand'),
    (d: RendererVector3) => (
      <LDesk
        dimensions={d}
        material={DEFAULT_RENDERER_MATERIAL}
        geometry={{ ...lDesk, returnSide: 'right' }}
      />
    ),
  ],
  ...(['monitor-24', 'monitor-27', 'monitor-32'] as const).map(
    (preset) =>
      [
        `${preset} monitor`,
        dimensionsFor('display.monitor', preset),
        (d: RendererVector3) => (
          <Monitor dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />
        ),
      ] as const,
  ),
  [
    'custom monitor',
    [0.43, 0.31, 0.09] as RendererVector3,
    (d: RendererVector3) => (
      <Monitor dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />
    ),
  ],
  [
    'information display',
    dimensionsFor('display.information'),
    (d: RendererVector3) => (
      <Monitor dimensions={d} material={DEFAULT_RENDERER_MATERIAL} mode="calendar" />
    ),
  ],
  [
    'monitor arm',
    dimensionsFor('mount.monitor-arm'),
    (d: RendererVector3) => (
      <MonitorArm dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />
    ),
  ],
  ...(['tower', 'mac', 'mini'] as const).map(
    (kind) =>
      [
        `computer ${kind}`,
        dimensionsFor(
          kind === 'tower'
            ? 'computer.windows-tower'
            : kind === 'mac'
              ? 'computer.mac'
              : 'computer.mini-pc',
        ),
        (d: RendererVector3) => (
          <Computer dimensions={d} material={DEFAULT_RENDERER_MATERIAL} kind={kind} />
        ),
      ] as const,
  ),
  [
    'printer',
    dimensionsFor('printer.generic'),
    (d: RendererVector3) => (
      <Printer dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />
    ),
  ],
  [
    'display light',
    dimensionsFor('light.display'),
    (d: RendererVector3) => (
      <Lighting dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />
    ),
  ],
  [
    'room light',
    dimensionsFor('light.room'),
    (d: RendererVector3) => (
      <Lighting dimensions={d} material={DEFAULT_RENDERER_MATERIAL} room />
    ),
  ],
  [
    'desk shelf',
    dimensionsFor('desk.shelf'),
    (d: RendererVector3) => <Shelf dimensions={d} material={DEFAULT_RENDERER_MATERIAL} />,
  ],
  [
    'storage cabinet',
    dimensionsFor('storage.shelf-cabinet'),
    (d: RendererVector3) => (
      <Shelf dimensions={d} material={DEFAULT_RENDERER_MATERIAL} cabinet />
    ),
  ],
  [
    'clothes storage',
    dimensionsFor('storage.clothes'),
    (d: RendererVector3) => (
      <Shelf dimensions={d} material={DEFAULT_RENDERER_MATERIAL} cabinet />
    ),
  ],
  ...(['chair', 'bed', 'side-table', 'trash', 'power-strip'] as const).map(
    (kind) =>
      [
        `${kind}`,
        dimensionsFor(
          {
            chair: 'seating.chair',
            bed: 'sleep.bed-futon',
            'side-table': 'table.side',
            trash: 'waste.trash-bin',
            'power-strip': 'power.strip',
          }[kind],
        ),
        (d: RendererVector3) => (
          <LivingFurniture
            dimensions={d}
            material={DEFAULT_RENDERER_MATERIAL}
            kind={kind}
          />
        ),
      ] as const,
  ),
] as const

describe('detailed model geometry bounds', () => {
  it.each(cases)(
    '%s keeps rendered geometry inside its resolved local bounds',
    async (_, dimensions, render) => {
      const renderer = await create(render(dimensions))
      const bounds = new Box3().setFromObject(renderer.scene.instance)
      const epsilon = 0.00001
      expect(bounds.min.x).toBeGreaterThanOrEqual(-dimensions[0] / 2 - epsilon)
      expect(bounds.min.y).toBeGreaterThanOrEqual(-dimensions[1] / 2 - epsilon)
      expect(bounds.min.z).toBeGreaterThanOrEqual(-dimensions[2] / 2 - epsilon)
      expect(bounds.max.x).toBeLessThanOrEqual(dimensions[0] / 2 + epsilon)
      expect(bounds.max.y).toBeLessThanOrEqual(dimensions[1] / 2 + epsilon)
      expect(bounds.max.z).toBeLessThanOrEqual(dimensions[2] / 2 + epsilon)
    },
  )
})
