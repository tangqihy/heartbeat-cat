/**
 * Input event counting — keyboard and mouse.
 * Filters key repeats: holding a key counts as one press until released.
 * uiohook-napi is loaded lazily to speed up app startup.
 */

let keyboardCount = 0
let mouseCount    = 0
let onInputCb: ((type: 'keyboard' | 'mouse') => void) | null = null
let hookModule: typeof import('uiohook-napi') | null = null

const pressedKeys = new Set<number>()

function onKeydown(e: { keycode: number }): void {
  if (pressedKeys.has(e.keycode)) return
  pressedKeys.add(e.keycode)
  keyboardCount++
  onInputCb?.('keyboard')
}

function onKeyup(e: { keycode: number }): void {
  pressedKeys.delete(e.keycode)
}

function onMousedown(): void {
  mouseCount++
  onInputCb?.('mouse')
}

export function setInputCallback(cb: (type: 'keyboard' | 'mouse') => void): void {
  onInputCb = cb
}

export async function startInputHook(): Promise<void> {
  hookModule = await import('uiohook-napi')
  const { uIOhook } = hookModule
  uIOhook.on('keydown', onKeydown as any)
  uIOhook.on('keyup', onKeyup as any)
  uIOhook.on('mousedown', onMousedown)
  uIOhook.start()
}

export function getInputCounts(): { keyboard: number; mouse: number } {
  return { keyboard: keyboardCount, mouse: mouseCount }
}

export function resetInputCounts(): void {
  keyboardCount = 0
  mouseCount    = 0
}

export function stopInputHook(): void {
  if (!hookModule) return
  const { uIOhook } = hookModule
  uIOhook.off('keydown', onKeydown as any)
  uIOhook.off('keyup', onKeyup as any)
  uIOhook.off('mousedown', onMousedown)
  pressedKeys.clear()
  uIOhook.stop()
}
