import * as THREE from 'three'

/** Live world positions of mounted bots (head height), for camera focus + elevator doors. */
export const botPositions = new Map()

/** Shared signals between DOM UI and the 3D scene (no React re-render needed). */
export const sceneSignals = {
  zoom: 0, // pending zoom steps from +/- buttons
  focusRequest: null, // bot name the camera should glide to
}

export const tmpV = new THREE.Vector3()

/** Where the open floor's room sits inside the building footprint (rooms hug the back-left corner). */
export const floorOffset = { x: 0, z: 0 }

/**
 * Elevator rides between floors: { name, from, to, start, end } (ms timestamps, floor indexes).
 * Filled by the app when cross-floor conversations start/end; drawn in the glass shaft.
 */
export const rides = []
/** World position of bots currently riding the elevator (for the camera to follow). */
export const ridePositions = new Map()
export function activeRide(name, now = Date.now()) {
  for (let i = rides.length - 1; i >= 0; i--) {
    const r = rides[i]
    if (r.name === name && now < r.end) return r
  }
  return null
}
export function lastRide(name) {
  for (let i = rides.length - 1; i >= 0; i--) if (rides[i].name === name) return rides[i]
  return null
}

/** Per-floor memory of each bot's simulation state (position, activity, personality). */
export const botMemory = new Map()

/** Seated bots publish their swivel so their chair turns with them. */
export const seatYaw = new Map()

/** Points of interest currently claimed by a bot (one bot per spot). */
export const poiTaken = new Set()
/** Sofa seats currently sat on (cushions squash). */
export const sitting = new Set()
export const poiKey = (p) => `${p.kind}:${p.x.toFixed(2)},${p.z.toFixed(2)}`

let codeScroll = 0
/** Advance the shared monitor "code" scroll once per frame (not once per desk). */
export function tickCodeScroll(t, textures) {
  if (codeScroll === t) return
  codeScroll = t
  for (const tex of textures) tex.offset.y = (-t * 0.05) % 1
}
