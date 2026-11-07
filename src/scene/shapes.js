// Procedural bot bodies matching the Grok Bot app avatar shapes.
// Every geometry is normalised: base at y=0, centred on x/z, front = +z.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const TARGET_H = 0.82
const MAX_W = 0.86

function roundedShape(pts, r) {
  const s = new THREE.Shape()
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n]
    const rad = Array.isArray(r) ? r[i] : r
    const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1])
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const rr = Math.min(rad, d1 / 2, d2 / 2)
    const a = [p1[0] + ((p0[0] - p1[0]) / d1) * rr, p1[1] + ((p0[1] - p1[1]) / d1) * rr]
    const b = [p1[0] + ((p2[0] - p1[0]) / d2) * rr, p1[1] + ((p2[1] - p1[1]) / d2) * rr]
    if (i === 0) s.moveTo(a[0], a[1])
    else s.lineTo(a[0], a[1])
    if (rr > 0) s.quadraticCurveTo(p1[0], p1[1], b[0], b[1])
  }
  s.closePath()
  return s
}

function polygon(n, r = 1, rot = Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

function star(points, outer, inner) {
  const pts = []
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i / (points * 2)) * Math.PI * 2
    const r = i % 2 ? inner : outer
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

function puffy(shape, size = 2) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: size * 0.16,
    bevelEnabled: true,
    bevelThickness: size * 0.15,
    bevelSize: size * 0.07,
    bevelSegments: 8,
    curveSegments: 28,
  })
  g.center()
  return g
}

function blobs(list, zScale = 0.8) {
  const geos = list.map(([x, y, r]) => {
    const g = new THREE.SphereGeometry(r, 36, 24)
    g.scale(1, 1, zScale)
    g.translate(x, y, 0)
    return g
  })
  return mergeGeometries(geos)
}

function lathe(fn, steps = 40) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push(new THREE.Vector2(Math.max(0.0001, fn(t)), t))
  }
  return new THREE.LatheGeometry(pts, 48)
}

function heartShape() {
  const s = new THREE.Shape()
  s.moveTo(5, 5)
  s.bezierCurveTo(5, 5, 4, 0, 0, 0)
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7)
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19)
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7)
  s.bezierCurveTo(16, 7, 16, 0, 10, 0)
  s.bezierCurveTo(7, 0, 5, 5, 5, 5)
  return s
}

const BUILDERS = {
  cloud: () =>
    blobs([
      [0, 0.36, 0.36], [-0.3, 0.27, 0.26], [0.3, 0.27, 0.26],
      [-0.15, 0.6, 0.27], [0.17, 0.63, 0.25], [0, 0.2, 0.3],
    ], 0.78),
  wedge: () => {
    const pts = []
    const R = 1.15, half = (40 * Math.PI) / 180
    pts.push([0, 1.05])
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 - half + (i / 10) * half * 2
      pts.push([Math.cos(a) * R, 1.05 + Math.sin(a) * R])
    }
    const radii = pts.map((_, i) => (i === 0 ? 0.2 : i === 1 || i === pts.length - 1 ? 0.22 : 0))
    const g = puffy(roundedShape(pts, radii), 1.4)
    return g
  },
  pebble: () => {
    const g = new THREE.SphereGeometry(0.5, 48, 32)
    g.scale(1, 1.08, 0.8)
    g.rotateZ(0.08)
    return g
  },
  heart: () => {
    const g = puffy(heartShape(), 22)
    g.rotateZ(Math.PI)
    return g
  },
  sphere: () => new THREE.SphereGeometry(0.5, 48, 32),
  star4: () => puffy(roundedShape(star(4, 1, 0.45), 0.12), 2),
  star6: () => puffy(roundedShape(star(6, 1, 0.62), 0.1), 2),
  clover: () => blobs([[0, 0.72, 0.25], [-0.25, 0.47, 0.25], [0.25, 0.47, 0.25], [0, 0.24, 0.25], [0, 0.47, 0.22]], 0.6),
  bubble: () => blobs([[0, 0.5, 0.42], [-0.3, 0.12, 0.12]], 0.82),
  flower: () => {
    const l = [[0, 0.5, 0.2]]
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      l.push([Math.cos(a) * 0.26, 0.5 + Math.sin(a) * 0.26, 0.17])
    }
    return blobs(l, 0.6)
  },
  drop: () => lathe((t) => (t < 0.55 ? Math.sin(Math.acos(1 - t / 0.55)) * 0.42 : 0.42 * Math.pow(1 - (t - 0.55) / 0.45, 1.3) * Math.cos(((t - 0.55) / 0.45) * 0.6))),
  pill: () => new THREE.CapsuleGeometry(0.3, 0.38, 12, 32),
  triangle: () => puffy(roundedShape(polygon(3, 1), 0.28), 2),
  pentagon: () => puffy(roundedShape(polygon(5, 1), 0.22), 2),
  hexagon: () => puffy(roundedShape(polygon(6, 1), 0.2), 2),
  cone: () => lathe((t) => (t < 0.12 ? 0.44 * Math.sin((t / 0.12) * Math.PI / 2) : 0.44 * (1 - (t - 0.12) / 0.88) + 0.06 * Math.sin(((t - 0.12) / 0.88) * Math.PI))),
  trio: () => blobs([[-0.2, 0.2, 0.2], [0.2, 0.2, 0.2], [0, 0.52, 0.22]], 0.85),
  rounded_square: () => puffy(roundedShape([[-1, -1], [1, -1], [1, 1], [-1, 1]], 0.38), 2),
}

