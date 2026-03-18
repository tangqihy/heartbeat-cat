import { BrowserWindow } from 'electron'
import { getConfig } from './config-store'
import * as bongoApi from './bongo-api'

let bongoCatWindowRef: BrowserWindow | null = null

export function setBongoCatWindowRef(win: BrowserWindow | null): void {
  bongoCatWindowRef = win
}

export async function pushEnergyUpdate(): Promise<void> {
  const cfg = getConfig()
  if (!cfg.userId) return

  try {
    const energy = await bongoApi.getUserEnergy(cfg.userId)
    if (bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('energy-update', energy)
    }
    if (energy.available_boxes > 0 && bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('box-ready')
    }
  } catch {
    // server might be down
  }
}

export async function pushEquipUpdate(): Promise<void> {
  const cfg = getConfig()
  if (!cfg.userId) return

  try {
    const profile = await bongoApi.getUserProfile(cfg.userId)
    if (bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('equip-update', profile.equipped || [])
    }
  } catch {
    // server might be down
  }
}

/**
 * Push incremental input counts (from current heartbeat tick) to server.
 * Accepts the pre-reset counts so the heartbeat loop can reset local
 * counters independently.
 */
export async function syncDailyInput(keyboard: number, mouse: number): Promise<void> {
  const cfg = getConfig()
  if (!cfg.userId) return
  if (keyboard <= 0 && mouse <= 0) return

  try {
    const result = await bongoApi.pushDailyInput(cfg.userId, keyboard, mouse)
    if (bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('daily-input-update', {
        keyboard: result.keyboard,
        mouse: result.mouse,
        date: result.date,
      })
    }
  } catch {
    // will retry next cycle
  }
}

export async function fetchAndPushDailyInput(): Promise<void> {
  const cfg = getConfig()
  if (!cfg.userId) return

  try {
    const result = await bongoApi.getDailyInput(cfg.userId)
    if (bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('daily-input-update', {
        keyboard: result.keyboard,
        mouse: result.mouse,
        date: result.date,
      })
    }
  } catch {}
}

export async function pushLevelUpdate(): Promise<void> {
  const cfg = getConfig()
  if (!cfg.userId) return

  try {
    const level = await bongoApi.getUserLevel(cfg.userId)
    if (bongoCatWindowRef && !bongoCatWindowRef.isDestroyed()) {
      bongoCatWindowRef.webContents.send('level-update', level)
    }
  } catch {}
}

