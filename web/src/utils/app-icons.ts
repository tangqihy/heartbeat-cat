/**
 * 应用图标：优先使用 public/app-icons 目录下的图片（见目录内 README）。
 * 键名用于文件名：{key}.png 或 {key}.svg，未配置时使用 default。
 */

/** 图标目录的 public 路径（Vite 下 public 内文件从根提供） */
export const APP_ICONS_BASE = '/app-icons'

/** 默认图标文件名（不含扩展名），未匹配到的应用使用此键 */
export const DEFAULT_ICON_KEY = 'default'

/**
 * 应用名称（多种写法）→ 图标键名（即文件名不含扩展名）
 * 键名与 public/app-icons/README.md 中表格一致
 */
const APP_NAME_TO_KEY: Record<string, string> = {
  'chrome': 'chrome',
  'google chrome': 'chrome',
  'microsoft edge': 'edge',
  'edge': 'edge',
  'firefox': 'firefox',
  'safari': 'safari',
  'opera': 'opera',
  'brave': 'brave',

  'code': 'code',
  'visual studio code': 'code',
  'vs code': 'code',
  'cursor': 'cursor',
  'visual studio': 'visual-studio',
  'intellij idea': 'intellij-idea',
  'webstorm': 'webstorm',
  'pycharm': 'pycharm',
  'phpstorm': 'phpstorm',
  'android studio': 'android-studio',
  'xcode': 'xcode',
  'vim': 'vim',
  'notepad++': 'notepad',
  'notepad': 'notepad',
  'sublime text': 'sublime-text',

  'windows explorer': 'explorer',
  'explorer': 'explorer',
  'file explorer': 'explorer',
  'finder': 'finder',
  'screen locked': 'screen-locked',
  'lock screen': 'screen-locked',

  'windows terminal': 'terminal',
  'terminal': 'terminal',
  'powershell': 'powershell',
  'command prompt': 'cmd',
  'cmd': 'cmd',
  'wsl': 'wsl',
  'iterm': 'iterm',
  'hyper': 'hyper',

  'slack': 'slack',
  'discord': 'discord',
  'wechat': 'wechat',
  '微信': 'wechat',
  'teams': 'teams',
  'microsoft teams': 'teams',
  'zoom': 'zoom',
  'telegram': 'telegram',
  'skype': 'skype',
  'outlook': 'outlook',
  'mail': 'mail',
  'thunderbird': 'thunderbird',

  'excel': 'excel',
  'microsoft excel': 'excel',
  'word': 'word',
  'microsoft word': 'word',
  'powerpoint': 'powerpoint',
  'microsoft powerpoint': 'powerpoint',
  'onenote': 'onenote',

  'git': 'git',
  'github': 'github',
  'gitlab': 'gitlab',
  'docker': 'docker',
  'postman': 'postman',
  'insomnia': 'insomnia',
  'figma': 'figma',
  'adobe xd': 'adobe-xd',
  'photoshop': 'photoshop',
  'illustrator': 'illustrator',

  'settings': 'settings',
  'system settings': 'settings',
  'control panel': 'control-panel',
  'task manager': 'task-manager',
  'windows security': 'windows-security',
}

function normalizeAppName(name: string): string {
  return (name || '').toLowerCase().trim()
}

/**
 * 根据应用名称返回图标键名（对应 public/app-icons/{key}.png）
 */
export function getAppIconKey(appName: string): string {
  const key = normalizeAppName(appName)
  if (!key) return DEFAULT_ICON_KEY
  if (APP_NAME_TO_KEY[key]) return APP_NAME_TO_KEY[key]
  for (const [k, iconKey] of Object.entries(APP_NAME_TO_KEY)) {
    if (key.startsWith(k) || key.includes(k)) return iconKey
  }
  return DEFAULT_ICON_KEY
}

/**
 * 返回应用图标的 URL（.png）。请在该目录放置 default.png 以及各应用的 {key}.png。
 */
export function getAppIconUrl(appName: string): string {
  return `${APP_ICONS_BASE}/${getAppIconKey(appName)}.png`
}

export type AppCategory = 'office' | 'devtool' | 'game' | 'browser' | 'chat' | 'system' | 'other'

const APP_CATEGORY_MAP: Record<string, AppCategory> = {
  'excel': 'office', 'word': 'office', 'powerpoint': 'office', 'onenote': 'office',
  'code': 'devtool', 'cursor': 'devtool', 'visual studio': 'devtool', 'terminal': 'devtool',
  'powershell': 'devtool', 'cmd': 'devtool', 'docker': 'devtool', 'postman': 'devtool',
  'figma': 'devtool', 'photoshop': 'devtool', 'git': 'devtool', 'vim': 'devtool',
  'chrome': 'browser', 'edge': 'browser', 'firefox': 'browser', 'safari': 'browser', 'brave': 'browser',
  'slack': 'chat', 'discord': 'chat', 'wechat': 'chat', 'teams': 'chat',
  'zoom': 'chat', 'telegram': 'chat', 'outlook': 'chat',
  'explorer': 'system', 'finder': 'system', 'settings': 'system',
}

export function getAppCategory(appName: string): AppCategory {
  const key = normalizeAppName(appName)
  if (APP_CATEGORY_MAP[key]) return APP_CATEGORY_MAP[key]
  for (const [k, cat] of Object.entries(APP_CATEGORY_MAP)) {
    if (key.startsWith(k) || key.includes(k)) return cat
  }
  return 'other'
}

export const CATEGORY_COLORS: Record<AppCategory, string> = {
  office: '#42a5f5', devtool: '#ab47bc', game: '#ef5350',
  browser: '#66bb6a', chat: '#ffa726', system: '#78909c', other: '#888',
}

/**
 * 返回用于显示的图标：若为 emoji 占位则返回该字符（未放图片时的回退），
 * 否则前端应优先用 getAppIconUrl 显示图片。
 * 保留用于 ECharts 等只支持文本的场景。
 */
const FALLBACK_EMOJI = '🖥️'
export function getAppIcon(appName: string): string {
  return FALLBACK_EMOJI
}
