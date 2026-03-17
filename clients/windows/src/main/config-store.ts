import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppConfig {
  deviceId:          string
  deviceName:        string
  serverUrl:         string
  apiKey:            string
  heartbeatInterval: number
  anthropicApiKey:   string
  aiModel:           string
  aiScreenshotEvery: number
  showBongoCat:      boolean
  userId:            string
  friendCode:        string
}

const DEFAULT_CONFIG: AppConfig = {
  deviceId:          'windows-pc',
  deviceName:        'Windows PC',
  serverUrl:         'http://localhost:3000',
  apiKey:            '',
  heartbeatInterval: 10,
  anthropicApiKey:   '',
  aiModel:           'claude-haiku-4-5-20251001',
  aiScreenshotEvery: 6,
  showBongoCat:      true,
  userId:            '',
  friendCode:        '',
}

let config: AppConfig = { ...DEFAULT_CONFIG }

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  try {
    const p = configPath()
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8')
      config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    }
  } catch {
    config = { ...DEFAULT_CONFIG }
  }
  return config
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  config = { ...config, ...partial }
  try {
    const p = configPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[config] failed to save:', (err as Error).message)
  }
  return config
}

export function getConfig(): AppConfig {
  return config
}
