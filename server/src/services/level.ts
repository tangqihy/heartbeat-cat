import { stmts } from '../db/index'
import { readFileSync } from 'fs'
import path from 'path'

// XP needed to go from level N to N+1 = N * 100
export function xpForLevel(level: number): number {
  return level * 100
}

export function totalXpForLevel(level: number): number {
  // sum(i*100, i=1..level-1) = 100 * level * (level-1) / 2
  return 100 * level * (level - 1) / 2
}

export const MAX_LEVEL = 99

export interface LevelInfo {
  level: number
  experience: number
  total_experience: number
  skill_points: number
  xp_to_next: number
  xp_progress_pct: number
}

export function ensureLevel(userId: string): void {
  stmts.initLevel.run({ user_id: userId })
}

export function getUserLevel(userId: string): LevelInfo {
  ensureLevel(userId)
  const row = stmts.getUserLevel.get({ user_id: userId }) as {
    level: number; experience: number; total_experience: number; skill_points: number
  }
  const xpNeeded = row.level >= MAX_LEVEL ? 0 : xpForLevel(row.level)
  return {
    level: row.level,
    experience: row.experience,
    total_experience: row.total_experience,
    skill_points: row.skill_points,
    xp_to_next: xpNeeded,
    xp_progress_pct: xpNeeded > 0 ? Math.min(100, (row.experience / xpNeeded) * 100) : 100,
  }
}

export interface LevelUpResult {
  leveled_up: boolean
  new_level: number
  skill_points_gained: number
  xp_added: number
}

export function addExperience(userId: string, amount: number): LevelUpResult {
  ensureLevel(userId)
  const row = stmts.getUserLevel.get({ user_id: userId }) as {
    level: number; experience: number; total_experience: number; skill_points: number
  }

  let { level, experience, total_experience, skill_points } = row
  experience += amount
  total_experience += amount

  let levelsGained = 0
  while (level < MAX_LEVEL && experience >= xpForLevel(level)) {
    experience -= xpForLevel(level)
    level++
    skill_points++
    levelsGained++
  }

  stmts.updateLevel.run({ user_id: userId, level, experience, total_experience, skill_points })

  return {
    leveled_up: levelsGained > 0,
    new_level: level,
    skill_points_gained: levelsGained,
    xp_added: amount,
  }
}

// ── Skill tree config ──

interface SkillDef {
  id: string
  name: string
  description: string
  max_level: number
  effect_per_level: number
}

interface BranchDef {
  id: string
  name: string
  icon: string
  skills: SkillDef[]
}

interface SkillTreeConfig {
  branches: BranchDef[]
}

let skillTreeConfig: SkillTreeConfig | null = null

export function getSkillTreeConfig(): SkillTreeConfig {
  if (!skillTreeConfig) {
    const p = path.resolve(__dirname, '../../data/skill-tree.json')
    skillTreeConfig = JSON.parse(readFileSync(p, 'utf-8'))
  }
  return skillTreeConfig!
}

export function getSkillDef(skillId: string): SkillDef | null {
  const config = getSkillTreeConfig()
  for (const branch of config.branches) {
    const skill = branch.skills.find(s => s.id === skillId)
    if (skill) return skill
  }
  return null
}

export function getUserSkillLevel(userId: string, skillId: string): number {
  const row = stmts.getSkillLevel.get({ user_id: userId, skill_id: skillId }) as { level: number } | undefined
  return row?.level ?? 0
}

export function getUserSkillEffect(userId: string, skillId: string): number {
  const def = getSkillDef(skillId)
  if (!def) return 0
  const level = getUserSkillLevel(userId, skillId)
  return level * def.effect_per_level
}

export interface SkillUpResult {
  ok: boolean
  error?: string
  skill_id?: string
  new_level?: number
  remaining_points?: number
}

export function upgradeSkill(userId: string, skillId: string): SkillUpResult {
  const def = getSkillDef(skillId)
  if (!def) return { ok: false, error: 'Unknown skill' }

  ensureLevel(userId)
  const levelRow = stmts.getUserLevel.get({ user_id: userId }) as {
    level: number; experience: number; total_experience: number; skill_points: number
  }

  if (levelRow.skill_points <= 0) {
    return { ok: false, error: 'No skill points available' }
  }

  const currentLevel = getUserSkillLevel(userId, skillId)
  if (currentLevel >= def.max_level) {
    return { ok: false, error: 'Skill already at max level' }
  }

  const newLevel = currentLevel + 1
  stmts.upsertSkill.run({ user_id: userId, skill_id: skillId, level: newLevel })
  stmts.updateLevel.run({
    user_id: userId,
    level: levelRow.level,
    experience: levelRow.experience,
    total_experience: levelRow.total_experience,
    skill_points: levelRow.skill_points - 1,
  })

  return {
    ok: true,
    skill_id: skillId,
    new_level: newLevel,
    remaining_points: levelRow.skill_points - 1,
  }
}
