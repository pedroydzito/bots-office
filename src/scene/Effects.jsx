import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

// Desktop "high" look: soft ambient occlusion in corners/under furniture, a gentle glow on screens and
// lamps, and a light vignette. Skipped on phones and as soon as the device struggles.
export default function Effects({ night, overview }) {
  const gl = useThree((st) => st.gl)
  useEffect(() => {
    // the composer's ToneMapping effect replaces the renderer's (avoid applying it twice)
    const prev = gl.toneMapping
    gl.toneMapping = THREE.NoToneMapping
    return () => (gl.toneMapping = prev)
  }, [gl])
  return (
    <EffectComposer multisampling={4} disableNormalPass>
      {!overview && <N8AO halfRes aoRadius={1.1} intensity={night ? 1.6 : 2.2} distanceFalloff={0.8} quality="performance" />}
      <Bloom mipmapBlur levels={5} luminanceThreshold={night ? 0.75 : 1.0} luminanceSmoothing={0.2} intensity={night ? 0.7 : 0.15} />
      <Vignette offset={0.35} darkness={night ? 0.45 : 0.28} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

