import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Camera, Scene, WebGLRenderer } from 'three'

import type { EditorStore } from '../app/editor-store'
import type { RendererProfile } from './quality'

export interface RendererEvidenceSnapshot {
  readonly scene: Scene
  readonly camera: Camera
  readonly gl: WebGLRenderer
  readonly profile: RendererProfile
}

export interface RendererEvidenceApi {
  getSnapshot(): RendererEvidenceSnapshot
  getCounters(): {
    readonly storeNotifications: number
    readonly canonicalCommands: number
    readonly interactionBegins: number
    readonly interactionUpdates: number
    readonly history: {
      readonly undo: number
      readonly redo: number
    }
  }
  resetCounters(): void
}

type EvidencePhaseToken = number | null

interface EvidencePhaseProbe {
  startPhase(phase: string): EvidencePhaseToken
  endPhase(token: EvidencePhaseToken): void
}

declare global {
  interface Window {
    __apartmentRendererEvidence?: RendererEvidenceApi
    __apartmentEvidenceProbe?: EvidencePhaseProbe
    __apartmentResizeFineGrainedEvidence?: {
      kind: 'pointerdown' | 'commit'
      handlerToLayoutToken: number | null
      layoutToRenderToken: number | null
    }
  }
}

function startEvidencePhase(phase: string): EvidencePhaseToken {
  return window.__apartmentEvidenceProbe?.startPhase(phase) ?? null
}

function endEvidencePhase(token: EvidencePhaseToken): void {
  window.__apartmentEvidenceProbe?.endPhase(token)
}

function cleanupResizeFineGrainedEvidence(): void {
  const state = window.__apartmentResizeFineGrainedEvidence
  if (!state) return
  if (state.handlerToLayoutToken !== null) endEvidencePhase(state.handlerToLayoutToken)
  if (state.layoutToRenderToken !== null) endEvidencePhase(state.layoutToRenderToken)
  delete window.__apartmentResizeFineGrainedEvidence
}

export function RendererEvidenceBridge({
  profile,
  store,
}: {
  readonly profile: RendererProfile
  readonly store: EditorStore
}) {
  const { scene, camera, gl } = useThree()
  const profileRef = useRef(profile)
  profileRef.current = profile

  useEffect(() => {
    let storeNotifications = 0
    let canonicalCommands = 0
    let interactionBegins = 0
    let interactionUpdates = 0
    let historyUndo = 0
    let historyRedo = 0
    const unsubscribe = store.subscribe(() => {
      const phase = startEvidencePhase('store-notification')
      try {
        storeNotifications += 1
      } finally {
        endEvidencePhase(phase)
      }
    })
    const originalMethods = new Map<string, (...args: never[]) => unknown>()
    const instrumentMethod = (
      name:
        | 'beginInteraction'
        | 'updateInteractionTransform'
        | 'updateInteractionDimensions'
        | 'updateInteractionGeometry'
        | 'commitInteraction'
        | 'cancelInteraction'
        | 'undo'
        | 'redo',
      phaseName: string,
    ) => {
      const methods = store as unknown as Record<string, unknown>
      const original = methods[name]
      if (typeof original !== 'function') return
      const callable = original as (...args: never[]) => unknown
      originalMethods.set(name, callable)
      methods[name] = function (this: EditorStore, ...args: never[]) {
        const phase = startEvidencePhase(phaseName)
        try {
          const result = Reflect.apply(callable, this, args)
          if (name === 'beginInteraction' && result === true) interactionBegins += 1
          if (
            (name === 'updateInteractionTransform' ||
              name === 'updateInteractionDimensions' ||
              name === 'updateInteractionGeometry') &&
            result === true
          )
            interactionUpdates += 1
          if (name === 'commitInteraction' && result === true) {
            canonicalCommands += 1
            historyUndo += 1
            historyRedo = 0
          }
          if (name === 'undo' && result === true) {
            historyUndo = Math.max(0, historyUndo - 1)
            historyRedo += 1
          }
          if (name === 'redo' && result === true) {
            historyUndo += 1
            historyRedo = Math.max(0, historyRedo - 1)
          }
          return result
        } finally {
          endEvidencePhase(phase)
        }
      }
    }
    instrumentMethod('beginInteraction', 'canonical-interaction-begin')
    instrumentMethod('updateInteractionTransform', 'canonical-interaction-update')
    instrumentMethod('updateInteractionDimensions', 'canonical-interaction-update')
    instrumentMethod('updateInteractionGeometry', 'canonical-interaction-update')
    instrumentMethod('commitInteraction', 'canonical-commit-store-publication')
    instrumentMethod('cancelInteraction', 'cleanup')
    instrumentMethod('undo', 'history-undo')
    instrumentMethod('redo', 'history-redo')

    const originalRender = gl.render
    gl.render = function (this: WebGLRenderer, ...args: never[]) {
      const fineGrained = window.__apartmentResizeFineGrainedEvidence
      if (fineGrained && fineGrained.layoutToRenderToken !== null) {
        endEvidencePhase(fineGrained.layoutToRenderToken)
        fineGrained.layoutToRenderToken = null
        const firstRender = startEvidencePhase(`resize-${fineGrained.kind}-first-render`)
        try {
          return Reflect.apply(originalRender, this, args)
        } finally {
          endEvidencePhase(firstRender)
          cleanupResizeFineGrainedEvidence()
        }
      }
      const phase = startEvidencePhase('render')
      try {
        return Reflect.apply(originalRender, this, args)
      } finally {
        endEvidencePhase(phase)
      }
    } as typeof gl.render
    const bridge: RendererEvidenceApi = {
      getSnapshot: () => ({ scene, camera, gl, profile: profileRef.current }),
      getCounters: () => ({
        storeNotifications,
        canonicalCommands,
        interactionBegins,
        interactionUpdates,
        history: { undo: historyUndo, redo: historyRedo },
      }),
      resetCounters: () => {
        storeNotifications = 0
        canonicalCommands = 0
        interactionBegins = 0
        interactionUpdates = 0
        historyUndo = 0
        historyRedo = 0
      },
    }
    window.__apartmentRendererEvidence = bridge
    return () => {
      unsubscribe()
      for (const [name, original] of originalMethods) {
        ;(store as unknown as Record<string, unknown>)[name] = original
      }
      gl.render = originalRender
      cleanupResizeFineGrainedEvidence()
      if (window.__apartmentRendererEvidence === bridge)
        delete window.__apartmentRendererEvidence
    }
  }, [camera, gl, scene, store])

  return null
}
