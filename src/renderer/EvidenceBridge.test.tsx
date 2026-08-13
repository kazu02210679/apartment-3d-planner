import { render } from '@testing-library/react'
import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

const rendererState = vi.hoisted(() => ({
  scene: { name: 'evidence-scene' },
  camera: { name: 'evidence-camera' },
  gl: {
    name: 'evidence-renderer',
    render: (...args: unknown[]) => {
      void args
    },
  },
}))

vi.mock('@react-three/fiber', () => ({
  useThree: () => rendererState,
}))

import { getRendererProfile } from './quality'
import { RendererEvidenceBridge } from './EvidenceBridge'

describe('RendererEvidenceBridge', () => {
  it('exposes public renderer state only while the evidence bridge is mounted', () => {
    expect(window.__apartmentRendererEvidence).toBeUndefined()

    let scene = { id: 'scene-a' }
    let publish: () => void = () => undefined
    const unsubscribe = vi.fn()
    const store = {
      getSnapshot: () => ({ scene }),
      subscribe: vi.fn((listener: () => void) => {
        publish = listener
        return unsubscribe
      }),
      beginInteraction: vi.fn((kind: string) => Boolean(kind)),
      updateInteractionTransform: vi.fn(() => true),
      updateInteractionDimensions: vi.fn(() => true),
      updateInteractionGeometry: vi.fn(() => true),
      commitInteraction: vi.fn(() => true),
      cancelInteraction: vi.fn(() => true),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
    }
    const forcePreviewTier = vi.fn()
    const orbitTargetRef = { current: new Vector3(0.2, 0.8, -0.4) }
    const profile = getRendererProfile('edit')
    const rendered = render(
      <RendererEvidenceBridge
        profile={profile}
        store={store as never}
        onForcePreviewTier={forcePreviewTier}
        orbitTargetRef={orbitTargetRef}
      />,
    )

    expect(window.__apartmentRendererEvidence?.getSnapshot()).toEqual({
      ...rendererState,
      profile,
      orbitTarget: [0.2, 0.8, -0.4],
    })
    orbitTargetRef.current.set(0.4, 0.9, -0.6)
    expect(window.__apartmentRendererEvidence?.getSnapshot().orbitTarget).toEqual([
      0.4, 0.9, -0.6,
    ])
    publish()
    scene = { id: 'scene-b' }
    publish()
    expect(window.__apartmentRendererEvidence?.getCounters()).toEqual({
      storeNotifications: 2,
      canonicalCommands: 0,
      interactionBegins: 0,
      interactionUpdates: 0,
      history: { undo: 0, redo: 0 },
    })
    expect(window.__apartmentRendererEvidence?.getCounters()).not.toHaveProperty(
      'sceneIdentityPublications',
    )
    const bridge = window.__apartmentRendererEvidence
    const previewProfile = getRendererProfile('preview', 'balanced')
    rendered.rerender(
      <RendererEvidenceBridge
        profile={previewProfile}
        store={store as never}
        onForcePreviewTier={forcePreviewTier}
        orbitTargetRef={orbitTargetRef}
      />,
    )
    expect(window.__apartmentRendererEvidence).toBe(bridge)
    expect(window.__apartmentRendererEvidence?.getSnapshot().profile).toBe(previewProfile)
    window.__apartmentRendererEvidence?.forcePreviewTier('safe')
    expect(forcePreviewTier).toHaveBeenCalledWith('safe')
    expect(window.__apartmentRendererEvidence?.getCounters()).toEqual({
      storeNotifications: 2,
      canonicalCommands: 0,
      interactionBegins: 0,
      interactionUpdates: 0,
      history: { undo: 0, redo: 0 },
    })
    expect(store.subscribe).toHaveBeenCalledOnce()
    window.__apartmentRendererEvidence?.resetCounters()
    expect(window.__apartmentRendererEvidence?.getCounters()).toEqual({
      storeNotifications: 0,
      canonicalCommands: 0,
      interactionBegins: 0,
      interactionUpdates: 0,
      history: { undo: 0, redo: 0 },
    })

    rendered.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(window.__apartmentRendererEvidence).toBeUndefined()
  })

  it('wraps interaction, history, and renderer phases only through the evidence bridge', () => {
    const phases: string[] = []
    let nextToken = 0
    const evidenceWindow = window as typeof window & {
      __apartmentEvidenceProbe?: {
        startPhase: (phase: string) => number | null
        endPhase: (token: number) => void
      }
    }
    evidenceWindow.__apartmentEvidenceProbe = {
      startPhase: (phase) => {
        phases.push(`start:${phase}`)
        return ++nextToken
      },
      endPhase: (token) => phases.push(`end:${token}`),
    }
    const unsubscribe = vi.fn()
    const store = {
      getSnapshot: () => ({ scene: {} }),
      subscribe: vi.fn(() => unsubscribe),
      beginInteraction: vi.fn((kind: string) => Boolean(kind)),
      updateInteractionTransform: vi.fn(() => true),
      updateInteractionDimensions: vi.fn(() => true),
      updateInteractionGeometry: vi.fn(() => true),
      commitInteraction: vi.fn(() => true),
      cancelInteraction: vi.fn(() => true),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
    }
    const rendered = render(
      <RendererEvidenceBridge
        profile={getRendererProfile('edit')}
        store={store as never}
        onForcePreviewTier={vi.fn()}
      />,
    )

    store.beginInteraction('move')
    store.updateInteractionDimensions()
    store.commitInteraction()
    store.undo()
    store.redo()
    rendererState.gl.render({}, {})

    expect(phases).toEqual([
      'start:canonical-interaction-begin',
      'end:1',
      'start:canonical-interaction-update',
      'end:2',
      'start:canonical-commit-store-publication',
      'end:3',
      'start:history-undo',
      'end:4',
      'start:history-redo',
      'end:5',
      'start:render',
      'end:6',
    ])
    expect(window.__apartmentRendererEvidence?.getCounters()).toEqual({
      storeNotifications: 0,
      canonicalCommands: 1,
      interactionBegins: 1,
      interactionUpdates: 1,
      history: { undo: 1, redo: 0 },
    })

    rendered.unmount()
    delete evidenceWindow.__apartmentEvidenceProbe
  })

  it('closes the one-shot layout boundary around the first renderer call', () => {
    const phases: string[] = []
    let nextToken = 40
    const evidenceWindow = window as typeof window & {
      __apartmentEvidenceProbe?: {
        startPhase: (phase: string) => number | null
        endPhase: (token: number | null) => void
      }
      __apartmentResizeFineGrainedEvidence?: {
        kind: 'pointerdown' | 'commit'
        handlerToLayoutToken: number | null
        layoutToRenderToken: number | null
      }
    }
    evidenceWindow.__apartmentEvidenceProbe = {
      startPhase: (phase) => {
        phases.push(`start:${phase}`)
        return ++nextToken
      },
      endPhase: (token) => phases.push(`end:${token}`),
    }
    evidenceWindow.__apartmentResizeFineGrainedEvidence = {
      kind: 'commit',
      handlerToLayoutToken: null,
      layoutToRenderToken: 40,
    }
    const store = {
      getSnapshot: () => ({ scene: {} }),
      subscribe: vi.fn(() => () => undefined),
      beginInteraction: vi.fn(),
      updateInteractionTransform: vi.fn(),
      updateInteractionDimensions: vi.fn(),
      updateInteractionGeometry: vi.fn(),
      commitInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
    }
    const rendered = render(
      <RendererEvidenceBridge
        profile={getRendererProfile('edit')}
        store={store as never}
        onForcePreviewTier={vi.fn()}
      />,
    )

    rendererState.gl.render({}, {})
    rendererState.gl.render({}, {})

    expect(phases).toEqual([
      'end:40',
      'start:resize-commit-first-render',
      'end:41',
      'start:render',
      'end:42',
    ])
    expect(evidenceWindow.__apartmentResizeFineGrainedEvidence).toBeUndefined()
    rendered.unmount()
    delete evidenceWindow.__apartmentEvidenceProbe
  })

  it('closes pending fine-grained tokens when the evidence bridge unmounts', () => {
    const ended: Array<number | null> = []
    window.__apartmentEvidenceProbe = {
      startPhase: () => null,
      endPhase: (token) => ended.push(token),
    }
    window.__apartmentResizeFineGrainedEvidence = {
      kind: 'pointerdown',
      handlerToLayoutToken: 70,
      layoutToRenderToken: 71,
    }
    const store = {
      getSnapshot: () => ({ scene: {} }),
      subscribe: vi.fn(() => () => undefined),
      beginInteraction: vi.fn(),
      updateInteractionTransform: vi.fn(),
      updateInteractionDimensions: vi.fn(),
      updateInteractionGeometry: vi.fn(),
      commitInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
    }
    const rendered = render(
      <RendererEvidenceBridge
        profile={getRendererProfile('edit')}
        store={store as never}
        onForcePreviewTier={vi.fn()}
      />,
    )

    rendered.unmount()

    expect(ended).toEqual([70, 71])
    expect(window.__apartmentResizeFineGrainedEvidence).toBeUndefined()
    delete window.__apartmentEvidenceProbe
  })
})
