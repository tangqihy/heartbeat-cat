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

export async function sendHeartbeat(
  serverUrl: string,
  apiKey: string,
  payload: HeartbeatPayload,
): Promise<void> {
  const url = `${serverUrl}/api/heartbeat`
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.warn(`[heartbeat] server returned ${res.status}`)
    }
  } catch (err) {
    console.warn(`[heartbeat] send failed: ${(err as Error).message}`)
  }
}
