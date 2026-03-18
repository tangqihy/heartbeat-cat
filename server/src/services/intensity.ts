import { stmts } from '../db/index'
import { categorizeApp, AppCategory, ALL_RESOURCE_TYPES } from './app-category'

interface SessionAgg {
  app_name: string
  total_duration: number
  total_keyboard: number
  total_mouse: number
  max_session_duration: number
  session_count: number
}

export interface CategoryIntensity {
  category: AppCategory
  apm: number
  focus_ratio: number
  diversity: number
  quality_bonus: number
}

function getDayBounds(): { day_start: number; day_end: number } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return {
    day_start: Math.floor(start.getTime() / 1000),
    day_end: Math.floor(start.getTime() / 1000) + 86400,
  }
}

export function getIntensityMetrics(userId: string): CategoryIntensity[] {
  const { day_start, day_end } = getDayBounds()
  const rows = stmts.getSessionStatsByAppToday.all({
    user_id: userId,
    day_start,
    day_end,
  }) as SessionAgg[]

  const catAgg: Record<string, {
    totalInput: number
    totalDuration: number
    maxSession: number
    appSet: Set<string>
  }> = {}

  for (const row of rows) {
    const cat = categorizeApp(row.app_name)
    if (!cat) continue
    if (!catAgg[cat]) {
      catAgg[cat] = { totalInput: 0, totalDuration: 0, maxSession: 0, appSet: new Set() }
    }
    const agg = catAgg[cat]
    agg.totalInput += row.total_keyboard + row.total_mouse
    agg.totalDuration += row.total_duration
    agg.maxSession = Math.max(agg.maxSession, row.max_session_duration)
    agg.appSet.add(row.app_name)
  }

  const results: CategoryIntensity[] = []

  for (const [cat, agg] of Object.entries(catAgg)) {
    const durationMin = Math.max(agg.totalDuration / 60, 1)
    const apm = agg.totalInput / durationMin
    const focusRatio = agg.totalDuration > 0 ? agg.maxSession / agg.totalDuration : 0
    const diversity = agg.appSet.size

    // quality_bonus: 0-50% based on combined intensity score
    // APM contributes 0-20% (capped at 200 APM), focus 0-15%, diversity 0-15%
    const apmBonus = Math.min(apm / 200, 1) * 20
    const focusBonus = focusRatio * 15
    const diversityBonus = Math.min(diversity / 5, 1) * 15
    const qualityBonus = Math.min(Math.floor(apmBonus + focusBonus + diversityBonus), 50)

    results.push({
      category: cat as AppCategory,
      apm: Math.round(apm * 100) / 100,
      focus_ratio: Math.round(focusRatio * 100) / 100,
      diversity,
      quality_bonus: qualityBonus,
    })
  }

  return results
}

export function getCategoryQualityBonus(userId: string, category: AppCategory): number {
  const metrics = getIntensityMetrics(userId)
  const m = metrics.find(m => m.category === category)
  return m?.quality_bonus ?? 0
}
