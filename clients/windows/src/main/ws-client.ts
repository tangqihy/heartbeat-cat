import WebSocket from 'ws'
import { getConfig } from './config-store'
import { BrowserWindow } from 'electron'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let bongoCatRef: BrowserWindow | null = null

export function setWsBongoCatRef(win: BrowserWindow | null): void {
  bongoCatRef = win
}

export function connectWs(): void {
  const cfg = getConfig()
  if (!cfg.userId || !cfg.serverUrl) return

  disconnectWs()

  const wsUrl = cfg.serverUrl.replace(/^http/, 'ws') + `/ws?user_id=${cfg.userId}`
  try {
    ws = new WebSocket(wsUrl)
  } catch {
    scheduleReconnect()
    return
  }

  ws.on('open', () => {
    console.log('[ws] connected')
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      forwardToRenderer(msg)
    } catch {}
  })

  ws.on('close', () => {
    console.log('[ws] disconnected')
    ws = null
    scheduleReconnect()
  })

  ws.on('error', (err) => {
    console.warn('[ws] error:', err.message)
    ws?.close()
  })
}

export function disconnectWs(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    ws.removeAllListeners()
    ws.close()
    ws = null
  }
}

export function sendWsInputEvent(type: 'keyboard' | 'mouse'): void {
  sendMsg({ type: 'input_event', input_type: type })
}

export function sendWsEquipChange(slot: string, itemId: string, svgRef: string): void {
  sendMsg({ type: 'equip_change', slot, item_id: itemId, svg_ref: svgRef })
}

function sendMsg(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function forwardToRenderer(msg: Record<string, unknown>): void {
  if (bongoCatRef && !bongoCatRef.isDestroyed()) {
    bongoCatRef.webContents.send('ws-message', msg)
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWs()
  }, 5000)
}
