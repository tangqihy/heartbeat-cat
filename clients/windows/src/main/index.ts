import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { loadConfig, saveConfig, getConfig } from './config-store'
import { createTray } from './tray'
import { startHeartbeatLoop, stopHeartbeatLoop, restartHeartbeatLoop } from './heartbeat-loop'
import { startInputHook, stopInputHook, setInputCallback } from './input'
import { initLockDetection } from './window-tracker'
import * as bongoApi from './bongo-api'
import { setBongoCatWindowRef, pushEnergyUpdate, pushEquipUpdate } from './energy-push'
import { connectWs, disconnectWs, setWsBongoCatRef, sendWsInputEvent, sendWsEquipChange } from './ws-client'

let configWindow:   BrowserWindow | null = null
let bongoCatWindow: BrowserWindow | null = null
let wardrobeWindow: BrowserWindow | null = null
let friendsWindow:  BrowserWindow | null = null

const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js')

function rendererPath(file: string): string {
  return path.join(app.getAppPath(), 'src', 'renderer', file)
}

// ── Config window ────────────────────────────────────────────────────────

function showConfigWindow(): void {
  if (configWindow) { configWindow.focus(); return }

  configWindow = new BrowserWindow({
    width: 500, height: 650,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  })

  configWindow.loadFile(rendererPath('config/index.html'))
  configWindow.on('closed', () => { configWindow = null })
}

// ── Bongo Cat overlay ────────────────────────────────────────────────────

function showBongoCat(): void {
  if (bongoCatWindow) return

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  bongoCatWindow = new BrowserWindow({
    width: 300, height: 300,
    x: sw - 320, y: sh - 320,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  })

  bongoCatWindow.loadFile(rendererPath('bongo-cat/index.html'))
  setBongoCatWindowRef(bongoCatWindow)
  setWsBongoCatRef(bongoCatWindow)
  bongoCatWindow.on('closed', () => { bongoCatWindow = null; setBongoCatWindowRef(null); setWsBongoCatRef(null) })
}

function hideBongoCat(): void {
  if (bongoCatWindow) { bongoCatWindow.close(); bongoCatWindow = null }
}

function toggleBongoCat(): void {
  if (bongoCatWindow) hideBongoCat(); else showBongoCat()
}

// ── Wardrobe window ──────────────────────────────────────────────────────

function showWardrobeWindow(): void {
  if (wardrobeWindow) { wardrobeWindow.focus(); return }

  wardrobeWindow = new BrowserWindow({
    width: 700, height: 600,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  })

  wardrobeWindow.loadFile(rendererPath('wardrobe/index.html'))
  wardrobeWindow.on('closed', () => { wardrobeWindow = null })
}

// ── Friends window ───────────────────────────────────────────────────────

function showFriendsWindow(): void {
  if (friendsWindow) { friendsWindow.focus(); return }

  friendsWindow = new BrowserWindow({
    width: 500, height: 550,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  })

  friendsWindow.loadFile(rendererPath('friends/index.html'))
  friendsWindow.on('closed', () => { friendsWindow = null })
}

// ── Auto-register user ──────────────────────────────────────────────────

