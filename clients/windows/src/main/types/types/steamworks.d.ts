declare module 'steamworks.js' {
  interface SteamAchievement {
    activate(name: string): boolean
    isActivated(name: string): boolean
    clear(name: string): boolean
  }

  interface SteamLocalPlayer {
    getName(): string
    getSteamId(): { steamId64: string }
  }

  interface SteamClient {
    achievement: SteamAchievement
    localplayer: SteamLocalPlayer
  }

  export function init(appId: number): SteamClient
  export function restartAppIfNecessary(appId: number): boolean
}
