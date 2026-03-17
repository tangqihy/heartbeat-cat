const BASE = '/api'

export interface Device {
  id: string
  name: string
  type: string
  last_seen: number
}

export interface UsageSummary {
  app_name:       string
  total_duration: number
  total_keyboard: number
  total_mouse:    number
}

export interface Session {
  device_id:       string
  app_name:        string
  app_title:       string | null
  start_time:      number
  end_time:        number
  duration:        number
  keyboard_events: number
  mouse_events:    number
}

export interface WeeklyEntry {
  day_index:      number
  app_name:       string
  total_duration: number
  total_keyboard: number
  total_mouse:    number
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs  = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${path}?${qs}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  try {
    return await res.json() as T
  } catch {
    throw new Error(`Failed to parse response from ${path}`)
  }
}

export const api = {
  getDevices: () =>
    get<Device[]>('/devices', {}),

  getUsageSummary: (start: number, end: number, deviceId?: string) =>
    get<UsageSummary[]>('/usage/summary', {
      start: String(start),
      end:   String(end),
      ...(deviceId ? { device_id: deviceId } : {}),
    }),

  getTimeline: (start: number, end: number, deviceId?: string) =>
    get<Session[]>('/usage/timeline', {
      start: String(start),
      end:   String(end),
      ...(deviceId ? { device_id: deviceId } : {}),
    }),

  getWeeklyUsage: (weekStart: number, deviceId?: string) =>
    get<WeeklyEntry[]>('/usage/weekly', {
      week_start: String(weekStart),
      ...(deviceId ? { device_id: deviceId } : {}),
    }),
}
