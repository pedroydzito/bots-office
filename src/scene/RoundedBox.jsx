import { forwardRef } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import { toCreasedNormals } from 'three-stdlib'

// Same geometry as drei's <RoundedBox>, but built once per size and shared. drei builds an
// ExtrudeGeometry and runs toCreasedNormals for every instance, and the office has hundreds of
// identical desks, shelves and sofas: that alone was about a second of the first load.
const eps = 0.00001
const cache = new Map()

function createShape(width, height, radius0) {
  const shape = new Shape()
  const radius = radius0 - eps
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true)
  shape.absarc(eps, height - radius * 2, eps, Math.PI, Math.PI / 2, true)
  shape.absarc(width - radius * 2, height - radius * 2, eps, Math.PI / 2, 0, true)
  shape.absarc(width - radius * 2, eps, eps, 0, -Math.PI / 2, true)
  return shape
}

export function roundedBoxGeometry(width = 1, height = 1, depth = 1, radius = 0.05, steps = 1, smoothness = 4, bevelSegments = 4, creaseAngle = 0.4) {
  const key = [width, height, depth, radius, steps, smoothness, bevelSegments, creaseAngle].join('|')
  let g = cache.get(key)
  if (!g) {
    g = new ExtrudeGeometry(createShape(width, height, radius), {
      depth: depth - radius * 2,
      bevelEnabled: true,
      bevelSegments: bevelSegments * 2,
      steps,
      bevelSize: radius - eps,
      bevelThickness: radius,
      curveSegments: smoothness,
    })
    g.center()
    g = toCreasedNormals(g, creaseAngle)
    g.computeBoundingSphere()
    cache.set(key, g)
  }
  return g
}

export const RoundedBox = forwardRef(function RoundedBox(
  { args: [width = 1, height = 1, depth = 1] = [], radius = 0.05, steps = 1, smoothness = 4, bevelSegments = 4, creaseAngle = 0.4, children, ...rest },
  ref,
) {
  return (
    <mesh ref={ref} geometry={roundedBoxGeometry(width, height, depth, radius, steps, smoothness, bevelSegments, creaseAngle)} {...rest}>
      {children}
    </mesh>
  )
})
