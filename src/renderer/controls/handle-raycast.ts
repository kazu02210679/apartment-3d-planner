import { Mesh, type Intersection, type Raycaster } from 'three'

const HANDLE_RAYCAST_PRIORITY_DISTANCE = -1

/** Prioritizes real handle hits without fabricating intersections. */
export function raycastHandleFirst(
  this: Mesh,
  raycaster: Raycaster,
  intersections: Intersection[],
): void {
  const firstHandleIntersection = intersections.length
  Mesh.prototype.raycast.call(this, raycaster, intersections)
  for (let index = firstHandleIntersection; index < intersections.length; index += 1) {
    intersections[index]!.distance = HANDLE_RAYCAST_PRIORITY_DISTANCE
  }
}
