import { describe, expect, it } from 'vitest'

import { getRendererProfile, previewTierForFrameWindow } from './quality'

describe('renderer quality profiles', () => {
  it('keeps editor and preview quality transient while providing distinct rendering profiles', () => {
    expect(getRendererProfile('edit')).toMatchObject({
      id: 'editor',
      showGrid: true,
      dpr: [1, 1.5],
      antialias: false,
    })
    expect(getRendererProfile('preview')).toMatchObject({
      id: 'preview',
      showGrid: false,
      dpr: [1, 2],
      antialias: true,
    })
  })

  it('degrades preview quality one way and preserves grounding until Safe', () => {
    expect(previewTierForFrameWindow('high', [40, 41, 42])).toBe('balanced')
    expect(previewTierForFrameWindow('balanced', [40, 41, 42])).toBe('safe')
    expect(previewTierForFrameWindow('safe', [40, 41, 42])).toBe('safe')
    expect(getRendererProfile('preview', 'balanced')).toMatchObject({
      qualityTier: 'balanced',
      dpr: [1, 1.5],
      contactGrounding: true,
    })
    expect(getRendererProfile('preview', 'safe')).toMatchObject({
      qualityTier: 'safe',
      contactGrounding: false,
    })
  })
})
