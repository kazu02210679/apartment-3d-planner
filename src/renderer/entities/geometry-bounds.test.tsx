import { create } from '@react-three/test-renderer'
import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'

import { DEFAULT_RENDERER_MATERIAL } from '../materials'
import { Computer } from './Computer'
import { LDesk } from './LDesk'
import { Lighting } from './Lighting'
import { LivingFurniture } from './LivingFurniture'
import { Monitor } from './Monitor'
import { MonitorArm } from './MonitorArm'
import { Printer } from './Printer'
import { Shelf } from './Shelf'

const dimensions = [1.2, 0.72, 0.7] as const
const models = [
  <LDesk dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <LDesk
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    geometry={{
      kind: 'l-desk',
      mainTop: { width: 900, depth: 400 },
      returnTop: { width: 600, depth: 350 },
      returnSide: 'left',
    }}
  />,
  <Monitor dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <Monitor
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    mode="calendar"
  />,
  <MonitorArm dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <Computer dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} kind="tower" />,
  <Computer dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} kind="mac" />,
  <Computer dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} kind="mini" />,
  <Printer dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <Lighting dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <Lighting dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} room />,
  <Shelf dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} cabinet />,
  <Shelf dimensions={dimensions} material={DEFAULT_RENDERER_MATERIAL} />,
  <LivingFurniture
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    kind="chair"
  />,
  <LivingFurniture
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    kind="bed"
  />,
  <LivingFurniture
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    kind="side-table"
  />,
  <LivingFurniture
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    kind="trash"
  />,
  <LivingFurniture
    dimensions={dimensions}
    material={DEFAULT_RENDERER_MATERIAL}
    kind="power-strip"
  />,
]

describe('detailed model geometry bounds', () => {
  it.each(models)(
    'keeps every rendered geometry part inside resolved local bounds',
    async (model) => {
      const renderer = await create(model)
      const bounds = new Box3().setFromObject(renderer.scene.instance)
      expect(bounds.min.x).toBeGreaterThanOrEqual(-0.60001)
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.36001)
      expect(bounds.min.z).toBeGreaterThanOrEqual(-0.35001)
      expect(bounds.max.x).toBeLessThanOrEqual(0.60001)
      expect(bounds.max.y).toBeLessThanOrEqual(0.36001)
      expect(bounds.max.z).toBeLessThanOrEqual(0.35001)
    },
  )
})
