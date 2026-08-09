import type { RendererProfile } from './quality'
import { useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, NoToneMapping } from 'three'
import { useEffect } from 'react'

export function PreviewEnvironment({ profile }: { readonly profile: RendererProfile }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    gl.toneMapping = profile.id === 'preview' ? ACESFilmicToneMapping : NoToneMapping
    gl.toneMappingExposure = profile.exposure
  }, [gl, profile])
  const preview = profile.id === 'preview'
  return (
    <>
      <color attach="background" args={[profile.background]} />
      <hemisphereLight
        intensity={preview ? 0.95 : 0.55}
        color={preview ? '#d9e9ff' : '#b9d1ff'}
        groundColor="#30445a"
      />
      <directionalLight
        castShadow
        intensity={preview ? 1.35 : 1.2}
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
