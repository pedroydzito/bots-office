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

export function setCode(code, opts = {}) {
  rememberOffice(code, opts)
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
  // `#ver:<code>` = a view-only link (no approving, reacting or replying from this browser)
  const readonly = h.startsWith('ver:')
  if (readonly) h = h.slice(4)
  if (!validTopic(h)) return null
  setCode(h, { readonly })
  return h
}

// ---------------------------------------------------------------- several offices in one browser
const OFFICES = 'bot-office:offices'

/** [{ code, label, readonly }] — every office this browser has opened. */
export function listOffices() {
  try {
    const l = JSON.parse(localStorage.getItem(OFFICES) || '[]')
    return Array.isArray(l) ? l.filter((o) => o && validTopic(o.code)) : []
  } catch {
    return []
  }
}
function saveOffices(l) {
  try {
    localStorage.setItem(OFFICES, JSON.stringify(l.slice(0, 12)))
  } catch {
    /* ignore */
  }
}
export function rememberOffice(code, { label, readonly } = {}) {
  const l = listOffices()
  const i = l.findIndex((o) => o.code === code)
  const prev = i >= 0 ? l[i] : { code, label: '', readonly: false }
  const next = { ...prev, label: label ?? prev.label, readonly: readonly ?? prev.readonly }
  if (i >= 0) l[i] = next
  else l.push(next)
  saveOffices(l)
}
export function renameOffice(code, label) {
  saveOffices(listOffices().map((o) => (o.code === code ? { ...o, label: label.slice(0, 30) } : o)))
}
export function forgetOffice(code) {
  saveOffices(listOffices().filter((o) => o.code !== code))
}
export function isReadonly(code) {
  return !!listOffices().find((o) => o.code === code)?.readonly
}
/** A link that opens this office in view-only mode on another device. */
export function viewOnlyLink(code) {
  return `${window.location.origin}/#ver:${encodeURIComponent(code)}`
}
