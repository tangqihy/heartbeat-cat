/**
 * Input event counting — keyboard and mouse.
 * Filters key repeats: holding a key counts as one press until released.
 */
import { uIOhook, UiohookKeyboardEvent } from 'uiohook-napi'

let keyboardCount = 0
let mouseCount    = 0
let onInputCb: ((type: 'keyboard' | 'mouse') => void) | null = null

const pressedKeys = new Set<number>()

function onKeydown(e: UiohookKeyboardEvent): void {
  if (pressedKeys.has(e.keycode)) return
  pressedKeys.add(e.keycode)
  keyboardCount++
  onInputCb?.('keyboard')
}

function onKeyup(e: UiohookKeyboardEvent): void {
  pressedKeys.delete(e.keycode)
}

function onMousedown(): void {
  mouseCount++
  onInputCb?.('mouse')
}

export function setInputCallback(cb: (type: 'keyboard' | 'mouse') => void): void {
  onInputCb = cb
}

export function startInputHook(): void {
  uIOhook.on('keydown', onKeydown)
  uIOhook.on('keyup', onKeyup)
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
  uIOhook.off('keydown', onKeydown)
  uIOhook.off('keyup', onKeyup)
  uIOhook.off('mousedown', onMousedown)
  pressedKeys.clear()
  uIOhook.stop()
}
