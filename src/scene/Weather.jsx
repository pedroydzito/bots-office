import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Rain / snow around the camera target, and lightning flashes for storms.
// One instanced mesh, cheap; fewer drops on low quality.
const dummy = new THREE.Object3D()

export default function Weather({ kind, low }) {
  const controls = useThree((s) => s.controls)
  const ref = useRef()
  const flash = useRef()
  const raining = kind === 'rain' || kind === 'storm'
  const snowing = kind === 'snow'
  const N = low ? 260 : 700
  const drops = useMemo(
    () => Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 36, y: Math.random() * 22, z: (Math.random() - 0.5) * 36, s: 0.6 + Math.random() * 0.6, p: Math.random() * 10 })),
    [N],
  )
  const geo = useMemo(() => (snowing ? new THREE.SphereGeometry(0.045, 6, 4) : new THREE.BoxGeometry(0.012, 0.42, 0.012)), [snowing])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: snowing ? '#ffffff' : '#a9c4e6', transparent: true, opacity: snowing ? 0.9 : 0.55, depthWrite: false }),
    [snowing],
  )
  const nextFlash = useRef(3)
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const inst = ref.current
    if (!inst || !controls) return
    const c = controls.target
    const speed = snowing ? 1.1 : 14
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]
      d.y -= speed * d.s * dt
      if (d.y < -1) d.y += 22
      const sway = snowing ? Math.sin(clock.elapsedTime * 0.8 + d.p) * 0.5 : 0
      dummy.position.set(c.x + d.x + sway, c.y - 6 + d.y, c.z + d.z)
      dummy.rotation.set(0, 0, snowing ? 0 : 0.12)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true
    if (flash.current) {
      const t = clock.elapsedTime
      if (kind === 'storm' && t > nextFlash.current + 0.35) nextFlash.current = t + 5 + Math.random() * 9
      const since = t - nextFlash.current
      const on = kind === 'storm' && since > 0 && (since < 0.1 || (since > 0.18 && since < 0.26))
      flash.current.intensity = on ? 3 : 0
    }
  })
  if (!raining && !snowing) return null
  return (
    <>
      <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />
      <ambientLight ref={flash} intensity={0} color="#dfe8ff" />
    </>
  )
}
