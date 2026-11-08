// Picture-in-picture: the 3D office keeps playing in a small floating window while you work
// in other apps. The WebGL canvas is cropped into a small 2D canvas that is streamed to a
// <video> in picture-in-picture.
import { createStore } from './createStore'
import { prefs } from './notify'

export const SHAPES = { wide: ['Largo', 16 / 9], classic: ['4:3', 4 / 3], square: ['Quadrado', 1], tall: ['Vertical', 9 / 16] }
export const pipStore = createStore({ on: false, shape: prefs.get('pipShape', 'wide') })
let video = null
let out = null
let ctx = null
let timer = 0
/** Optional WebGL canvas handed over each frame by the Scene (more reliable than querying the DOM). */
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
  if (!src || !ctx || !out) return
  const sw0 = src.width || src.clientWidth
  const sh0 = src.height || src.clientHeight
  if (!sw0 || !sh0) return
  const r = out.width / out.height
  // crop the centre of the office to the window's shape
  let sw = sw0, sh = sw0 / r
  if (sh > sh0) (sh = sh0), (sw = sh0 * r)
  try {
    ctx.drawImage(src, (sw0 - sw) / 2, (sh0 - sh) / 2, sw, sh, 0, 0, out.width, out.height)
  } catch {
    /* canvas tainted / lost — skip this frame */
  }
}

/** Called from the R3F render loop right after a frame is drawn (needs preserveDrawingBuffer). */
export function pipGrabFrame(canvas) {
  if (!pipStore.get().on) return
  liveSrc = canvas || liveSrc
  copyFrame()
}

export function setPipShape(shape) {
  prefs.set('pipShape', shape)
  pipStore.set({ shape })
  if (out) (sizeOut(), copyFrame())
}

export async function togglePiP() {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {})
    return
  }
  const src = sourceCanvas()
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
      clearInterval(timer)
      liveSrc = null
      video.srcObject?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    })
  }
  sizeOut()
  // paint a first frame before opening PiP so the window isn't born black
  liveSrc = src
  copyFrame()
  clearInterval(timer)
  // backup ticker while the tab is hidden (rAF / useFrame may pause); Scene also pushes frames
  timer = setInterval(copyFrame, 1000 / 24)
  video.srcObject = out.captureStream(24)
  await video.play()
  await video.requestPictureInPicture()
  pipStore.set({ on: true })
}
