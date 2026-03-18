import { getConfig } from './config-store'
import { getForegroundApp, isScreenLocked } from './window-tracker'
import { getInputCounts, resetInputCounts } from './input'
import { sendHeartbeat } from './heartbeat'
import { captureScreen } from './screenshot'
import { describeScreen } from './ai'
import { pushEnergyUpdate, syncDailyInput, pushLevelUpdate } from './energy-push'

let timer: ReturnType<typeof setInterval> | null = null
let tickCount = 0
let ticking = false

export function startHeartbeatLoop(): void {
  if (timer) return
  const cfg = getConfig()
  const ms = (cfg.heartbeatInterval || 10) * 1000
  tick()
  timer = setInterval(tick, ms)
  console.log(`[heartbeat] loop started — every ${ms / 1000}s`)
}

export function stopHeartbeatLoop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    console.log('[heartbeat] loop stopped')
  }
}

export function restartHeartbeatLoop(): void {
  stopHeartbeatLoop()
  tickCount = 0
  startHeartbeatLoop()
}

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    tickCount++
    const cfg = getConfig()

    let appName: string
    let appTitle: string

    if (isScreenLocked()) {
      appName  = 'Screen Locked'
      appTitle = ''
    } else {
      const fg = await getForegroundApp()
      if (!fg) return
      appName  = fg.appName
      appTitle = fg.title
    }

    const inputCounts = getInputCounts()
    resetInputCounts()

    let aiContext: Awaited<ReturnType<typeof describeScreen>> = null
    const aiEvery = cfg.aiScreenshotEvery || 6
    if (cfg.anthropicApiKey && tickCount % aiEvery === 0) {
      const shot = await captureScreen()
      if (shot) {
        aiContext = await describeScreen(shot, cfg.anthropicApiKey, cfg.aiModel)
      }
    }

    await sendHeartbeat(cfg.serverUrl, cfg.apiKey, {
      device_id:    cfg.deviceId,
      device_name:  cfg.deviceName,
      device_type:  process.platform === 'darwin' ? 'macos' : 'windows',
      app_name:     appName,
      app_title:    appTitle,
      input_events: inputCounts,
      ...(aiContext ? { ai_context: aiContext } : {}),
    })

    if (inputCounts.keyboard > 0 || inputCounts.mouse > 0) {
      pushEnergyUpdate().catch(() => {})
      syncDailyInput(inputCounts.keyboard, inputCounts.mouse).catch(() => {})
      pushLevelUpdate().catch(() => {})
    }
  } catch (err) {
    console.warn('[heartbeat] tick failed:', (err as Error).message)
  } finally {
    ticking = false
  }
}
