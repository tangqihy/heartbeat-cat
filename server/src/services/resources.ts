import db, { stmts } from '../db/index'
import { categorizeApp, getResourceType, AppCategory, ResourceType } from './app-category'

interface InputEvents {
  keyboard: number
  mouse: number
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function accumulateResources(
  deviceId: string,
  appName: string,
  inputEvents?: InputEvents,
  aiActivityType?: string | null,
  qualityBonus?: number,
): void {
  if (!inputEvents) return
  const kb = Number(inputEvents.keyboard) || 0
  const ms = Number(inputEvents.mouse) || 0
  const total = Math.max(0, Math.floor(kb + ms))
  if (total <= 0) return

  const row = stmts.getUserIdByDevice.get({ device_id: deviceId }) as { user_id: string | null } | undefined
  if (!row?.user_id) return

  const userId = row.user_id
  const category = categorizeApp(appName, aiActivityType)
  if (!category) return

  const resourceType = getResourceType(category)
  const bonus = qualityBonus ?? 0
  const resourceAmount = Math.floor(total * (1 + bonus / 100))
  if (resourceAmount <= 0) return

  const date = todayStr()
  const tx = db.transaction(() => {
    stmts.upsertResource.run({
      user_id: userId,
      resource_type: resourceType,
      amount: resourceAmount,
    })
    stmts.upsertDailyResourceStats.run({
      user_id: userId,
      date,
      category,
      keyboard: kb,
      mouse: ms,
      duration: 0,
      resource_earned: resourceAmount,
    })
  })
  tx()
}

export function getUserResources(userId: string): Record<ResourceType, number> {
  const rows = stmts.getUserResources.all({ user_id: userId }) as Array<{ resource_type: string; amount: number }>
  const result: Record<string, number> = {
    order_crystal: 0,
    creation_shard: 0,
    passion_spark: 0,
    info_fragment: 0,
    social_spark: 0,
  }
  for (const row of rows) {
    result[row.resource_type] = row.amount
  }
  return result as Record<ResourceType, number>
}

export function deductResource(userId: string, resourceType: ResourceType, amount: number): boolean {
  const info = stmts.deductResource.run({
    user_id: userId,
    resource_type: resourceType,
    amount,
  })
  return info.changes > 0
}

export function getDailyResourceStats(userId: string, date: string) {
  return stmts.getDailyResourceStats.all({ user_id: userId, date }) as Array<{
    category: string
    keyboard: number
    mouse: number
    duration: number
    resource_earned: number
  }>
}

export function getDailyResourceStatsRange(userId: string, startDate: string, endDate: string) {
  return stmts.getDailyResourceStatsRange.all({
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
  }) as Array<{
    date: string
    category: string
    keyboard: number
    mouse: number
    duration: number
    resource_earned: number
  }>
}
