export type RendererMode = 'edit' | 'preview'
export type PreviewQualityTier = 'high' | 'balanced' | 'safe'

export interface RendererProfile {
  readonly id: 'editor' | 'preview'
  readonly qualityTier: 'edit' | PreviewQualityTier
  readonly dpr: [number, number]
  readonly antialias: boolean
  readonly showGrid: boolean
  readonly background: string
  readonly shadowMapSize: number
  readonly exposure: number
  readonly contactGrounding: boolean
}

const EDIT_PROFILE: RendererProfile = {
    id: 'editor',
    qualityTier: 'edit',
    dpr: [1, 1.5],
    antialias: false,
    showGrid: true,
    background: '#0d121d',
    shadowMapSize: 1024,
    exposure: 1,
    contactGrounding: false,
  }

const PREVIEW_PROFILES: Readonly<Record<PreviewQualityTier, RendererProfile>> = {
  high: {
    id: 'preview',
    qualityTier: 'high',
    dpr: [1, 2],
    antialias: true,
    showGrid: false,
    background: '#111923',
    shadowMapSize: 1536,
    exposure: 1.15,
    contactGrounding: true,
  },
  balanced: {
    id: 'preview',
    qualityTier: 'balanced',
    dpr: [1, 1.5],
    antialias: true,
    showGrid: false,
    background: '#111923',
    shadowMapSize: 1024,
    exposure: 1.1,
    contactGrounding: true,
  },
  safe: {
    id: 'preview',
    qualityTier: 'safe',
    dpr: [1, 1],
    antialias: false,
    showGrid: false,
    background: '#111923',
    shadowMapSize: 512,
    exposure: 1.05,
    contactGrounding: false,
  },
}

export function getRendererProfile(
  mode: RendererMode,
  tier: PreviewQualityTier = 'high',
): RendererProfile {
  return mode === 'edit' ? EDIT_PROFILE : PREVIEW_PROFILES[tier]
}

export function previewTierForFrameWindow(
  current: PreviewQualityTier,
  frameIntervals: readonly number[],
): PreviewQualityTier {
  if (current === 'safe' || frameIntervals.length === 0) return current
  const sorted = [...frameIntervals].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]! > 33.4
    ? current === 'high'
      ? 'balanced'
      : 'safe'
    : current
}

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
    return false
  }

  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
