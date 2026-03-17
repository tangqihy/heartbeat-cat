/**
 * Input event counting — keyboard and mouse.
 * Enhanced for Electron: supports a callback for real-time event forwarding.
 */
import { uIOhook } from 'uiohook-napi'

let keyboardCount = 0
let mouseCount    = 0
let onInputCb: ((type: 'keyboard' | 'mouse') => void) | null = null

function onKeydown(): void {
  keyboardCount++
  onInputCb?.('keyboard')
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
  uIOhook.off('mousedown', onMousedown)
  uIOhook.stop()
}
