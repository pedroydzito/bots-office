import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

// Desktop "high" look: a gentle glow on screens and lamps and a light vignette. (Screen-space ambient
// occlusion was removed: it cost a lot and smeared into blotches when zooming in.) Skipped on phones and as soon as the device struggles.
export default function Effects({ night }) {
  const gl = useThree((st) => st.gl)
  useEffect(() => {
    // the composer's ToneMapping effect replaces the renderer's (avoid applying it twice)
    const prev = gl.toneMapping
    gl.toneMapping = THREE.NoToneMapping
    return () => (gl.toneMapping = prev)
  }, [gl])
  return (
    <EffectComposer multisampling={2} disableNormalPass>
      <Bloom mipmapBlur levels={5} luminanceThreshold={night ? 0.95 : 1.8} luminanceSmoothing={0.15} intensity={night ? 0.55 : 0.12} />
      <Vignette offset={0.35} darkness={night ? 0.45 : 0.28} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

