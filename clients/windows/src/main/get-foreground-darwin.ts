/**
 * macOS foreground app detection using AppleScript (osascript).
 * Returns the name and window title of the frontmost application.
 */
import { execFileSync } from 'child_process'

export interface ForegroundApp {
  appName: string
  title: string
}

const APPLESCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set windowTitle to ""
  try
    set windowTitle to name of front window of frontApp
  end try
  return appName & "|||" & windowTitle
end tell
`

export function getForegroundAppDarwin(): ForegroundApp | null {
  try {
    const raw = execFileSync('osascript', ['-e', APPLESCRIPT], {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim()

    const parts = raw.split('|||')
    const appName = (parts[0] || '').trim()
    const title = (parts[1] || '').trim()

    if (!appName) return null
    return { appName, title }
  } catch {
    return null
  }
}
