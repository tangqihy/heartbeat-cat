import { stmts } from '../db/index'

interface ActiveSession {
  deviceId:       string
  appName:        string
  appTitle:       string | null
  startTime:      number
  lastHeartbeat:  number
  keyboardEvents: number
  mouseEvents:    number
  timeoutSec:     number   // per-session, varies by device type
}

interface InputEvents {
  keyboard: number
  mouse:    number
}

const activeSessions = new Map<string, ActiveSession>()

// Default: Windows/Linux clients send every 10s, allow 30s gap
const DEFAULT_TIMEOUT_SEC = 30
// iOS only sends on open/close, so keep session alive much longer
export const IOS_TIMEOUT_SEC = 3 * 3600

function flushSession(session: ActiveSession): void {
  const duration = session.lastHeartbeat - session.startTime
  if (duration <= 0) return
  stmts.insertSession.run({
    device_id:       session.deviceId,
    app_name:        session.appName,
    app_title:       session.appTitle,
    start_time:      session.startTime,
    end_time:        session.lastHeartbeat,
    duration,
    keyboard_events: session.keyboardEvents,
    mouse_events:    session.mouseEvents,
  })
  activeSessions.delete(session.deviceId)
}

export function handleHeartbeat(
  deviceId:    string,
  appName:     string,
  appTitle:    string | null,
  timestamp:   number,
  inputEvents?: InputEvents,
  timeoutSec:  number = DEFAULT_TIMEOUT_SEC,
): void {
  const kb = inputEvents?.keyboard ?? 0
  const ms = inputEvents?.mouse    ?? 0

  const existing = activeSessions.get(deviceId)

  if (
    existing &&
    existing.appName === appName &&
    timestamp - existing.lastHeartbeat <= existing.timeoutSec
  ) {
    // Same app within the session window — extend
    existing.lastHeartbeat   = timestamp
    existing.appTitle        = appTitle
    existing.keyboardEvents += kb
    existing.mouseEvents    += ms
    return
  }

  if (existing) {
    // If the app changed AND the gap is within the session window, this
    // timestamp is the precise moment the old app lost focus → use it as end_time.
    // If the session already timed out, keep lastHeartbeat (last known activity)
    // rather than claiming the session lasted until now.
    const isRecentSwitch = existing.appName !== appName &&
                           timestamp - existing.lastHeartbeat <= existing.timeoutSec
    if (isRecentSwitch) existing.lastHeartbeat = timestamp
    flushSession(existing)
  }

  activeSessions.set(deviceId, {
    deviceId,
    appName,
    appTitle,
    startTime:      timestamp,
    lastHeartbeat:  timestamp,
    keyboardEvents: kb,
    mouseEvents:    ms,
    timeoutSec,
  })
}

/**
 * Explicitly close a session for a device (called on iOS "close" events).
 * Uses the provided timestamp as the precise end time of the session.
 */
export function closeSession(deviceId: string, timestamp: number): void {
  const existing = activeSessions.get(deviceId)
  if (!existing) return
  existing.lastHeartbeat = timestamp
  flushSession(existing)
}

// Periodic cleanup: flush sessions that have exceeded their timeout
setInterval(() => {
  const now = Math.floor(Date.now() / 1000)
  for (const session of activeSessions.values()) {
    if (now - session.lastHeartbeat > session.timeoutSec) {
      flushSession(session)
    }
  }
}, 60_000)
