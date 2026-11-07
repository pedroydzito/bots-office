// Live connection stats for the "Saúde do sistema" panel.
export const health = {
  connectedAt: 0,
  lastAt: 0, // when the last message arrived (local clock)
  lastMsgT: 0, // its ntfy timestamp
  delays: [], // receive delay of live messages, ms
  received: [], // arrival times (last hour)
}
export function noteMessage(serverMs, live) {
  const now = Date.now()
  health.lastAt = now
  health.lastMsgT = Math.max(health.lastMsgT, serverMs)
  health.received.push(now)
  while (health.received.length && now - health.received[0] > 3600e3) health.received.shift()
  if (live) {
    health.delays.push(Math.max(0, now - serverMs))
    if (health.delays.length > 50) health.delays.shift()
  }
}
