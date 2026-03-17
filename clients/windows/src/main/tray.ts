import { Tray, Menu, nativeImage } from 'electron'

export interface TrayCallbacks {
  onSettings:       () => void
  onToggleBongoCat: () => void
  onWardrobe:       () => void
  onFriends:        () => void
  onQuit:           () => void
}

let tray: Tray | null = null

function createHeartIcon(): Electron.NativeImage {
  const s = 16
  const buf = Buffer.alloc(s * s * 4, 0)
  const pattern = [
    '..##..##..',
    '.########.',
    '##########',
    '##########',
    '.########.',
    '..######..',
    '...####...',
    '....##....',
  ]
  const ox = 3, oy = 4
  for (let r = 0; r < pattern.length; r++) {
    for (let c = 0; c < pattern[r].length; c++) {
      if (pattern[r][c] === '#') {
        const i = ((oy + r) * s + (ox + c)) * 4
        buf[i]     = 0x55
        buf[i + 1] = 0x4b
        buf[i + 2] = 0xff
        buf[i + 3] = 0xff
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s })
}

export function createTray(cb: TrayCallbacks): Tray {
  const icon = createHeartIcon()
  tray = new Tray(icon)
  tray.setToolTip('My Heartbeat')

  const contextMenu = Menu.buildFromTemplate([
    { label: '设置',                click: cb.onSettings },
    { label: '背包 / 衣柜',        click: cb.onWardrobe },
    { label: '好友',                click: cb.onFriends },
    { label: '显示/隐藏 Bongo Cat', click: cb.onToggleBongoCat },
    { type: 'separator' },
    { label: '退出',                click: cb.onQuit },
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', cb.onSettings)

  return tray
}
