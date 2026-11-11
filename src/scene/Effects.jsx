import { Bloom, EffectComposer, HueSaturation, N8AO, Vignette } from '@react-three/postprocessing'

/**
 * The "storybook" finish (highest graphics only): soft bloom on bright things (screens, lamps,
 * sunlight), a little extra colour and a gentle vignette. One merged effect pass at reduced cost:
 * bloom works on a mip chain at a fraction of the screen size.
 */
export default function Effects({ night }) {
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      {/* contact shadows where things meet: furniture on the floor, walls in the corners, bots on chairs */}
      <N8AO halfRes quality="performance" aoRadius={0.9} distanceFalloff={1.2} intensity={2.4} color="#1b2236" />
      <Bloom mipmapBlur intensity={night ? 0.8 : 0.35} luminanceThreshold={night ? 0.9 : 1.6} luminanceSmoothing={0.3} radius={0.65} />
      <HueSaturation saturation={0.06} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  )
}
