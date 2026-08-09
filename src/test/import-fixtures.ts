import { createFutureWorkstationScene } from '../domain/templates/future-workstation'

export function hostileButInertFixture(): string {
  const scene = createFutureWorkstationScene({
    idFactory: (() => {
      let index = 0
      return () => `hostile-${++index}`
    })(),
    now: () => '2026-08-06T00:00:00.000Z',
  })
  scene.metadata.description =
    '<script>window.__executed = true</script> https://example.invalid'
  scene.metadata.extensions = {
    note: '<img src=https://example.invalid/never-load.png>',
  }
  return JSON.stringify(scene)
}
