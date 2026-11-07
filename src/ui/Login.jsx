import { useEffect, useRef, useState } from 'react'
import { validTopic } from '../lib/ntfy'
import { Bell, Gear, Speaker, Tv } from './Icons'
import { chime, enableNotifications, notificationsSupported, prefs, prefStore, setPref } from '../lib/notify'
import { useStore } from '../lib/createStore'
import { startAmbience, startMusic, stopAmbience, stopMusic, uiSound } from '../lib/ambience'
import { Keyboard, Layers, Music, Pulse, Tag } from './Icons'

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
          <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true"><rect x="18.5" y="18.5" width="27" height="27" rx="7.5" fill="#fff" /><ellipse cx="31.4" cy="29.6" rx="1.9" ry="3.6" fill="#111" transform="rotate(24 31.4 29.6)" /><ellipse cx="37.3" cy="29.6" rx="1.9" ry="3.6" fill="#111" transform="rotate(24 37.3 29.6)" /></svg>
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

export function Settings({ live, onSignOut, onSignIn, onTv, mode, setMode, onOffices, onHealth, onKeys, readonly }) {
  const [open, setOpen] = useState(false)
  const [notify, setNotify] = useState(() => prefs.get('notify', false) && notificationsSupported() && Notification.permission === 'granted')
  const [sound, setSound] = useState(() => prefs.get('sound', true))
  const [amb, setAmb] = useState(() => prefs.get('ambience', true))
  const [music, setMusic] = useState(() => prefs.get('music', true))
  const [ui, setUi] = useState(() => prefs.get('uisound', true))
  const names = useStore(prefStore, (p) => p.names)
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
          {setMode && (
            <div className="mobile-only seg">
              {[['day', 'Dia'], ['night', 'Noite'], ['auto', 'Auto']].map(([k, l]) => (
                <button key={k} className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
          )}
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
          <button
            className="toggle"
            onClick={() => {
              const v = !music
              prefs.set('music', v)
              setMusic(v)
              v ? startMusic() : stopMusic()
            }}
          >
            <Music size={14} /> Música ambiente <i className={music ? 'on' : ''} />
          </button>
          <button
            className="toggle"
            onClick={() => {
              const v = !ui
              prefs.set('uisound', v)
              setUi(v)
              if (v) uiSound('toggle')
            }}
          >
            <Speaker size={14} /> Sons da interface <i className={ui ? 'on' : ''} />
          </button>
          <button className="toggle" onClick={() => setPref('names', !names)}>
            <Tag size={14} /> Mostrar nomes <i className={names ? 'on' : ''} />
          </button>
          <button onClick={() => { setOpen(false); onTv() }}><Tv size={14} /> Modo TV</button>
          <hr />
          {onOffices && <button onClick={() => { setOpen(false); onOffices() }}><Layers size={14} /> Escritórios{readonly ? ' · só leitura' : ''}</button>}
          {onHealth && <button onClick={() => { setOpen(false); onHealth() }}><Pulse size={14} /> Saúde do sistema</button>}
          {onKeys && <button onClick={() => { setOpen(false); onKeys() }}><Keyboard size={14} /> Atalhos</button>}
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
