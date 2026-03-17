// Consistent color palette for app names (ECharts default palette extended)
const PALETTE = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#67e0e3',
  '#37a2da', '#32c5e9', '#9fe6b8', '#ffdb5c', '#ff9f7f',
  '#fb7293', '#e7bcf3', '#8378ea', '#96bfff', '#b6a2de',
]

const colorCache = new Map<string, string>()

export function getAppColor(appName: string): string {
  if (colorCache.has(appName)) return colorCache.get(appName)!
  let hash = 0
  for (let i = 0; i < appName.length; i++) {
    hash = (hash * 31 + appName.charCodeAt(i)) & 0x7fffffff
  }
  const color = PALETTE[hash % PALETTE.length]
  colorCache.set(appName, color)
  return color
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return d.toTimeString().slice(0, 5)  // HH:MM
}
