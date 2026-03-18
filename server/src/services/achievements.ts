import db, { stmts } from '../db/index'
import { getUserLevel } from './level'

interface AchievementCondition {
  type: string
  target?: number
  category?: string
}

interface UnlockedAchievement {
  id: string
  name: string
  icon: string
  reward_energy: number
}

export function checkAchievements(userId: string): UnlockedAchievement[] {
  const catalog = stmts.getAchievementCatalog.all() as Array<{
    id: string; name: string; icon: string; category: string
    condition: string; reward_energy: number
  }>

  const newlyUnlocked: UnlockedAchievement[] = []
  const now = Math.floor(Date.now() / 1000)

  for (const ach of catalog) {
    if (stmts.hasAchievement.get({ user_id: userId, achievement_id: ach.id })) continue

    let cond: AchievementCondition
    try { cond = JSON.parse(ach.condition) } catch { continue }

    if (evaluateCondition(userId, cond)) {
      stmts.unlockAchievement.run({ user_id: userId, achievement_id: ach.id, unlocked_at: now })
      if (ach.reward_energy > 0) {
        stmts.upsertEnergy.run({ user_id: userId, energy: ach.reward_energy })
      }
      newlyUnlocked.push({ id: ach.id, name: ach.name, icon: ach.icon, reward_energy: ach.reward_energy })
    }
  }

  return newlyUnlocked
}

function evaluateCondition(userId: string, cond: AchievementCondition): boolean {
  switch (cond.type) {
    case 'total_keyboard': {
      const row = stmts.getTotalDailyInput.get({ user_id: userId }) as { total_keyboard: number }
      return row.total_keyboard >= (cond.target ?? 0)
    }
    case 'total_mouse': {
      const row = stmts.getTotalDailyInput.get({ user_id: userId }) as { total_mouse: number }
      return row.total_mouse >= (cond.target ?? 0)
    }
    case 'boxes_opened': {
      const row = stmts.getEnergy.get({ user_id: userId }) as { boxes_opened: number } | undefined
      return (row?.boxes_opened ?? 0) >= (cond.target ?? 0)
    }
    case 'distinct_items': {
      const row = stmts.countDistinctUserItems.get({ user_id: userId }) as { total: number }
      return row.total >= (cond.target ?? 0)
    }
    case 'consecutive_days': {
      const days = getConsecutiveStreak(userId)
      return days >= (cond.target ?? 0)
    }
    case 'complete_category': {
      const row = stmts.countUserItemsByCategory.get({
        user_id: userId, category: cond.category ?? ''
      }) as { owned: number; total: number }
      return row.total > 0 && row.owned >= row.total
    }
    case 'friend_count': {
      const row = stmts.countFriends.get({ user_id: userId }) as { total: number }
      return row.total >= (cond.target ?? 0)
    }
    case 'gifts_sent': {
      const row = stmts.countInteractionsSent.get({ user_id: userId, type: 'gift' }) as { total: number }
      return row.total >= (cond.target ?? 0)
    }
    case 'level_reached': {
      const info = getUserLevel(userId)
      return info.level >= (cond.target ?? 0)
    }
    default:
      return false
  }
}

function getConsecutiveStreak(userId: string): number {
  const rows = stmts.getConsecutiveDays.all({ user_id: userId }) as Array<{ date: string }>
  if (rows.length === 0) return 0

  let streak = 1
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].date)
    const curr = new Date(rows[i].date)
    const diffMs = prev.getTime() - curr.getTime()
    if (Math.abs(diffMs - 86400000) < 3600000) {
      streak++
    } else {
      break
    }
  }
  return streak
}