const EYE_Y = { wedge: 0.4, heart: 0.58, drop: 0.36, cone: 0.32, triangle: 0.34, pill: 0.6, trio: 0.62, bubble: 0.62 }
const EYE_X = { wedge: 0.11, cone: 0.09, triangle: 0.1, trio: 0.08, drop: 0.11 }

function normalize(g) {
  g.computeBoundingBox()
  const b = g.boundingBox
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z
  const s = Math.min(TARGET_H / h, MAX_W / Math.max(w, d))
  g.scale(s, s, s)
  g.computeBoundingBox()
  const c = g.boundingBox
  g.translate(-(c.min.x + c.max.x) / 2, -c.min.y, -(c.min.z + c.max.z) / 2)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

const cache = new Map()
const ray = new THREE.Raycaster()
const Z = new THREE.Vector3(0, 0, 1)

export function getBotAsset(shapeName) {
  const shape = BUILDERS[shapeName] ? shapeName : 'cloud'
  if (cache.has(shape)) return cache.get(shape)
  const geometry = normalize(BUILDERS[shape]())
  const bb = geometry.boundingBox
  const height = bb.max.y, width = bb.max.x - bb.min.x
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.updateMatrixWorld()

  const eyeY = (EYE_Y[shape] ?? 0.55) * height
  const eyeX = (EYE_X[shape] ?? 0.13) * Math.max(0.75, width / 0.8)
  const eyes = [-eyeX, eyeX].map((x) => {
    ray.set(new THREE.Vector3(x, eyeY, 5), new THREE.Vector3(0, 0, -1))
    const hit = ray.intersectObject(mesh)[0]
    const point = hit ? hit.point.clone() : new THREE.Vector3(x, eyeY, bb.max.z)
    const normal = hit && hit.face ? hit.face.normal.clone().normalize() : Z.clone()
    // keep eyes looking mostly forward on curved shapes
    normal.lerp(Z, 0.35).normalize()
    const quat = new THREE.Quaternion().setFromUnitVectors(Z, normal)
    return { position: point.addScaledVector(normal, 0.004).toArray(), quaternion: quat.toArray() }
  })

  ray.set(new THREE.Vector3(0, 5, 0.02), new THREE.Vector3(0, -1, 0))
  const topHit = ray.intersectObject(mesh)[0]
  const top = topHit ? topHit.point.y : height

  // mouth: a little smile under the eyes
  ray.set(new THREE.Vector3(0, eyeY - 0.11, 5), new THREE.Vector3(0, 0, -1))
  const mHit = ray.intersectObject(mesh)[0]
  const mouth = mHit
    ? { position: mHit.point.clone().addScaledVector(mHit.face.normal, 0.004).toArray(), quaternion: new THREE.Quaternion().setFromUnitVectors(Z, mHit.face.normal.clone().lerp(Z, 0.35).normalize()).toArray() }
    : null

  const asset = { geometry, eyes, mouth, top, height, width, depth: bb.max.z - bb.min.z, eyeY }
  cache.set(shape, asset)
  return asset
}
