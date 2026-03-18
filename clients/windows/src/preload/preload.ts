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

  onEnergyUpdate: (cb: (data: {
    energy: number; available_boxes: number; progress: number; energy_per_box: number
    energy_boxes: number; open_allowance: number; next_open_in: number; allowance_interval: number
  }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: {
      energy: number; available_boxes: number; progress: number; energy_per_box: number
      energy_boxes: number; open_allowance: number; next_open_in: number; allowance_interval: number
    }) => cb(data)
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

  bongoGetDailyInput: () => ipcRenderer.invoke('bongo-get-daily-input'),

  onDailyInputUpdate: (cb: (data: { keyboard: number; mouse: number; date: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { keyboard: number; mouse: number; date: string }) => cb(data)
    ipcRenderer.on('daily-input-update', handler)
    return () => ipcRenderer.removeListener('daily-input-update', handler)
  },

  onWsMessage: (cb: (msg: Record<string, unknown>) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: Record<string, unknown>) => cb(data)
    ipcRenderer.on('ws-message', handler)
    return () => ipcRenderer.removeListener('ws-message', handler)
  },

  // Achievements
  bongoGetAchievementCatalog: () => ipcRenderer.invoke('bongo-get-achievement-catalog'),
  bongoGetAchievements: () => ipcRenderer.invoke('bongo-get-achievements'),
  bongoGetAchievementProgress: () => ipcRenderer.invoke('bongo-get-achievement-progress'),

  // Leaderboard
  bongoGetLeaderboardDaily: (date?: string) => ipcRenderer.invoke('bongo-get-leaderboard-daily', date),
  bongoGetLeaderboardWeekly: () => ipcRenderer.invoke('bongo-get-leaderboard-weekly'),

  // Interactions
  bongoSendInteraction: (toUser: string, type: string, itemId?: string) => ipcRenderer.invoke('bongo-send-interaction', toUser, type, itemId),

  onAchievementUnlocked: (cb: (data: { achievement: { id: string; name: string; icon: string; reward_energy: number } }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { achievement: { id: string; name: string; icon: string; reward_energy: number } }) => cb(data)
    ipcRenderer.on('achievement-unlocked', handler)
    return () => ipcRenderer.removeListener('achievement-unlocked', handler)
  },

  onInteraction: (cb: (data: { interaction_type: string; from_name: string; item_id: string | null }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { interaction_type: string; from_name: string; item_id: string | null }) => cb(data)
    ipcRenderer.on('interaction-received', handler)
    return () => ipcRenderer.removeListener('interaction-received', handler)
  },

  // RPG: Level & Skills
  bongoGetLevel: () => ipcRenderer.invoke('bongo-get-level'),
  bongoGetSkillTree: () => ipcRenderer.invoke('bongo-get-skill-tree'),
  bongoGetSkills: () => ipcRenderer.invoke('bongo-get-skills'),
  bongoUpgradeSkill: (skillId: string) => ipcRenderer.invoke('bongo-upgrade-skill', skillId),

  // RPG: Quests
  bongoGetActiveQuests: () => ipcRenderer.invoke('bongo-get-active-quests'),
  bongoClaimQuestReward: (questId: number) => ipcRenderer.invoke('bongo-claim-quest-reward', questId),

  // RPG: Quest Shop
  bongoGetQuestShop: () => ipcRenderer.invoke('bongo-get-quest-shop'),
  bongoBuyShopItem: (shopItemId: string) => ipcRenderer.invoke('bongo-buy-shop-item', shopItemId),
  bongoGetTokens: () => ipcRenderer.invoke('bongo-get-tokens'),

  onLevelUp: (cb: (data: { new_level: number; skill_points_gained: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { new_level: number; skill_points_gained: number }) => cb(data)
    ipcRenderer.on('level-up', handler)
    return () => ipcRenderer.removeListener('level-up', handler)
  },

  onLevelUpdate: (cb: (data: { level: number; experience: number; xp_to_next: number; xp_progress_pct: number; skill_points: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { level: number; experience: number; xp_to_next: number; xp_progress_pct: number; skill_points: number }) => cb(data)
    ipcRenderer.on('level-update', handler)
    return () => ipcRenderer.removeListener('level-update', handler)
  },
})
