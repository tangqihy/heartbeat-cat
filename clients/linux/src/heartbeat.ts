import type { ScreenContext } from './ai'

export interface HeartbeatPayload {
  device_id:    string
  device_name:  string
  device_type:  string
  app_name:     string
  app_title?:   string
  input_events: { keyboard: number; mouse: number }
  ai_context?:  ScreenContext
}

const serverUrl = process.env.SERVER_URL ?? 'http://localhost:3000'
const apiKey    = process.env.API_KEY    ?? ''

export async function sendHeartbeat(payload: HeartbeatPayload): Promise<void> {
  try {
    const res = await fetch(`${serverUrl}/api/heartbeat`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) console.warn(`[heartbeat] server returned ${res.status}`)
  } catch (err) {
    console.warn(`[heartbeat] send failed: ${(err as Error).message}`)
  }
}
