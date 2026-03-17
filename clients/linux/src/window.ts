/**
 * Foreground app detection for Linux / Steam Deck.
 *
 * Detection strategy (tried in order each tick):
 *
 *  1. Steam game  — scan /proc/<pid>/environ for SteamAppId
 *                   → look up game name in steamapps/appmanifest_<id>.acf
 *                   Works in both Gaming Mode and Desktop Mode.
 *
 *  2. xdotool     — query the active X11 window (DISPLAY=:0 / :1)
 *                   Works in Desktop Mode and sometimes in Gaming Mode
 *                   when Gamescope exposes an XWayland layer.
 */

import { readdir, readFile } from 'fs/promises'
import { execFile }          from 'child_process'
import { promisify }         from 'util'

const exec = promisify(execFile)

export interface ForegroundApp {
  appName: string
  title:   string
}

// ── Steam game detection ──────────────────────────────────────────────────

/** Cache: pid → { appId, name } to avoid re-scanning /proc every tick. */
let steamCache: { pid: string; appId: string; name: string } | null = null

/**
 * Parse all configured Steam library paths.
 * Format: comma-separated list in STEAM_LIBRARY_PATHS, or default path.
 */
function getSteamLibraryPaths(): string[] {
  const home = process.env.HOME ?? '/home/deck'
  const defaultPath = `${home}/.local/share/Steam/steamapps`
  const extra = process.env.STEAM_LIBRARY_PATHS ?? ''
  const paths = [defaultPath, ...extra.split(',').map(p => p.trim()).filter(Boolean)]
  return [...new Set(paths)]
}

/** Read a game's display name from its appmanifest ACF file. */
async function getGameName(appId: string): Promise<string | null> {
  for (const libPath of getSteamLibraryPaths()) {
    const manifest = `${libPath}/appmanifest_${appId}.acf`
    try {
      const content = await readFile(manifest, 'utf-8')
      const match   = content.match(/"name"\s+"([^"]+)"/)
      if (match) return match[1]
    } catch { /* not in this library */ }
  }
  return null
}

/**
 * Scan /proc for a process whose environment contains SteamAppId=<non-zero>.
 * This fires when Steam has launched a game (both Gaming Mode and Desktop Mode).
 */
async function trySteamGame(): Promise<ForegroundApp | null> {
  // Fast path: if we cached a running game, verify the process still exists
  if (steamCache) {
    try {
      await readFile(`/proc/${steamCache.pid}/comm`)
      return { appName: steamCache.name, title: steamCache.name }
    } catch {
      steamCache = null  // process ended — fall through to full scan
    }
  }

  try {
    const pids = await readdir('/proc')

    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue

      let environ: Buffer
      try {
        environ = await readFile(`/proc/${pid}/environ`)
      } catch {
        continue  // EACCES (another user's process) or process ended
      }

      // environ entries are separated by null bytes
      const vars = environ.toString('utf8').split('\0')

      const steamEntry = vars.find(v => v.startsWith('SteamAppId='))
      if (!steamEntry) continue

      const appId = steamEntry.split('=')[1]?.trim()
      if (!appId || appId === '0') continue

      // Resolve game name
      const name = await getGameName(appId)
        ?? (await readFile(`/proc/${pid}/comm`, 'utf-8').catch(() => '')).trim()
        ?? `Steam App ${appId}`

      steamCache = { pid, appId, name }
      return { appName: name, title: name }
    }
  } catch { /* /proc not accessible */ }

  return null
}

// ── xdotool (X11 / Gamescope XWayland) ──────────────────────────────────

/** Friendly process name overrides (lowercase key → display name). */
const FRIENDLY_NAMES: Record<string, string> = {
  'firefox':          'Firefox',
  'firefox-bin':      'Firefox',
  'chrome':           'Google Chrome',
  'chromium':         'Chromium',
  'chromium-browser': 'Chromium',
  'code':             'VS Code',
  'code-oss':         'VS Code',
  'codium':           'VSCodium',
  'kate':             'Kate',
  'konsole':          'Konsole',
  'dolphin':          'Dolphin',
  'steam':            'Steam',
  'steamwebhelper':   'Steam',
  'obs':              'OBS Studio',
  'vlc':              'VLC',
  'mpv':              'MPV',
  'discord':          'Discord',
  'slack':            'Slack',
  'spotify':          'Spotify',
}

async function tryXdotool(display: string): Promise<ForegroundApp | null> {
  const env = { ...process.env, DISPLAY: display }
  const opts = { env, timeout: 2_000 }

  try {
    const { stdout: widRaw } = await exec('xdotool', ['getactivewindow'], opts)
    const wid = widRaw.trim()
    if (!wid) return null

    const [titleResult, pidResult] = await Promise.allSettled([
      exec('xdotool', ['getwindowname', wid], opts),
      exec('xdotool', ['getwindowpid',  wid], opts),
    ])

    const title = titleResult.status === 'fulfilled' ? titleResult.value.stdout.trim() : ''
    if (!title) return null

    let appName = title

    if (pidResult.status === 'fulfilled') {
      const pid = pidResult.value.stdout.trim()
      if (pid) {
        const { stdout: comm } = await exec('ps', ['-p', pid, '-o', 'comm='], { timeout: 2_000 })
          .catch(() => ({ stdout: '' }))
        const proc = comm.trim().toLowerCase()
        if (proc) appName = FRIENDLY_NAMES[proc] ?? comm.trim()
      }
    }

    return { appName, title }
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getForegroundApp(): Promise<ForegroundApp | null> {
  // Strategy 1: Steam game (gaming mode primary path)
  const steamGame = await trySteamGame()
  if (steamGame) return steamGame

  // Strategy 2: xdotool — try env DISPLAY first, then common fallbacks
  const displays = [...new Set([
    process.env.DISPLAY,
    ':0',
    ':1',
  ].filter(Boolean))] as string[]

  for (const display of displays) {
    const result = await tryXdotool(display)
    if (result) return result
  }

  return null
}
