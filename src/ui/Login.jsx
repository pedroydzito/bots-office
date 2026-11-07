import { useEffect, useRef, useState } from 'react'
import { validTopic } from '../lib/ntfy'
import { Bell, Gear, Speaker, Tv } from './Icons'
import { chime, enableNotifications, notificationsSupported, prefs } from '../lib/notify'
import { startAmbience, stopAmbience } from '../lib/ambience'

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
        <h1>Escritório de Bots</h1>
        <p className="muted">Digite seu código de acesso</p>
        <input
          ref={ref}
          type="password"
          value={v}
          onChange={(e) => setV(e.target.value.trim())}
          placeholder="Código de acesso"
          aria-label="Código de acesso"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
        />
        {touched && v && !ok && <p className="err">Só letras, números, - e _ (máx. 64).</p>}
        <button className="dark" disabled={!ok}>Entrar</button>
        <button type="button" className="link" onClick={onDemo}>Ver demonstração</button>
      </form>
    </div>
  )
}

export function Settings({ live, onSignOut, onSignIn, onTv }) {
  const [open, setOpen] = useState(false)
  const [notify, setNotify] = useState(() => prefs.get('notify', false) && notificationsSupported() && Notification.permission === 'granted')
  const [sound, setSound] = useState(() => prefs.get('sound', false))
  const [amb, setAmb] = useState(() => prefs.get('ambience', false))
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
      <button className="card gear" aria-label="Configurações" aria-expanded={open} onClick={() => setOpen((x) => !x)}><Gear size={15} /></button>
      {open && (
        <div className="card menu">
          {notificationsSupported() && (
            <button
              className="toggle"
              onClick={async () => {
                if (notify) {
                  prefs.set('notify', false)
                  setNotify(false)
                } else setNotify(await enableNotifications())
              }}
            >
              <Bell size={14} /> Notificações <i className={notify ? 'on' : ''} />
            </button>
          )}
          <button
            className="toggle"
            onClick={() => {
              prefs.set('sound', !sound)
              setSound(!sound)
              if (!sound) chime()
            }}
          >
            <Speaker size={14} /> Som de alerta <i className={sound ? 'on' : ''} />
          </button>
          <button
            className="toggle"
            onClick={() => {
              const v = !amb
              prefs.set('ambience', v)
              setAmb(v)
              v ? startAmbience() : stopAmbience()
            }}
          >
            <Speaker size={14} /> Som ambiente <i className={amb ? 'on' : ''} />
          </button>
          <button onClick={() => { setOpen(false); onTv() }}><Tv size={14} /> Modo TV</button>
          <hr />
          {live ? (
            <button onClick={onSignOut}>Sair</button>
          ) : (
            <button onClick={onSignIn}>Inserir código de acesso</button>
          )}
        </div>
      )}
    </div>
  )
}
