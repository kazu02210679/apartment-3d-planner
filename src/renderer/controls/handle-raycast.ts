import type { Intersection } from 'three'

/** Places real resize-handle hits before other hits without changing hit data. */
export function prioritizeResizeHandleIntersections(
  intersections: readonly Intersection[],
): Intersection[] {
  const resizeHandleHits: Intersection[] = []
  const otherHits: Intersection[] = []

  for (const intersection of intersections) {
    if (intersection.object.userData.resizeHandle === true)
      resizeHandleHits.push(intersection)
    else otherHits.push(intersection)
  }

  return [...resizeHandleHits, ...otherHits]
}
