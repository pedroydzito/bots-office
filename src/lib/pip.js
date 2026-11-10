// Picture-in-picture: the 3D office keeps playing in a small floating window while you work
// in other apps. Frames are cropped into a small 2D canvas that is streamed to a <video>.
//
// Scene wraps gl.render → pipGrabFrame in the same turn the frame is drawn (no
// preserveDrawingBuffer — that stalls the GPU — and no useFrame priority > 0, which would
// put R3F into manual mode and blank the office on Leve).
import { createStore } from './createStore'
import { prefs } from './notify'

export const SHAPES = { wide: ['Largo', 16 / 9], classic: ['4:3', 4 / 3], square: ['Quadrado', 1], tall: ['Vertical', 9 / 16] }
export const pipStore = createStore({ on: false, shape: prefs.get('pipShape', 'wide') })
let video = null
let out = null
let ctx = null
let liveSrc = null

export const pipSupported = () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled && !!HTMLCanvasElement.prototype.captureStream

function sizeOut() {
  const [, r] = SHAPES[pipStore.get().shape] || SHAPES.wide
  const H = 480
  out.width = Math.round(r >= 1 ? H * r : H)
  out.height = Math.round(r >= 1 ? H : H / r)
}

function sourceCanvas() {
  return liveSrc || document.querySelector('.app canvas')
}

function copyFrame() {
  const src = sourceCanvas()
  if (!src || !ctx || !out) return false
  const sw0 = src.width || src.clientWidth
  const sh0 = src.height || src.clientHeight
  if (!sw0 || !sh0) return false
  const r = out.width / out.height
  let sw = sw0, sh = sw0 / r
  if (sh > sh0) (sh = sh0), (sw = sh0 * r)
  try {
    ctx.drawImage(src, (sw0 - sw) / 2, (sh0 - sh) / 2, sw, sh, 0, 0, out.width, out.height)
    return true
  } catch {
    return false
  }
}

/** Called from Scene right after gl.render (same JS turn — drawing buffer still intact). */
export function pipGrabFrame(canvas) {
  if (!pipStore.get().on || !out) return
  liveSrc = canvas || liveSrc
  copyFrame()
}

export function setPipShape(shape) {
  prefs.set('pipShape', shape)
  pipStore.set({ shape })
  if (out) sizeOut()
  copyFrame()
}

export async function togglePiP() {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {})
    return
  }
  const src = document.querySelector('.app canvas')
  if (!src) return
  if (!video) {
    out = document.createElement('canvas')
    ctx = out.getContext('2d', { alpha: false })
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0'
    document.body.appendChild(video)
    video.addEventListener('leavepictureinpicture', () => {
      pipStore.set({ on: false })
      liveSrc = null
      video.srcObject?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    })
  }
  sizeOut()
  liveSrc = src
  // enable feed first so the next gl.render wraps fill `out`
  pipStore.set({ on: true })
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  copyFrame()
  video.srcObject = out.captureStream(24)
  await video.play()
  await video.requestPictureInPicture()
}
