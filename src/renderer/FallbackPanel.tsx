export function FallbackPanel() {
  return (
    <section className="renderer-fallback" role="status" aria-live="polite">
      <strong>3D rendering is unavailable</strong>
      <p>Exact numeric editing remains available.</p>
      <p>Your scene, outliner, and inspector remain fully usable.</p>
    </section>
  )
}
