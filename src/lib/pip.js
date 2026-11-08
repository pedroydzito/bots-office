// Picture-in-picture: the 3D office keeps playing in a small floating window while you work
// in other apps. The canvas is copied (cropped to the chosen shape) into a small 2D canvas that
// is streamed to a <video> in picture-in-picture.
import { createStore } from './createStore'
import { prefs } from './notify'

export const SHAPES = { wide: ['Largo', 16 / 9], classic: ['4:3', 4 / 3], square: ['Quadrado', 1], tall: ['Vertical', 9 / 16] }
export const pipStore = createStore({ on: false, shape: prefs.get('pipShape', 'wide') })
let video = null
let out = null
let ctx = null
let timer = 0

export const pipSupported = () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled && !!HTMLCanvasElement.prototype.captureStream

function sizeOut() {
  const [, r] = SHAPES[pipStore.get().shape] || SHAPES.wide
  const H = 480
  out.width = Math.round(r >= 1 ? H * r : H)
  out.height = Math.round(r >= 1 ? H : H / r)
}

function copyFrame() {
  const src = document.querySelector('.app canvas')
  if (!src || !ctx) return
  const r = out.width / out.height
  const sw0 = src.width, sh0 = src.height
  // crop the centre of the office to the window's shape
  let sw = sw0, sh = sw0 / r
  if (sh > sh0) (sh = sh0), (sw = sh0 * r)
  ctx.drawImage(src, (sw0 - sw) / 2, (sh0 - sh) / 2, sw, sh, 0, 0, out.width, out.height)
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
  if (!document.querySelector('.app canvas')) return
  if (!video) {
    out = document.createElement('canvas')
    ctx = out.getContext('2d')
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0'
    document.body.appendChild(video)
    video.addEventListener('leavepictureinpicture', () => {
      pipStore.set({ on: false })
      clearInterval(timer)
      video.srcObject?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    })
  }
  sizeOut()
  copyFrame()
  clearInterval(timer)
  timer = setInterval(copyFrame, 1000 / 24)
  video.srcObject = out.captureStream(24)
  await video.play()
  await video.requestPictureInPicture()
  pipStore.set({ on: true })
}
