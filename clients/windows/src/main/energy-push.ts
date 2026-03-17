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
