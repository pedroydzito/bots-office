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
      if (Math.random() < 0.72) continue
      g.fillStyle = Math.random() < 0.2 ? '#9fd0ff' : '#ffd79a'
      g.fillRect(x, y, 4, 5)
    }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default function Sky({ nightness = 0, weather, desktop }) {
  const dome = useRef(), stars = useRef(), city = useRef(), dust = useRef(), win = useRef()
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
  const { cityMat, winMat, count, matrices } = useMemo(() => {
    const em = windowsTexture()
    const mat = new THREE.MeshBasicMaterial({ color: '#9aa6b8' })
    const wm = new THREE.MeshBasicMaterial({ map: em, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const m = []
    const o = new THREE.Object3D()
    let seed = 7
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 46; i++) {
      // an even ring all around, far away and low: a hint of a city, not a wall of buildings
      const a = (i / 46) * Math.PI * 2 + (rnd() - 0.5) * 0.12
      const r = 85 + rnd() * 30
      const w = 5 + rnd() * 7, h = 5 + rnd() * 16, d = 5 + rnd() * 7
      o.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r)
      o.rotation.y = rnd() * Math.PI
      o.scale.set(w, h, d)
      o.updateMatrix()
      m.push(o.matrix.clone())
    }
    return { cityMat: mat, winMat: wm, count: m.length, matrices: m }
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
    // hazy: the buildings take the horizon colour so they read as distant silhouettes
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
      <Clouds nightness={nightness} />
      <Birds nightness={nightness} />
      {desktop && <points ref={dust} geometry={dustGeo} material={dustMat} frustumCulled={false} />}
    </>
  )
}
const tmp = new THREE.Color()

// soft clouds drifting by during the day (a few flattened spheres in one instanced mesh)
const cloudGeo = new THREE.SphereGeometry(1, 12, 8)
const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false })
const CLOUDS = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2, r: 70 + (i % 3) * 12, y: 32 + (i % 4) * 5, s: 6 + (i % 3) * 3, speed: 0.004 + (i % 2) * 0.002 }))
export function Clouds({ nightness = 0 }) {
  const ref = useRef()
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    const im = ref.current
    if (!im) return
    cloudMat.opacity = 0.7 * (1 - nightness)
    im.visible = cloudMat.opacity > 0.02
    if (!im.visible) return
    const t = clock.elapsedTime
    CLOUDS.forEach((c, i) => {
      const a = c.a + t * c.speed
      for (let k = 0; k < 3; k++) {
        o.position.set(Math.cos(a) * c.r + k * c.s * 0.7, c.y + (k === 1 ? c.s * 0.25 : 0), Math.sin(a) * c.r)
        o.scale.set(c.s * (k === 1 ? 1.2 : 0.9), c.s * 0.45, c.s * 0.8)
        o.updateMatrix()
        im.setMatrixAt(i * 3 + k, o.matrix)
      }
    })
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[cloudGeo, cloudMat, CLOUDS.length * 3]} frustumCulled={false} />
}

// a small flock crossing the sky now and then (daytime)
const birdGeo = (() => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0.15, 0, 0, 0, 0, 0, 0, 0.12, 0.6, 0.15, 0, 0, 0, 0, 0, 0, 0.12], 3))
  return g
})()
const birdMat = new THREE.MeshBasicMaterial({ color: '#4a5568', side: THREE.DoubleSide })
export function Birds({ nightness = 0 }) {
  const ref = useRef()
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    const im = ref.current
    if (!im) return
    const t = clock.elapsedTime
    const cycle = (t % 90) / 22 // crosses for ~22 s every 90 s
    im.visible = nightness < 0.5 && cycle < 1
    if (!im.visible) return
    for (let i = 0; i < 7; i++) {
      const row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1
      o.position.set(-60 + cycle * 120 - row * 1.4, 26 + Math.sin(t * 0.7 + i) * 0.6, -40 + side * row * 1.2)
      o.rotation.set(0, Math.PI / 2, 0)
      const flap = Math.sin(t * 9 + i)
      o.scale.set(1.2, 1 + flap * 0.8, 1.2)
      o.updateMatrix()
      im.setMatrixAt(i, o.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[birdGeo, birdMat, 7]} frustumCulled={false} />
}
