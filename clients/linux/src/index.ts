/**
 * Heartbeat Linux/Steam Deck client — main loop
 *
 * Works in both Steam Deck modes:
 *   Gaming Mode  → detects running games via /proc SteamAppId scan
 *   Desktop Mode → detects active window via xdotool
 *
 * Setup:
 *   cp .env.example .env
 *   npm install
 *   npm start
 *
 * Auto-start (systemd):
 *   cp heartbeat.service ~/.config/systemd/user/
 *   systemctl --user enable --now heartbeat
 */
import 'dotenv/config'
import { startInputHook, getInputCounts, resetInputCounts, stopInputHook } from './input'
import { getForegroundApp } from './window'
import { sendHeartbeat }    from './heartbeat'
import { captureScreen }    from './screenshot'
import { describeScreen }   from './ai'

// ── Config ────────────────────────────────────────────────────────────────
const DEVICE_ID   = process.env.DEVICE_ID   ?? 'linux-device'
const DEVICE_NAME = process.env.DEVICE_NAME ?? 'Linux Device'
const INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL ?? 10) * 1_000
const AI_EVERY    = Number(process.env.AI_SCREENSHOT_EVERY ?? 6)
const AI_ENABLED  = Boolean(process.env.ANTHROPIC_API_KEY)

// ── State ─────────────────────────────────────────────────────────────────
let tickCount = 0

// ── Main tick ─────────────────────────────────────────────────────────────
async function tick(): Promise<void> {
  tickCount++

  const app = await getForegroundApp()
  if (!app) return

  const inputCounts = getInputCounts()
  resetInputCounts()

  let aiContext: Awaited<ReturnType<typeof describeScreen>> = null
  if (AI_ENABLED && tickCount % AI_EVERY === 0) {
    const screenshot = await captureScreen()
    if (screenshot) aiContext = await describeScreen(screenshot)
  }

  await sendHeartbeat({
    device_id:    DEVICE_ID,
    device_name:  DEVICE_NAME,
    device_type:  'linux',
    app_name:     app.appName,
    app_title:    app.title,
    input_events: inputCounts,
    ...(aiContext ? { ai_context: aiContext } : {}),
  })
}

// ── Startup ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════╗
║       My Heartbeat — Linux / Steam Deck  ║
╠══════════════════════════════════════════╣
║  Device  : ${DEVICE_NAME.padEnd(30)}║
║  ID      : ${DEVICE_ID.padEnd(30)}║
║  Interval: every ${String(INTERVAL_MS / 1000).padEnd(3)}s               ║
║  AI      : ${(AI_ENABLED ? `enabled (every ${AI_EVERY * INTERVAL_MS / 1000}s)` : 'disabled (set ANTHROPIC_API_KEY)').padEnd(30)}║
╠══════════════════════════════════════════╣
║  Window detection:                       ║
║    1. Steam game  (/proc SteamAppId)     ║
║    2. xdotool     (X11 / Gamescope)      ║
╚══════════════════════════════════════════╝
  `.trim())

  startInputHook()

  await tick()
  const timer = setInterval(tick, INTERVAL_MS)

  const shutdown = (): void => {
    clearInterval(timer)
    stopInputHook()
    console.log('\n[heartbeat] Stopped.')
    process.exit(0)
  }
  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[heartbeat] Fatal error:', err)
  process.exit(1)
})
