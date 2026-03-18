import { stmts } from '../db/index'
import { addExperience, getUserSkillEffect } from './level'
import { broadcastToUser } from '../ws/hub'

interface InputEvents {
  keyboard: number
  mouse: number
}

export function accumulateEnergy(
  deviceId: string,
  inputEvents?: InputEvents,
): void {
  if (!inputEvents) return
  const kb = Number(inputEvents.keyboard) || 0
  const ms = Number(inputEvents.mouse) || 0
  const total = Math.max(0, Math.floor(kb + ms))
  if (total <= 0) return

  const row = stmts.getUserIdByDevice.get({ device_id: deviceId }) as { user_id: string | null } | undefined
  if (!row?.user_id) return

  const userId = row.user_id

  // Apply energy_boost skill: +5% per level
  const energyBoost = getUserSkillEffect(userId, 'energy_boost')
  const boostedEnergy = Math.floor(total * (1 + energyBoost / 100))
  stmts.upsertEnergy.run({ user_id: userId, energy: boostedEnergy })

  // Also accumulate XP (always 1:1 with raw input, not boosted)
  const levelResult = addExperience(userId, total)
  if (levelResult.leveled_up) {
    broadcastToUser(userId, {
      type: 'level_up',
      new_level: levelResult.new_level,
      skill_points_gained: levelResult.skill_points_gained,
    })
  }
}
