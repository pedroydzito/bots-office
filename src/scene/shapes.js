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


function circleIntersect(a, b, pick) {
  const [x1, y1, r1] = a, [x2, y2, r2] = b
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy)
  const l = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - l * l))
  const mx = x1 + (dx * l) / d, my = y1 + (dy * l) / d
  const p1 = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2 = [mx - (h * dy) / d, my + (h * dx) / d]
  return pick(p1, p2)
}
const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0])

/** Smooth outline of a ring of overlapping circles (ordered counter-clockwise). */
function ringUnion(circles) {
  const n = circles.length
  const cx = circles.reduce((a, c) => a + c[0], 0) / n, cy = circles.reduce((a, c) => a + c[1], 0) / n
  const far = (p1, p2) => (Math.hypot(p1[0] - cx, p1[1] - cy) > Math.hypot(p2[0] - cx, p2[1] - cy) ? p1 : p2)
  const pts = circles.map((c, i) => circleIntersect(c, circles[(i + 1) % n], far))
  const s = new THREE.Shape()
  circles.forEach((c, i) => {
    const from = pts[(i - 1 + n) % n], to = pts[i]
    let a0 = ang(c, from), a1 = ang(c, to)
    while (a1 < a0) a1 += Math.PI * 2
    if (i === 0) s.moveTo(from[0], from[1])
    s.absarc(c[0], c[1], c[2], a0, a1, false)
  })
  s.closePath()
  return s
}

/** App-style cloud: flat bottom with rounded corners and three soft bumps. */
function cloudShape() {
  const R = [0.5, 0.36, 0.34], L = [-0.5, 0.36, 0.34], M = [0.02, 0.62, 0.46]
  const upper = (p1, p2) => (p1[1] > p2[1] ? p1 : p2)
  const pRM = circleIntersect(R, M, upper)
  const pML = circleIntersect(M, L, upper)
  const s = new THREE.Shape()
  s.moveTo(-0.5, 0.02)
  s.lineTo(0.5, 0.02)
  s.absarc(R[0], R[1], R[2], -Math.PI / 2, ang(R, pRM), false)
  s.absarc(M[0], M[1], M[2], ang(M, pRM), ang(M, pML), false)
  s.absarc(L[0], L[1], L[2], ang(L, pML), Math.PI * 1.5, false)
  s.closePath()
  return s
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
  cloud: () => puffy(cloudShape(), 1.6),
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
  // round pebble: a perfect circle from the front, gently flattened front-to-back
  pebble: () => {
    const g = new THREE.SphereGeometry(0.5, 48, 32)
    g.scale(1, 1, 0.78)
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
  clover: () => puffy(ringUnion([[0.27, 0, 0.3], [0, 0.27, 0.3], [-0.27, 0, 0.3], [0, -0.27, 0.3]]), 1.3),
  bubble: () => blobs([[0, 0.5, 0.42], [-0.3, 0.12, 0.12]], 0.82),
  flower: () => puffy(ringUnion(Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * 0.3, Math.sin((i / 6) * Math.PI * 2) * 0.3, 0.22])), 1.3),
  drop: () => lathe((t) => (t < 0.55 ? Math.sin(Math.acos(1 - t / 0.55)) * 0.42 : 0.42 * Math.pow(1 - (t - 0.55) / 0.45, 1.3) * Math.cos(((t - 0.55) / 0.45) * 0.6))),
  pill: () => new THREE.CapsuleGeometry(0.3, 0.38, 12, 32),
  triangle: () => puffy(roundedShape(polygon(3, 1), 0.28), 2),
  pentagon: () => puffy(roundedShape(polygon(5, 1), 0.22), 2),
  hexagon: () => puffy(roundedShape(polygon(6, 1), 0.2), 2),
  cone: () => lathe((t) => (t < 0.12 ? 0.44 * Math.sin((t / 0.12) * Math.PI / 2) : 0.44 * (1 - (t - 0.12) / 0.88) + 0.06 * Math.sin(((t - 0.12) / 0.88) * Math.PI))),
  trio: () => puffy(ringUnion([[0.24, -0.14, 0.27], [0, 0.27, 0.27], [-0.24, -0.14, 0.27]]), 1.3),
  // built from points without a repeated start/end point: absarc(0..2π) left a tiny flat seam on one side
  circle: () => puffy(new THREE.Shape(Array.from({ length: 96 }, (_, i) => new THREE.Vector2(Math.cos((i / 96) * Math.PI * 2), Math.sin((i / 96) * Math.PI * 2)))), 2.4),
  photo: () => puffy(new THREE.Shape().absarc(0, 0, 1, 0, Math.PI * 2, false), 2.4),
  rounded_square: () => puffy(roundedShape([[-1, -1], [1, -1], [1, 1], [-1, 1]], 0.38), 2),
}

// ---------------------------------------------------------------- Grok Bot shapes (exact names)
function superellipse(n = 4, a = 1, b = 1, steps = 64) {
  const pts = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t), sn = Math.sin(t)
    pts.push([a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)])
  }
  return pts
}
function arcPts(cx, cy, r, a0, a1, steps = 16) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })
}
function beanShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.9, 0.1)
  s.bezierCurveTo(-0.9, 0.75, -0.2, 0.85, 0.05, 0.55)
  s.bezierCurveTo(0.25, 0.35, 0.95, 0.75, 0.95, 0.05)
  s.bezierCurveTo(0.95, -0.7, 0.2, -0.75, 0, -0.7)
  s.bezierCurveTo(-0.4, -0.7, -0.9, -0.6, -0.9, 0.1)
  return s
}
const rot2 = (pts, a) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])

