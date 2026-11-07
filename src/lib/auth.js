// Access-code login. The code is the ntfy topic. It is kept only in this
// browser's localStorage and is never rendered, logged or left in the URL.
import { validTopic } from './ntfy'

const KEY = 'bot-office:code'

export function getCode() {
  try {
    const c = localStorage.getItem(KEY)
    return validTopic(c) ? c : null
  } catch {
    return null
  }
}

export function setCode(code) {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    /* private mode: works for this session only */
  }
}

export function clearCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** If the URL carries `#<code>`, store it and strip it from the address bar/history. Returns the code or null. */
export function captureHash() {
  const raw = window.location.hash
  if (!raw) return null
  let h = ''
  try {
    h = decodeURIComponent(raw.replace(/^#\/?/, '')).trim()
  } catch {
    /* malformed escape */
  }
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
  if (!validTopic(h)) return null
  setCode(h)
  return h
}
