/**
 * Steam SDK integration via steamworks.js
 * Provides initialization, achievement syncing, and overlay support.
 * Loaded lazily — no-op when Steam is not available.
 */

let steamClient: any = null
let steamInitialized = false

const STEAM_APP_ID = 0 // Replace with actual Steam App ID when registered

export async function initSteam(): Promise<boolean> {
  if (STEAM_APP_ID === 0) {
    console.log('[steam] No App ID configured, skipping Steam init')
    return false
  }

  try {
    const steamworks = await import('steamworks.js')
    steamClient = steamworks.init(STEAM_APP_ID)
    steamInitialized = true
    console.log('[steam] Initialized successfully')
    return true
  } catch (err) {
    console.warn('[steam] Init failed (Steam not running?):', (err as Error).message)
    return false
  }
}

export function isSteamActive(): boolean {
  return steamInitialized && steamClient !== null
}

export function activateAchievement(achievementId: string): void {
  if (!isSteamActive()) return

  try {
    const mapped = mapAchievementToSteam(achievementId)
    if (!mapped) return

    steamClient.achievement.activate(mapped)
    console.log(`[steam] Achievement activated: ${mapped}`)
  } catch (err) {
    console.warn(`[steam] Failed to activate achievement ${achievementId}:`, (err as Error).message)
  }
}

export function getSteamUserName(): string | null {
  if (!isSteamActive()) return null

  try {
    return steamClient.localplayer.getName()
  } catch {
    return null
  }
}

const ACHIEVEMENT_MAP: Record<string, string> = {
  'first_box': 'ACH_FIRST_BOX',
  'keyboard_1k': 'ACH_KEYBOARD_1K',
  'keyboard_10k': 'ACH_KEYBOARD_10K',
  'keyboard_100k': 'ACH_KEYBOARD_100K',
  'mouse_1k': 'ACH_MOUSE_1K',
  'mouse_10k': 'ACH_MOUSE_10K',
  'box_10': 'ACH_BOX_10',
  'box_50': 'ACH_BOX_50',
  'box_100': 'ACH_BOX_100',
  'collector_10': 'ACH_COLLECTOR_10',
  'first_friend': 'ACH_FIRST_FRIEND',
  'social_3': 'ACH_SOCIAL_3',
  'generous_1': 'ACH_GENEROUS',
}

function mapAchievementToSteam(internalId: string): string | null {
  return ACHIEVEMENT_MAP[internalId] ?? null
}

export function shutdownSteam(): void {
  if (!steamInitialized) return

  try {
    // steamworks.js handles cleanup on process exit
    steamClient = null
    steamInitialized = false
    console.log('[steam] Shutdown')
  } catch {}
}
