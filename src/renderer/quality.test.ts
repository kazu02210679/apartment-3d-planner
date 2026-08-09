import { describe, expect, it } from 'vitest'

import { getRendererProfile } from './quality'

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
})
