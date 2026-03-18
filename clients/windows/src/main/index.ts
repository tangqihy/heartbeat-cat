import { app, BrowserWindow, ipcMain, screen, systemPreferences } from 'electron'
import path from 'path'
import { loadConfig, saveConfig, getConfig } from './config-store'
import { createTray } from './tray'
import { startHeartbeatLoop, stopHeartbeatLoop, restartHeartbeatLoop } from './heartbeat-loop'
import { startInputHook, stopInputHook, setInputCallback, resetInputCounts } from './input'
import { initLockDetection } from './window-tracker'
import * as bongoApi from './bongo-api'
import { setBongoCatWindowRef, pushEnergyUpdate, pushEquipUpdate, fetchAndPushDailyInput, pushLevelUpdate } from './energy-push'
import { connectWs, disconnectWs, setWsBongoCatRef, sendWsInputEvent, sendWsEquipChange } from './ws-client'
import { initSteam, activateAchievement, shutdownSteam } from './steam'

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
    show: false,
  })

  wardrobeWindow.loadFile(rendererPath('wardrobe/index.html'))
  wardrobeWindow.once('ready-to-show', () => wardrobeWindow?.show())
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
    show: false,
  })

  friendsWindow.loadFile(rendererPath('friends/index.html'))
  friendsWindow.once('ready-to-show', () => friendsWindow?.show())
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
    try {
      const result = await bongoApi.openBox(cfg.userId)
      pushEnergyUpdate()
      return result
    } catch (err) {
      const msg = (err as Error).message ?? ''
      const match = msg.match(/"next_open_in"\s*:\s*(\d+)/)
      if (match) return { ok: false, next_open_in: Number(match[1]) }
      return { ok: false, error: msg }
    }
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

  ipcMain.handle('bongo-craft', async (_e, items: Array<{ item_id: string; count: number }>, catalyst?: { resource_type: string; amount: number }) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    const result = await bongoApi.craftItems(cfg.userId, items, catalyst)
    pushEnergyUpdate()
    return result
  })

  // IPC: Achievements
  ipcMain.handle('bongo-get-achievement-catalog', async () => {
    return bongoApi.getAchievementCatalog()
  })

  ipcMain.handle('bongo-get-achievements', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return []
    return bongoApi.getUserAchievements(cfg.userId)
  })

  ipcMain.handle('bongo-get-achievement-progress', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getAchievementProgress(cfg.userId)
  })

  // IPC: Leaderboard
  ipcMain.handle('bongo-get-leaderboard-daily', async (_e, date?: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return []
    return bongoApi.getLeaderboardDaily(cfg.userId, date)
  })

  ipcMain.handle('bongo-get-leaderboard-weekly', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return []
    return bongoApi.getLeaderboardWeekly(cfg.userId)
  })

  // IPC: Interactions
  ipcMain.handle('bongo-send-interaction', async (_e, toUser: string, type: string, itemId?: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.sendInteraction(cfg.userId, toUser, type, itemId)
  })

  // IPC: RPG Level & Skills
  ipcMain.handle('bongo-get-level', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserLevel(cfg.userId)
  })

  ipcMain.handle('bongo-get-skill-tree', async () => {
    return bongoApi.getSkillTree()
  })

  ipcMain.handle('bongo-get-skills', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserSkills(cfg.userId)
  })

  ipcMain.handle('bongo-upgrade-skill', async (_e, skillId: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.upgradeSkill(cfg.userId, skillId)
  })

  // IPC: RPG Quests
  ipcMain.handle('bongo-get-active-quests', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getActiveQuests(cfg.userId)
  })

  ipcMain.handle('bongo-claim-quest-reward', async (_e, questId: number) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.claimQuestReward(cfg.userId, questId)
  })

  // IPC: Quest Shop
  ipcMain.handle('bongo-get-quest-shop', async () => {
    return bongoApi.getQuestShop()
  })

  ipcMain.handle('bongo-buy-shop-item', async (_e, shopItemId: string) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.buyShopItem(cfg.userId, shopItemId)
  })

  ipcMain.handle('bongo-get-tokens', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserTokens(cfg.userId)
  })

  // IPC: Resources & Roadmap
  ipcMain.handle('bongo-get-resources', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserResources(cfg.userId)
  })

  ipcMain.handle('bongo-get-intensity', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getUserIntensity(cfg.userId)
  })

  ipcMain.handle('bongo-get-roadmap', async (_e, count?: number) => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getBoxRoadmap(cfg.userId, count)
  })

  ipcMain.handle('bongo-get-catalyst-config', async () => {
    return bongoApi.getCatalystConfig()
  })

  ipcMain.handle('bongo-get-unlock-config', async () => {
    return bongoApi.getSystemUnlockConfig()
  })

  // IPC: Daily input stats
  ipcMain.handle('bongo-get-daily-input', async () => {
    const cfg = getConfig()
    if (!cfg.userId) return null
    return bongoApi.getDailyInput(cfg.userId)
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

  // macOS: check accessibility permission for input hook
  if (process.platform === 'darwin') {
    const isTrusted = (systemPreferences as any).isTrustedAccessibilityClient?.(false)
    if (!isTrusted) {
      console.warn('[input] macOS accessibility not granted — requesting...')
      ;(systemPreferences as any).isTrustedAccessibilityClient?.(true)
    }
  }

  // Input hook — forward events to bongo cat renderer AND WebSocket
  setInputCallback((type) => {
    if (bongoCatWindow && !bongoCatWindow.isDestroyed()) {
      bongoCatWindow.webContents.send('input-event', { type })
    }
    sendWsInputEvent(type)
  })
  startInputHook().catch(err => console.error('[input] hook init failed:', err))

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
      shutdownSteam()
      app.quit()
    },
  })

  // Bongo Cat
  if (cfg.showBongoCat) showBongoCat()

  // Heartbeat
  startHeartbeatLoop()

  // Steam SDK (no-op if not configured or Steam not running)
  initSteam().catch(() => {})

  // Auto-register user for gamification
  await ensureUserRegistered()

  // Connect WebSocket for real-time multiplayer
  connectWs()

  // Push initial energy, equipment, daily input, and level state
  setTimeout(() => {
    pushEnergyUpdate().catch(() => {})
    pushEquipUpdate().catch(() => {})
    fetchAndPushDailyInput().catch(() => {})
    pushLevelUpdate().catch(() => {})
  }, 2000)

  // Midnight reset: clear local counters so today starts fresh
  function scheduleMidnightReset(): void {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()
    setTimeout(() => {
      resetInputCounts()
      fetchAndPushDailyInput().catch(() => {})
      console.log('[heartbeat] midnight reset — new day started')
      scheduleMidnightReset()
    }, msUntilMidnight)
  }
  scheduleMidnightReset()

  console.log(`[heartbeat] ${cfg.deviceName} (${cfg.deviceId}) → ${cfg.serverUrl}`)
})

app.on('window-all-closed', () => { /* tray app — don't quit */ })
