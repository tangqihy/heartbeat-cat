import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('heartbeatAPI', {
  getConfig:  ()                              => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg: Record<string, unknown>)  => ipcRenderer.invoke('save-config', cfg),

  onInputEvent: (cb: (data: { type: 'keyboard' | 'mouse' }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { type: 'keyboard' | 'mouse' }) => cb(data)
    ipcRenderer.on('input-event', handler)
    return () => ipcRenderer.removeListener('input-event', handler)
  },

  // Bongo Cat gamification
  bongoRegister:   (deviceId: string, displayName: string) => ipcRenderer.invoke('bongo-register', deviceId, displayName),
  bongoGetEnergy:  ()                                      => ipcRenderer.invoke('bongo-get-energy'),
  bongoOpenBox:    ()                                      => ipcRenderer.invoke('bongo-open-box'),
  bongoGetCatalog: ()                                      => ipcRenderer.invoke('bongo-get-catalog'),
  bongoGetInventory: ()                                    => ipcRenderer.invoke('bongo-get-inventory'),
  bongoEquipItem:  (slot: string, itemId?: string)         => ipcRenderer.invoke('bongo-equip-item', slot, itemId),
  bongoGetProfile: ()                                      => ipcRenderer.invoke('bongo-get-profile'),
  bongoCraft:      (items: Array<{ item_id: string; count: number }>) => ipcRenderer.invoke('bongo-craft', items),

  bongoGetItemSvg: (svgRef: string)                     => ipcRenderer.invoke('bongo-get-item-svg', svgRef),

  // Friends
  bongoAddFriend:     (friendCode: string)               => ipcRenderer.invoke('bongo-add-friend', friendCode),
  bongoGetFriends:    ()                                 => ipcRenderer.invoke('bongo-get-friends'),
  bongoRemoveFriend:  (friendId: string)                 => ipcRenderer.invoke('bongo-remove-friend', friendId),
  bongoGetFriendProfile: (friendId: string)              => ipcRenderer.invoke('bongo-get-friend-profile', friendId),

  onEnergyUpdate: (cb: (data: { energy: number; available_boxes: number; progress: number; energy_per_box: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { energy: number; available_boxes: number; progress: number; energy_per_box: number }) => cb(data)
    ipcRenderer.on('energy-update', handler)
    return () => ipcRenderer.removeListener('energy-update', handler)
  },

  onBoxReady: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('box-ready', handler)
    return () => ipcRenderer.removeListener('box-ready', handler)
  },

  onEquipUpdate: (cb: (equipped: Array<{ slot: string; item_id: string; svg_ref: string }>) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: Array<{ slot: string; item_id: string; svg_ref: string }>) => cb(data)
    ipcRenderer.on('equip-update', handler)
    return () => ipcRenderer.removeListener('equip-update', handler)
  },

  onWsMessage: (cb: (msg: Record<string, unknown>) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: Record<string, unknown>) => cb(data)
    ipcRenderer.on('ws-message', handler)
    return () => ipcRenderer.removeListener('ws-message', handler)
  },
})
