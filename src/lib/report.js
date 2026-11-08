// Weekly report as a shareable image (PNG), drawn on a canvas — nothing leaves the device
// except when the user shares it.
import { resolveColor } from './constants'

export async function weeklyReport(data, officeName = 'Escritório de Bots') {
  const W = 1080, H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const F = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8F59F9'
  // background
  const grd = g.createLinearGradient(0, 0, 0, H)
  grd.addColorStop(0, '#0f1424')
  grd.addColorStop(1, '#1b2340')
  g.fillStyle = grd
  g.fillRect(0, 0, W, H)
  g.fillStyle = accent
  g.fillRect(0, 0, W, 10)
  // header
  const now = new Date()
  const start = new Date(now.getTime() - 6 * 864e5)
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  g.fillStyle = '#9aa3b2'
  g.font = `600 30px ${F}`
  g.fillText('RELATÓRIO DA SEMANA', 70, 110)
  g.fillStyle = '#ffffff'
  g.font = `800 64px ${F}`
  g.fillText(officeName, 70, 190)
  g.fillStyle = '#9aa3b2'
  g.font = `500 32px ${F}`
  g.fillText(`${fmt(start)} – ${fmt(now)}`, 70, 240)

  // numbers
  const week = data.week?.bots || {}
  const doneTotal = Object.values(week).reduce((a, b) => a + b, 0)
  const errs = (data.history || []).filter((h) => h.status === 'error' && now - h.t < 7 * 864e5).length
  const usage = data.usage?.total != null ? Math.round(data.usage.total) : null
  const tiles = [
    ['Tarefas concluídas', String(doneTotal), '#34d399'],
    ['Erros (48 h)', String(errs), errs ? '#ff6369' : '#34d399'],
    ['Limite semanal', usage != null ? `${usage}%` : '—', usage != null && usage > 85 ? '#ff6369' : '#f5a524'],
  ]
  tiles.forEach(([l, v, col], i) => {
    const x = 70 + i * 320
    g.fillStyle = 'rgba(255,255,255,0.06)'
    round(g, x, 300, 290, 190, 26)
    g.fill()
    g.fillStyle = col
    g.font = `800 76px ${F}`
    g.fillText(v, x + 28, 410)
    g.fillStyle = '#c3c9d6'
    g.font = `500 28px ${F}`
    g.fillText(l, x + 28, 458)
  })

  // top bots
  g.fillStyle = '#ffffff'
  g.font = `700 38px ${F}`
  g.fillText('Mais produtivos', 70, 590)
  const top = Object.entries(week).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = Math.max(1, ...top.map(([, v]) => v))
  if (!top.length) {
    g.fillStyle = '#9aa3b2'
    g.font = `500 30px ${F}`
    g.fillText('Nenhuma tarefa concluída nesta semana ainda', 70, 650)
  }
  top.forEach(([n, v], i) => {
    const y = 640 + i * 78
    let col = resolveColor(data.bots[n]?.color)
    { const h = col.replace('#', ''); const l = (parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11) / 255; if (l < 0.25) col = '#c3c9d6' }
    g.fillStyle = col
    g.beginPath()
    g.arc(92, y + 18, 18, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = `600 32px ${F}`
    g.fillText(n.length > 22 ? n.slice(0, 21) + '…' : n, 128, y + 30)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    round(g, 560, y + 4, 380, 28, 14)
    g.fill()
    g.fillStyle = col
    round(g, 560, y + 4, Math.max(28, (380 * v) / max), 28, 14)
    g.fill()
    g.fillStyle = '#c3c9d6'
    g.font = `700 30px ${F}`
    g.textAlign = 'right'
    g.fillText(String(v), 1010, y + 30)
    g.textAlign = 'left'
  })

  // teams
  const teams = {}
  for (const [n, v] of Object.entries(week)) {
    const t = data.bots[n]?.team || 'Outros'
    teams[t] = (teams[t] || 0) + v
  }
  const tl = Object.entries(teams).sort((a, b) => b[1] - a[1]).slice(0, 4)
  g.fillStyle = '#ffffff'
  g.font = `700 38px ${F}`
  g.fillText('Por time', 70, 1080)
  tl.forEach(([t, v], i) => {
    const x = 70 + (i % 2) * 480, y = 1120 + Math.floor(i / 2) * 80
    g.fillStyle = 'rgba(255,255,255,0.06)'
    round(g, x, y, 450, 64, 18)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = `600 30px ${F}`
    g.fillText(t, x + 24, y + 42)
    g.fillStyle = accent
    g.textAlign = 'right'
    g.fillText(String(v), x + 425, y + 42)
    g.textAlign = 'left'
  })
  g.fillStyle = '#6b7484'
  g.font = `500 24px ${F}`
  g.fillText('Escritório de Bots', 70, H - 40)

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const file = new File([blob], `relatorio-semana-${now.toISOString().slice(0, 10)}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Relatório da semana' })
      return 'shared'
    } catch {
      /* cancelled: fall back to download */
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}

function round(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
