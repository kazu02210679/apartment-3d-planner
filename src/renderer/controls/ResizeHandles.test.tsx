import { create } from '@react-three/test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { Object3D } from 'three'

import type { InteractionController } from './interaction-controller'
import { ResizeHandles } from './ResizeHandles'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function localPoint(x: number, y = 0, z = 0) {
  return {
    clone: () => localPoint(x, y, z),
    sub: (origin: { readonly x: number; readonly y: number; readonly z: number }) =>
      localPoint(x - origin.x, y - origin.y, z - origin.z),
    dot: (axis: { readonly x: number; readonly y: number; readonly z: number }) =>
      x * axis.x + y * axis.y + z * axis.z,
    x,
    y,
    z,
  }
}

const identityObject = {
  matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
} as unknown as Object3D

describe('ResizeHandles', () => {
  it('places each handle around the selected entity in its local dimensions', async () => {
    const controller: InteractionController = {
      active: false,
      start: () => false,
      updateTransform: () => false,
      updateDimensions: () => false,
      resizeByLocalDelta: () => false,
      commit: () => false,
      cancel: () => false,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
          entityObject={identityObject}
          dimensions={{ width: 1000, depth: 600, height: 400 }}
          enabled
          controller={controller}
        />,
      )

      expect(
        renderer.scene.findByProps({ name: 'resize-width-handle' }).props.position,
      ).toEqual([0.5, 0, 0])
      expect(
        renderer.scene.findByProps({ name: 'resize-height-handle' }).props.position,
      ).toEqual([0, 0.2, 0])
      expect(
        renderer.scene.findByProps({ name: 'resize-depth-handle' }).props.position,
      ).toEqual([0, 0, 0.3])
    } finally {
      warn.mockRestore()
    }
  })

  it('projects pointer movement onto a handle axis for both grow and shrink drags', async () => {
    let active = false
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: vi.fn(() => {
        active = true
        return true
      }),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(() => {
        active = false
        return true
      }),
      cancel: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
          entityObject={identityObject}
          dimensions={{ width: 1000, depth: 600, height: 400 }}
          enabled
          controller={controller}
        />,
      )
      const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
      const target = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      }
      const event = (point: ReturnType<typeof localPoint>) =>
        ({
          pointerId: 1,
          target,
          stopPropagation: vi.fn(),
          unprojectedPoint: point,
        }) as never

      const origin = localPoint(0)
      await handle.props.onPointerDown(event(origin))
      // R3F may retain event point instances; the start frame must be copied.
      origin.x = 0.05
      await handle.props.onPointerMove(event(localPoint(0.1)))
      ;(identityObject.matrixWorld.elements as number[])[12] = 0.05
      await handle.props.onPointerMove(event(localPoint(0.2)))
      await handle.props.onPointerMove(event(localPoint(-0.05)))

      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(1, 0, 0.1)
      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(2, 0, 0.2)
      expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(3, 0, -0.05)
      await handle.props.onPointerUp(event(localPoint(-0.05)))
      expect(target.setPointerCapture).toHaveBeenCalledWith(1)
      expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
      expect(controller.commit).toHaveBeenCalledTimes(1)

      active = true
      await handle.props.onPointerDown(event(localPoint(0)))
      await handle.props.onPointerCancel(event(localPoint(0)))
      expect(controller.cancel).toHaveBeenCalledTimes(1)
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(2)

      active = true
      await handle.props.onPointerDown(event(localPoint(0)))
      window.dispatchEvent(new Event('blur'))
      expect(controller.cancel).toHaveBeenCalledTimes(2)

      active = true
      await handle.props.onPointerDown(event(localPoint(0)))
      await renderer.unmount()
      expect(controller.cancel).toHaveBeenCalledTimes(3)
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(4)
    } finally {
      warn.mockRestore()
    }
  })

  it('emits app-handler phases without instrumenting pointermove', async () => {
    let active = false
    const phases: string[] = []
    let token = 0
    const evidenceWindow = window as typeof window & {
      __apartmentEvidenceProbe?: {
        startPhase: (phase: string) => number | null
        endPhase: (value: number | null) => void
      }
    }
    evidenceWindow.__apartmentEvidenceProbe = {
      startPhase: (phase) => {
        phases.push(`start:${phase}`)
        return ++token
      },
      endPhase: (value) => phases.push(`end:${value}`),
    }
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: () => {
        active = true
        return true
      },
      updateTransform: () => false,
      updateDimensions: () => false,
      resizeByLocalDelta: vi.fn(() => true),
      commit: () => {
        active = false
        return true
      },
      cancel: () => false,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const renderer = await create(
        <ResizeHandles
          entityId="selected"
          entityObject={identityObject}
          dimensions={{ width: 1000, depth: 600, height: 400 }}
          enabled
          controller={controller}
        />,
      )
      const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
      const target = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      }
      const event = {
        pointerId: 1,
        target,
        stopPropagation: vi.fn(),
        unprojectedPoint: localPoint(0),
      } as never
      await handle.props.onPointerDown(event)
      await handle.props.onPointerMove({
        pointerId: 1,
        target,
        stopPropagation: vi.fn(),
        unprojectedPoint: localPoint(0.1),
      })
      await handle.props.onPointerUp(event)

      expect(phases.filter((entry) => entry.startsWith('start:'))).toEqual([
        'start:resize-pointerdown-app-handler',
        'start:resize-pointerdown-handler-return-to-layout',
        'start:resize-commit-app-handler',
        'start:resize-commit-handler-return-to-layout',
      ])
      expect(phases.some((entry) => entry.includes('pointermove'))).toBe(false)
      await renderer.unmount()
    } finally {
      warn.mockRestore()
      delete evidenceWindow.__apartmentEvidenceProbe
      delete window.__apartmentResizeFineGrainedEvidence
    }
  })

  it('does not arm inactive evidence and closes pending tokens on cancel or overwrite', async () => {
    let active = false
    let token = 10
    const ended: Array<number | null> = []
    const evidenceWindow = window as typeof window & {
      __apartmentEvidenceProbe?: {
        startPhase: (phase: string) => number | null
        endPhase: (value: number | null) => void
      }
    }
    evidenceWindow.__apartmentEvidenceProbe = {
      startPhase: () => null,
      endPhase: (value) => ended.push(value),
    }
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: () => {
        active = true
        return true
      },
      updateTransform: () => false,
      updateDimensions: () => false,
      resizeByLocalDelta: () => true,
      commit: () => {
        active = false
        return true
      },
      cancel: () => {
        active = false
        return true
      },
    }
    const renderer = await create(
      <ResizeHandles
        entityId="selected"
        entityObject={identityObject}
        dimensions={{ width: 1000, depth: 600, height: 400 }}
        enabled
        controller={controller}
      />,
    )
    const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    }
    const event = {
      pointerId: 1,
      target,
      stopPropagation: vi.fn(),
      unprojectedPoint: localPoint(0),
    } as never
    let mounted = true
    try {
      await handle.props.onPointerDown(event)
      expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()

      evidenceWindow.__apartmentEvidenceProbe.startPhase = () => ++token
      await handle.props.onPointerDown(event)
      expect(window.__apartmentResizeFineGrainedEvidence?.handlerToLayoutToken).toBe(12)
      await handle.props.onPointerCancel(event)
      expect(ended).toContain(12)
      expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()

      active = false
      await handle.props.onPointerDown(event)
      const previous = window.__apartmentResizeFineGrainedEvidence!.handlerToLayoutToken
      active = false
      await handle.props.onPointerDown(event)
      expect(ended).toContain(previous)

      const overwritten = window.__apartmentResizeFineGrainedEvidence!.handlerToLayoutToken
      await handle.props.onLostPointerCapture(event)
      expect(ended).toContain(overwritten)
      expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()

      active = false
      await handle.props.onPointerDown(event)
      const escaped = window.__apartmentResizeFineGrainedEvidence!.handlerToLayoutToken
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(ended).toContain(escaped)
      expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()

      active = false
      await handle.props.onPointerDown(event)
      const unmounted = window.__apartmentResizeFineGrainedEvidence!.handlerToLayoutToken
      await renderer.unmount()
      mounted = false
      expect(ended).toContain(unmounted)
      expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()
    } finally {
      if (mounted) await renderer.unmount()
      delete evidenceWindow.__apartmentEvidenceProbe
      delete window.__apartmentResizeFineGrainedEvidence
    }
  })

  it('cancels an active resize on Escape and ignores other or inactive keydowns', async () => {
    let active = false
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: vi.fn(() => {
        active = true
        return true
      }),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(() => {
        active = false
        return true
      }),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const renderer = await create(
      <ResizeHandles
        entityId="selected"
        entityObject={identityObject}
        dimensions={{ width: 1000, depth: 600, height: 400 }}
        enabled
        controller={controller}
      />,
    )
    const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    }
    const event = (point: ReturnType<typeof localPoint>) =>
      ({
        pointerId: 1,
        target,
        stopPropagation: vi.fn(),
        unprojectedPoint: point,
      }) as never

    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.cancel).not.toHaveBeenCalled()

      await handle.props.onPointerDown(event(localPoint(0)))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(controller.cancel).not.toHaveBeenCalled()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.cancel).toHaveBeenCalledTimes(1)
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(1)

      active = true
      await handle.props.onPointerMove(event(localPoint(0.1)))
      expect(controller.resizeByLocalDelta).not.toHaveBeenCalled()

      active = false
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.cancel).toHaveBeenCalledTimes(1)

      await renderer.unmount()
      expect(controller.cancel).toHaveBeenCalledTimes(1)
      expect(target.releasePointerCapture).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps the final resize delta invariant when the moving mesh shifts unprojectedPoint', async () => {
    let active = false
    const controller: InteractionController = {
      get active() {
        return active
      },
      start: vi.fn(() => {
        active = true
        return true
      }),
      updateTransform: vi.fn(),
      updateDimensions: vi.fn(),
      resizeByLocalDelta: vi.fn(),
      commit: vi.fn(() => true),
      cancel: vi.fn(() => true),
    }
    const renderer = await create(
      <ResizeHandles
        entityId="selected"
        entityObject={identityObject}
        dimensions={{ width: 1000, depth: 600, height: 400 }}
        enabled
        controller={controller}
      />,
    )
    const handle = renderer.scene.findByProps({ name: 'resize-width-handle' })
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    }
    const event = (rayX: number, unstableWorldX: number) =>
      ({
        pointerId: 1,
        target,
        stopPropagation: vi.fn(),
        unprojectedPoint: localPoint(unstableWorldX),
        ray: {
          origin: { x: rayX, y: 0, z: 1 },
          direction: { x: 0, y: 0, z: -1 },
        },
      }) as never

    await handle.props.onPointerDown(event(0.5, 0.5))
    await handle.props.onPointerMove(event(0.55, 4))
    await handle.props.onPointerMove(event(0.6, 9))

    expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(
      1,
      0,
      expect.any(Number),
    )
    expect(controller.resizeByLocalDelta).toHaveBeenNthCalledWith(
      2,
      0,
      expect.any(Number),
    )
    expect(vi.mocked(controller.resizeByLocalDelta).mock.calls[0]![1]).toBeCloseTo(0.05)
    expect(vi.mocked(controller.resizeByLocalDelta).mock.calls[1]![1]).toBeCloseTo(0.1)
  })
})
