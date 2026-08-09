export type RendererMode = 'edit' | 'preview'

export interface RendererProfile {
  readonly id: 'editor' | 'preview'
  readonly dpr: [number, number]
  readonly antialias: boolean
  readonly showGrid: boolean
  readonly background: string
  readonly shadowMapSize: number
  readonly exposure: number
}

const PROFILES: Readonly<Record<RendererMode, RendererProfile>> = {
  edit: {
    id: 'editor',
    dpr: [1, 1.5],
    antialias: false,
    showGrid: true,
    background: '#0d121d',
    shadowMapSize: 1024,
    exposure: 1,
  },
  preview: {
    id: 'preview',
    dpr: [1, 2],
    antialias: true,
    showGrid: false,
    background: '#111923',
    shadowMapSize: 1536,
    exposure: 1.15,
  },
}

export function getRendererProfile(mode: RendererMode): RendererProfile {
  return PROFILES[mode]
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