Object.assign(BUILDERS, {
  blob: () => BUILDERS.circle(),
  bean: () => puffy(beanShape(), 1.9),
  egg: () => lathe((t) => 0.46 * Math.sin(Math.acos(Math.max(-1, Math.min(1, 2 * t - 1)))) * (1 - 0.2 * t)),
  squircle: () => puffy(new THREE.Shape(superellipse(4.5).map(([x, y]) => new THREE.Vector2(x, y))), 2.2),
  tablet: () => puffy(roundedShape([[-0.62, -1], [0.62, -1], [0.62, 1], [-0.62, 1]], 0.34), 2),
  capsule: () => {
    const g = BUILDERS.pill()
    g.rotateZ(Math.PI / 2) // lying down, like the app
    return g
  },
  cylinder: () => lathe((t) => (t < 0.12 ? 0.4 * Math.sin((t / 0.12) * (Math.PI / 2)) : t > 0.88 ? 0.4 * Math.sin(((1 - t) / 0.12) * (Math.PI / 2)) : 0.4)),
  hex: () => BUILDERS.hexagon(),
  gem: () => puffy(roundedShape([[-0.6, 0.55], [0.6, 0.55], [1, 0.15], [0, -1], [-1, 0.15]], [0.12, 0.12, 0.12, 0.16, 0.12]), 2),
  crystal: () => puffy(roundedShape([[0, 1.25], [0.55, 0.6], [0.55, -0.6], [0, -1.25], [-0.55, -0.6], [-0.55, 0.6]], 0.12), 2),
  shield: () => puffy(roundedShape([[-0.8, 0.9], [0.8, 0.9], [0.8, 0.05], [0, -1], [-0.8, 0.05]], [0.25, 0.25, 0.5, 0.18, 0.5]), 2),
  dome: () => {
    const pts = [...arcPts(0, -0.4, 1, 0, Math.PI, 20)]
    return puffy(roundedShape(pts, pts.map((_, i) => (i === 0 || i === pts.length - 1 ? 0.22 : 0))), 2)
  },
  arch: () => {
    const pts = [[-0.7, -1], [0.7, -1], ...arcPts(0, 0.2, 0.7, 0, Math.PI, 16)]
    return puffy(roundedShape(pts, pts.map((_, i) => (i < 2 ? 0.18 : 0))), 2)
  },
  teardrop: () => BUILDERS.drop(),
  leaf: () => {
    const up = arcPts(0, -0.75, 1.25, Math.PI - 0.93, 0.93, 18).reverse()
    const dn = arcPts(0, 0.75, 1.25, -0.93, -Math.PI + 0.93, 18).reverse()
    const pts = rot2([...up, ...dn], Math.PI / 4)
    return puffy(roundedShape(pts, 0.04), 2)
  },
  square: () => BUILDERS.rounded_square(),
  sparkle: () => BUILDERS.star4(),
  house: () => puffy(roundedShape([[-0.8, -0.9], [0.8, -0.9], [0.8, 0.2], [0, 1], [-0.8, 0.2]], [0.18, 0.18, 0.14, 0.2, 0.14]), 2),
  star: () => puffy(roundedShape(star(5, 1, 0.48), 0.1), 2),
})

const EYE_Y = { egg: 0.5, tablet: 0.62, cylinder: 0.6, gem: 0.62, crystal: 0.55, shield: 0.6, dome: 0.38, arch: 0.6, leaf: 0.5, house: 0.45, star: 0.5, teardrop: 0.36, bean: 0.55,  cloud: 0.5, clover: 0.55, flower: 0.55, wedge: 0.4, heart: 0.58, drop: 0.36, cone: 0.32, triangle: 0.34, pill: 0.6, trio: 0.62, bubble: 0.62 }
const EYE_X = { teardrop: 0.11, crystal: 0.1, star: 0.11, gem: 0.12,  cloud: 0.15, wedge: 0.11, cone: 0.09, triangle: 0.1, trio: 0.08, drop: 0.11 }

function normalize(g, maxW = MAX_W) {
  g.computeBoundingBox()
  const b = g.boundingBox
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z
  const s = Math.min(TARGET_H / h, maxW / Math.max(w, d))
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
  const shape = BUILDERS[shapeName] ? shapeName : 'blob'
  if (cache.has(shape)) return cache.get(shape)
  const geometry = normalize(BUILDERS[shape](), shape === 'cloud' ? 1.02 : MAX_W)
  const bb = geometry.boundingBox
  const height = bb.max.y, width = bb.max.x - bb.min.x
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.updateMatrixWorld()

  const eyeY = (EYE_Y[shape] ?? 0.55) * height
  const eyeX = (EYE_X[shape] ?? 0.13) * Math.max(0.75, width / 0.8)
  // Grok style: the two eyes sit a little to the right of centre and slightly high
  const shift = width * 0.09
  const eyes = [-eyeX * 0.8 + shift, eyeX * 0.8 + shift].map((x) => {
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

  const blush = [-1, 1].map((sg) => {
    ray.set(new THREE.Vector3(sg * (eyeX + 0.1), eyeY - 0.08, 5), new THREE.Vector3(0, 0, -1))
    const h = ray.intersectObject(mesh)[0]
    if (!h) return null
    const nrm = h.face.normal.clone().lerp(Z, 0.3).normalize()
    return { position: h.point.clone().addScaledVector(nrm, 0.003).toArray(), quaternion: new THREE.Quaternion().setFromUnitVectors(Z, nrm).toArray() }
  }).filter(Boolean)
  const photoFace = shape === 'photo' ? { z: bb.max.z + 0.002, y: height / 2, r: width * 0.4 } : null
  const asset = { geometry, eyes, mouth, blush, top, height, width, depth: bb.max.z - bb.min.z, eyeY, photoFace }
  cache.set(shape, asset)
  return asset
}
