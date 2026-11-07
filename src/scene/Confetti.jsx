import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COLORS = ['#8F59F9', '#1E86FC', '#FD690F', '#E5484D', '#F93498', '#2FB36B', '#F5B70A']
const geo = new THREE.PlaneGeometry(0.06, 0.035)
const N = 36

export default function Confetti({ y = 1 }) {
  const ref = useRef()
  const start = useRef(null)
  const parts = useMemo(
    () =>
      Array.from({ length: N }, () => ({
        v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 1.8, (Math.random() - 0.5) * 2.4),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        c: new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]),
      })),
    [],
  )
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame(({ clock }) => {
    const inst = ref.current
    if (!inst) return
    if (start.current == null) {
      start.current = clock.elapsedTime
      parts.forEach((pt, i) => inst.setColorAt(i, pt.c))
      inst.instanceColor.needsUpdate = true
    }
    const t = clock.elapsedTime - start.current
    if (t > 2.2) {
      inst.visible = false
      return
    }
    parts.forEach((pt, i) => {
      p.set(pt.v.x * t, y + pt.v.y * t - 4.5 * t * t, pt.v.z * t)
      if (p.y < 0.02) p.y = 0.02
      e.set(pt.r.x * t * 3, pt.r.y * t * 3, pt.r.z * t * 3)
      q.setFromEuler(e)
      m.compose(p, q, one)
      inst.setMatrixAt(i, m)
    })
    inst.instanceMatrix.needsUpdate = true
    mat.opacity = Math.min(1, (2.2 - t) * 2)
  })

  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />
}
