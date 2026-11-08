import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Sky + city around the office: a gradient dome with stars at night, a skyline whose windows
// light up after dark, and (desktop) dust motes drifting in the light. A handful of draw calls.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#bcd3f0') }, mid: { value: new THREE.Color('#e9eef5') }, bottom: { value: new THREE.Color('#eceef2') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader:
    'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, bottom, smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(c, 1.0); }',
})
const skyGeo = new THREE.SphereGeometry(140, 32, 16)

const C = (h) => new THREE.Color(h)
const DAY = { top: C('#8fb8ec'), mid: C('#dde8f5'), bottom: C('#eceef2') }
const DUSK = { top: C('#6f7fc0'), mid: C('#f6c9a4'), bottom: C('#efd9c8') }
const NIGHT = { top: C('#050914'), mid: C('#121a33'), bottom: C('#0c1120') }
const GREY = { top: C('#aab3c0'), mid: C('#d5d9e0'), bottom: C('#dadde3') }

function windowsTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, 0, 64, 128)
  for (let y = 4; y < 124; y += 8)
    for (let x = 4; x < 60; x += 8) {
      if (Math.random() < 0.42) continue
      g.fillStyle = Math.random() < 0.2 ? '#9fd0ff' : '#ffd79a'
      g.fillRect(x, y, 4, 5)
    }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default function Sky({ nightness = 0, weather, desktop }) {
  const dome = useRef(), stars = useRef(), city = useRef(), dust = useRef()
  const k = useRef(nightness)
  const starGeo = useMemo(() => {
    const p = []
    for (let i = 0; i < 500; i++) {
      const u = Math.random() * Math.PI * 2, v = 0.08 + Math.random() * 0.9
      const r = 130
      p.push(Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }, [])
  const starMat = useMemo(() => new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }), [])
  // skyline: instanced boxes in a ring behind the office (away from the camera side)
  const { cityMat, count, matrices } = useMemo(() => {
    const em = windowsTexture()
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa6b8', roughness: 0.9, emissive: '#ffffff', emissiveMap: em, emissiveIntensity: 0 })
    const m = []
    const o = new THREE.Object3D()
    let seed = 7
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI * 0.25 + (rnd() - 0.5) * Math.PI * 1.25 + Math.PI // behind: -x / -z
      const r = 55 + rnd() * 35
      const w = 4 + rnd() * 6, h = 8 + rnd() * 30, d = 4 + rnd() * 6
      o.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r)
      o.rotation.y = rnd() * Math.PI
      o.scale.set(w, h, d)
      o.updateMatrix()
      m.push(o.matrix.clone())
    }
    return { cityMat: mat, count: m.length, matrices: m }
  }, [])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  // dust motes floating in the light (desktop)
  const dustGeo = useMemo(() => {
    const p = []
    for (let i = 0; i < 140; i++) p.push((Math.random() - 0.5) * 14, Math.random() * 3, (Math.random() - 0.5) * 12)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }, [])
  const dustMat = useMemo(() => new THREE.PointsMaterial({ color: '#fff6e0', size: 0.035, transparent: true, opacity: 0.5, depthWrite: false }), [])

  useFrame(({ camera, clock, controls }, dt) => {
    k.current += (nightness - k.current) * Math.min(1, dt * 2.5)
    const n = k.current
    const warm = Math.max(0, 1 - Math.abs(n * 2 - 1) * 1.6)
    const grey = weather === 'rain' || weather === 'storm' || weather === 'cloudy' || weather === 'snow' ? 0.7 * (1 - n) : 0
    const u = skyMat.uniforms
    for (const key of ['top', 'mid', 'bottom']) u[key].value.copy(DAY[key]).lerp(DUSK[key], warm * 0.75).lerp(GREY[key], grey).lerp(NIGHT[key], n)
    if (dome.current) dome.current.position.copy(camera.position)
    if (stars.current) {
      stars.current.position.copy(camera.position)
      starMat.opacity = Math.max(0, n - 0.4) * 1.4 * (1 - grey)
      stars.current.visible = starMat.opacity > 0.01
    }
    cityMat.emissiveIntensity = n * 1.4
    cityMat.color.set('#9aa6b8').lerp(tmp.set('#1a2236'), n)
    if (dust.current) {
      const t = clock.elapsedTime
      const tg = controls?.target
      if (tg) dust.current.position.set(tg.x, tg.y - 1, tg.z)
      dust.current.rotation.y = t * 0.01
      dust.current.position.y += Math.sin(t * 0.3) * 0.1
      dustMat.opacity = 0.45 * (1 - n * 0.6)
    }
  })
  return (
    <>
      <mesh ref={dome} geometry={skyGeo} material={skyMat} renderOrder={-10} frustumCulled={false} />
      <points ref={stars} geometry={starGeo} material={starMat} frustumCulled={false} renderOrder={-9} />
      <instancedMesh
        ref={(im) => {
          city.current = im
          if (im && !im.userData.done) {
            matrices.forEach((m, i) => im.setMatrixAt(i, m))
            im.instanceMatrix.needsUpdate = true
            im.userData.done = true
          }
        }}
        args={[boxGeo, cityMat, count]}
        frustumCulled={false}
      />
      {desktop && <points ref={dust} geometry={dustGeo} material={dustMat} frustumCulled={false} />}
    </>
  )
}
const tmp = new THREE.Color()
