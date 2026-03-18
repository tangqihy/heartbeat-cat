/**
 * Foreground window detection + lock screen state.
 * Windows: PowerShell + user32.dll
 * macOS: AppleScript (osascript)
 */
import { execFileSync } from 'child_process'
import { powerMonitor, app } from 'electron'
import path from 'path'
import { getForegroundAppDarwin } from './get-foreground-darwin'

export interface ForegroundApp {
  appName: string
  title:   string
}

let locked = false

export function initLockDetection(): void {
  powerMonitor.on('lock-screen',   () => { locked = true })
  powerMonitor.on('unlock-screen', () => { locked = false })
}

export function isScreenLocked(): boolean {
  return locked
}

export async function getForegroundApp(): Promise<ForegroundApp | null> {
  if (process.platform === 'darwin') {
    return getForegroundAppDarwin()
  }
  return getForegroundAppWindows()
}

function getForegroundAppWindows(): ForegroundApp | null {
  const PS_SCRIPT = app.isPackaged
    ? path.join(process.resourcesPath, 'get-foreground.ps1')
    : path.join(app.getAppPath(), 'src', 'main', 'get-foreground.ps1')

  try {
    const raw = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', PS_SCRIPT,
    ], { timeout: 5000, encoding: 'utf-8', windowsHide: true }).trim()
    const parsed = JSON.parse(raw) as { appName: string; title: string }
    if (!parsed.appName) return null
    return parsed
  } catch {
    return null
  }
}
