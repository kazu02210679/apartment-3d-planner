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
