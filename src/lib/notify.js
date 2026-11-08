// Small per-browser preferences + "a bot needs you" notifications (browser notification and a soft chime).

import { createStore } from './createStore'

export const prefs = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`bot-office:pref:${k}`)
      return v == null ? d : JSON.parse(v)
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`bot-office:pref:${k}`, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function enableNotifications() {
  if (!notificationsSupported()) return false
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  const ok = p === 'granted'
  prefs.set('notify', ok)
  return ok
}

let audio = null
export function chime() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    const t = audio.currentTime
    for (const [f, d] of [[880, 0], [1320, 0.12]]) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t + d)
      g.gain.linearRampToValueAtTime(0.12, t + d + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5)
      o.connect(g).connect(audio.destination)
      o.start(t + d)
      o.stop(t + d + 0.55)
    }
  } catch {
    /* audio blocked */
  }
}

export function notifyWaiting(bot, onClick) {
  if (!bot) return
  if (prefs.get('sound', true)) chime()
  if (!prefs.get('notify', false) || !notificationsSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return // the toast already shows it
  try {
    const n = new Notification(`${bot.name} precisa de você`, { body: bot.step || 'Precisa do seu OK', tag: `bot-office:${bot.name}`, silent: true })
    n.onclick = () => {
      window.focus()
      onClick && onClick()
      n.close()
    }
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

/** Reactive view prefs (re-render the scene when they change). */
export const prefStore = createStore({ names: prefs.get('names', true), gfx: prefs.get('gfx', 'auto') })
export function setPref(k, v) {
  prefs.set(k, v)
  prefStore.set({ [k]: v })
}