async function ensureUserRegistered(): Promise<void> {
  const cfg = getConfig()
  if (cfg.userId) return

  try {
    const result = await bongoApi.registerUser(cfg.deviceId, cfg.deviceName)
    saveConfig({
      userId: result.user.id,
      friendCode: result.user.friend_code,
    })
    console.log(`[bongo] registered user ${result.user.friend_code}`)
  } catch (err) {
    console.warn('[bongo] registration failed, will retry:', (err as Error).message)
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const cfg = loadConfig()

  // IPC: config
  ipcMain.handle('get-config', () => getConfig())
  ipcMain.handle('save-config', (_e, partial) => {
    const updated = saveConfig(partial)
    restartHeartbeatLoop()
    if (updated.showBongoCat && !bongoCatWindow) showBongoCat()
    if (!updated.showBongoCat && bongoCatWindow) hideBongoCat()
    return updated
  })

  // IPC: Bongo Cat gamification
  ipcMain.handle('bongo-register', async (_e, deviceId: string, displayName: string) => {
    const result = await bongoApi.registerUser(deviceId, displayName)
    saveConfig({ userId: result.user.id, friendCode: result.user.friend_code })
    return result
  })

  ipcMain.handle('bongo-get-energy', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserEnergy(cfg.userId)
  })

  ipcMain.handle('bongo-open-box', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    const result = await bongoApi.openBox(cfg.userId)
    pushEnergyUpdate()
    return result
  })

  ipcMain.handle('bongo-get-catalog', async () => {
    return bongoApi.getCatalog()
  })

  ipcMain.handle('bongo-get-inventory', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return []
    return bongoApi.getInventory(cfg.userId)
  })

  ipcMain.handle('bongo-equip-item', async (_e, slot: string, itemId?: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    const result = await bongoApi.equipItem(cfg.userId, slot, itemId)
    pushEquipUpdate()
    if (itemId) {
      const catalogItem = (await bongoApi.getCatalog()).find(c => c.id === itemId)
      if (catalogItem) sendWsEquipChange(slot, itemId, catalogItem.svg_ref)
    }
    return result
  })

  ipcMain.handle('bongo-get-item-svg', async (_e, svgRef: string) => {
    const cfg = getConfig()
    try {
      const res = await fetch(`${cfg.serverUrl}/api/items/svg/${svgRef}`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return null
      return res.text()
    } catch {
      return null
    }
  })

  ipcMain.handle('bongo-get-profile', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserProfile(cfg.userId)
  })

  ipcMain.handle('bongo-craft', async (_e, items: Array<{ item_id: string; count: number }>) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    const result = await bongoApi.craftItems(cfg.userId, items)
    pushEnergyUpdate()
    return result
  })

  // IPC: Friends
  ipcMain.handle('bongo-add-friend', async (_e, friendCode: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.addFriend(cfg.userId, friendCode)
  })

  ipcMain.handle('bongo-get-friends', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return []
    return bongoApi.getFriends(cfg.userId)
  })

  ipcMain.handle('bongo-remove-friend', async (_e, friendId: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.removeFriend(cfg.userId, friendId)
  })

  ipcMain.handle('bongo-get-friend-profile', async (_e, friendId: string) => {
    return bongoApi.getFriendProfile(friendId)
  })

  // Lock detection
  initLockDetection()

  // Input hook — forward events to bongo cat renderer AND WebSocket
  setInputCallback((type) => {
    if (bongoCatWindow && !bongoCatWindow.isDestroyed()) {
      bongoCatWindow.webContents.send('input-event', { type })
    }
    sendWsInputEvent(type)
  })
  startInputHook()

  // System tray
  createTray({
    onSettings:       showConfigWindow,
    onToggleBongoCat: toggleBongoCat,
    onWardrobe:       showWardrobeWindow,
    onFriends:        showFriendsWindow,
    onQuit: () => {
      disconnectWs()
      stopHeartbeatLoop()
      stopInputHook()
      app.quit()
    },
  })

  // Bongo Cat
  if (cfg.showBongoCat) showBongoCat()

  // Heartbeat
  startHeartbeatLoop()

  // Auto-register user for gamification
  await ensureUserRegistered()

  // Connect WebSocket for real-time multiplayer
  connectWs()

  // Push initial energy and equipment state
  setTimeout(() => {
    pushEnergyUpdate().catch(() => {})
    pushEquipUpdate().catch(() => {})
  }, 2000)

  console.log(`[heartbeat] ${cfg.deviceName} (${cfg.deviceId}) → ${cfg.serverUrl}`)
})

app.on('window-all-closed', () => { /* tray app — don't quit */ })
