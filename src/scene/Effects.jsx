import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

/**
 * Highest graphics: contact shadows (AO), soft bloom on bright things, vignette. The effect chain
 * works in linear HDR, so tone mapping happens once, at its end (the renderer's own is switched
 * off while this is mounted; otherwise colours come out washed or blown out).
 */
export default function Effects({ night }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const prev = gl.toneMapping
    gl.toneMapping = THREE.NoToneMapping
    return () => (gl.toneMapping = prev)
  }, [gl])
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <Bloom mipmapBlur intensity={night ? 0.7 : 0.25} luminanceThreshold={night ? 0.9 : 1.4} luminanceSmoothing={0.3} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.35} darkness={0.35} />
    </EffectComposer>
  )
}
