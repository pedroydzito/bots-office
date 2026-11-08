// Picture-in-picture: the 3D office keeps playing in a small floating window while you work
// in other apps. Uses the canvas as a video stream (works in Chrome, Edge, Safari, Firefox*).
import { createStore } from './createStore'

export const pipStore = createStore({ on: false })
let video = null

export const pipSupported = () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled && !!HTMLCanvasElement.prototype.captureStream

export async function togglePiP() {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {})
    return
  }
  const canvas = document.querySelector('.app canvas')
  if (!canvas) return
  if (!video) {
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0'
    document.body.appendChild(video)
    video.addEventListener('leavepictureinpicture', () => {
      pipStore.set({ on: false })
      video.srcObject?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    })
  }
  video.srcObject = canvas.captureStream(24)
  await video.play()
  await video.requestPictureInPicture()
  pipStore.set({ on: true })
}
