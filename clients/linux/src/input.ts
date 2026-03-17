/**
 * Input event counting via uiohook-napi (X11-based).
 *
 * PRIVACY: Only event counts are recorded — no keycodes, coordinates,
 * button identities, timing sequences, or any content.
 *
 * NOTE: In Steam Deck Gaming Mode, input events go through Gamescope
 * (Wayland), bypassing the X11 hook entirely. Counts will be 0 during
 * gameplay — this is expected and harmless. Desktop Mode works fully.
 */
import { uIOhook } from 'uiohook-napi'

let keyboardCount = 0
let mouseCount    = 0
let hookActive    = false

export function startInputHook(): void {
  // uiohook-napi requires DISPLAY on Linux
  if (!process.env.DISPLAY) {
    process.env.DISPLAY = ':0'
  }

  try {
    uIOhook.on('keydown',   () => { keyboardCount++ })
    uIOhook.on('mousedown', () => { mouseCount++ })
    uIOhook.start()
    hookActive = true
    console.log('[input] Hook started — keyboard + mouse counting active')
  } catch (err) {
    // Common in Gaming Mode (no accessible X11 server) — not fatal
    console.warn('[input] Hook unavailable (Gaming Mode or no X11 display). Counts will be 0.')
    if (process.env.DEBUG) console.warn('[input]', (err as Error).message)
  }
}

export function getInputCounts(): { keyboard: number; mouse: number } {
  return { keyboard: keyboardCount, mouse: mouseCount }
}

export function resetInputCounts(): void {
  keyboardCount = 0
  mouseCount    = 0
}

export function stopInputHook(): void {
  if (hookActive) uIOhook.stop()
}
