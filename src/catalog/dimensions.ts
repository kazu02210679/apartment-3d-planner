import type { Dimensions } from '../domain/schema'

export const MILLIMETRES_PER_INCH = 25.4

export function calculateSixteenByNinePanelDimensions(
  diagonalInches: number,
): Pick<Dimensions, 'width' | 'height'> {
  const diagonalMillimetres = diagonalInches * MILLIMETRES_PER_INCH
  const ratioLength = Math.sqrt(16 ** 2 + 9 ** 2)

  return {
    width: Math.round((diagonalMillimetres * 16) / ratioLength),
    height: Math.round((diagonalMillimetres * 9) / ratioLength),
  }
}
