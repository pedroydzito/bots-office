// One floating tooltip for things inside the 3D scene (empty chairs, wall boards, the team TV).
import { createStore } from './createStore'

export const tipStore = createStore({ tip: null })
export const mouse = { x: 0, y: 0 }
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => ((mouse.x = e.clientX), (mouse.y = e.clientY)), { passive: true })

let hideT = 0
/** tip: { title, sub?, lines?: [{a, b, color}], wide? } */
export function showTip(tip) {
  clearTimeout(hideT)
  tipStore.set({ tip })
}
export function hideTip() {
  clearTimeout(hideT)
  hideT = setTimeout(() => tipStore.set({ tip: null }), 80)
}
