import type { RendererProfile } from './quality'

export function PreviewEnvironment({ profile }: { readonly profile: RendererProfile }) {
  const preview = profile.id === 'preview'
  return (
    <>
      <color attach="background" args={[profile.background]} />
      <hemisphereLight
        intensity={preview ? 0.8 : 0.55}
        color={preview ? '#d9e9ff' : '#b9d1ff'}
        groundColor="#182030"
      />
      <directionalLight
        castShadow
        intensity={preview ? 1.65 : 1.2}
        position={[4, 7, 4]}
        shadow-mapSize={[profile.shadowMapSize, profile.shadowMapSize]}
      />
      <directionalLight
        intensity={preview ? 0.65 : 0.4}
        position={[-4, 3, -2]}
        color="#7fc4ff"
      />
    </>
  )
}
