const MILLIMETRES_PER_RENDERER_UNIT = 1000
const DEGREES_PER_CIRCLE = 360
const RADIANS_PER_CIRCLE = Math.PI * 2

function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite.`)
  }

  return value
}

export function millimetresToRendererUnits(millimetres: number): number {
  return assertFinite(millimetres, 'Millimetres') / MILLIMETRES_PER_RENDERER_UNIT
}

export function rendererUnitsToMillimetres(rendererUnits: number): number {
  return assertFinite(rendererUnits, 'Renderer units') * MILLIMETRES_PER_RENDERER_UNIT
}

export function degreesToRadians(degrees: number): number {
  return assertFinite(degrees, 'Degrees') * (RADIANS_PER_CIRCLE / DEGREES_PER_CIRCLE)
}

export function radiansToDegrees(radians: number): number {
  return assertFinite(radians, 'Radians') * (DEGREES_PER_CIRCLE / RADIANS_PER_CIRCLE)
}

export const millimetersToRendererUnits = millimetresToRendererUnits
export const rendererUnitsToMillimeters = rendererUnitsToMillimetres
export const millimetresToMeters = millimetresToRendererUnits
export const millimetersToMeters = millimetresToRendererUnits
export const metersToMillimetres = rendererUnitsToMillimetres
export const metersToMillimeters = rendererUnitsToMillimetres
