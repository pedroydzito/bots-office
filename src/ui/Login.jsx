import { useEffect, useRef, useState } from 'react'
import { validTopic } from '../lib/ntfy'

export function Login({ onSubmit, onDemo }) {
  const [v, setV] = useState('')
  const [touched, setTouched] = useState(false)
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  const ok = validTopic(v)
  return (
    <div className="login">
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (ok) onSubmit(v)
        }}
      >
        <span className="logo lg">
          <svg viewBox="0 0 24 24" width="22" height="22"><rect x="4" y="4" width="16" height="16" rx="5" fill="#fff" /></svg>
        </span>
        <h1>Grok Bot Office</h1>
        <p className="muted">Enter access code</p>
        <input
          ref={ref}
          type="password"
          value={v}
          onChange={(e) => setV(e.target.value.trim())}
          placeholder="Access code"
          aria-label="Access code"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
        />
        {touched && v && !ok && <p className="err">Letters, numbers, - and _ only (max 64).</p>}
        <button className="dark" disabled={!ok}>Enter</button>
        <button type="button" className="link" onClick={onDemo}>View demo</button>
      </form>
    </div>
  )
}

export function Settings({ live, onSignOut, onSignIn }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="settings" ref={ref}>
      <button className="card gear" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((x) => !x)}>⚙</button>
      {open && (
        <div className="card menu">
          {live ? (
            <button onClick={onSignOut}>Sign out</button>
          ) : (
            <button onClick={onSignIn}>Enter access code</button>
          )}
        </div>
      )}
    </div>
  )
}
