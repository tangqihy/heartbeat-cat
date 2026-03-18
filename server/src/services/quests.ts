import { readFileSync } from 'fs'
import path from 'path'
import db, { stmts } from '../db/index'

interface QuestCondition {
  type: string
  target: number
  daily_min?: number
}

interface QuestRow {
  id: number
  user_id: string
  quest_id: string
  date: string
  target: number
  completed: number
  reward_claimed: number
  name: string
  description: string
  type: string
  condition: string
  reward_type: string
  reward_amount: number
  icon: string
}

export interface QuestInfo extends QuestRow {
  progress: number
}

// ── Seed quest templates + shop on import ──

function seedQuestTemplates(): void {
  const p = path.resolve(__dirname, '../../data/quest-templates.json')
  try {
    const raw = readFileSync(p, 'utf-8')
    const items = JSON.parse(raw) as Array<Record<string, unknown>>
    const tx = db.transaction(() => {
      for (const item of items) stmts.upsertQuestTemplate.run(item)
    })
    tx()
  } catch (err) {
    console.warn('[quests] failed to seed quest templates:', (err as Error).message)
  }
}

function seedQuestShop(): void {
  const p = path.resolve(__dirname, '../../data/quest-shop.json')
  try {
    const raw = readFileSync(p, 'utf-8')
    const items = JSON.parse(raw) as Array<Record<string, unknown>>
    const tx = db.transaction(() => {
      for (const item of items) stmts.upsertQuestShopItem.run(item)
    })
    tx()
  } catch (err) {
    console.warn('[quests] failed to seed quest shop:', (err as Error).message)
  }
}

seedQuestTemplates()
seedQuestShop()

// ── Date helpers ──

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dayOfWeek = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(monday), end: fmt(sunday) }
}

// ── Quest assignment ──

const DAILY_QUEST_COUNT = 3

function shufflePick<T>(arr: T[], count: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export function ensureDailyQuests(userId: string): void {
  const date = todayStr()
  const existing = stmts.getUserQuestsByDate.all({ user_id: userId, date }) as QuestRow[]
  const dailyExisting = existing.filter(q => q.type === 'daily')
  if (dailyExisting.length >= DAILY_QUEST_COUNT) return

  const templates = stmts.getQuestTemplatesByType.all({ type: 'daily' }) as Array<{
    id: string; condition: string
  }>
  const existingIds = new Set(dailyExisting.map(q => q.quest_id))
  const available = templates.filter(t => !existingIds.has(t.id))
  const picks = shufflePick(available, DAILY_QUEST_COUNT - dailyExisting.length)

  const tx = db.transaction(() => {
    for (const pick of picks) {
      let cond: QuestCondition
      try { cond = JSON.parse(pick.condition) } catch { continue }
      stmts.insertUserQuest.run({
        user_id: userId,
        quest_id: pick.id,
        date,
        target: cond.target,
      })
    }
  })
  tx()
}

export function ensureWeeklyQuest(userId: string): void {
  const { start } = getWeekRange()
  const existing = stmts.getUserQuestsByDate.all({ user_id: userId, date: start }) as QuestRow[]
  const weeklyExisting = existing.filter(q => q.type === 'weekly')
  if (weeklyExisting.length > 0) return

  const templates = stmts.getQuestTemplatesByType.all({ type: 'weekly' }) as Array<{
    id: string; condition: string
  }>
  if (templates.length === 0) return

  const pick = templates[Math.floor(Math.random() * templates.length)]
  let cond: QuestCondition
  try { cond = JSON.parse(pick.condition) } catch { return }

  stmts.insertUserQuest.run({
    user_id: userId,
    quest_id: pick.id,
    date: start,
    target: cond.target,
  })
}

// ── Quest progress evaluation ──

function evaluateQuestProgress(userId: string, condition: string): number {
  let cond: QuestCondition
  try { cond = JSON.parse(condition) } catch { return 0 }

  const date = todayStr()

  switch (cond.type) {
    case 'daily_keyboard': {
      const row = stmts.getDailyInput.get({ user_id: userId, date }) as
        { keyboard_count: number } | undefined
      return row?.keyboard_count ?? 0
    }
    case 'daily_mouse': {
      const row = stmts.getDailyInput.get({ user_id: userId, date }) as
        { mouse_count: number } | undefined
      return row?.mouse_count ?? 0
    }
    case 'daily_total': {
      const row = stmts.getDailyInput.get({ user_id: userId, date }) as
        { keyboard_count: number; mouse_count: number } | undefined
      return (row?.keyboard_count ?? 0) + (row?.mouse_count ?? 0)
    }
    case 'daily_box': {
      const row = stmts.getDailyActivity.get({ user_id: userId, date }) as
        { boxes_opened: number } | undefined
      return row?.boxes_opened ?? 0
    }
    case 'daily_craft': {
      const row = stmts.getDailyActivity.get({ user_id: userId, date }) as
        { crafts_done: number } | undefined
      return row?.crafts_done ?? 0
    }
    case 'daily_interact': {
      const row = stmts.getDailyActivity.get({ user_id: userId, date }) as
        { interactions_done: number } | undefined
      return row?.interactions_done ?? 0
    }
    case 'weekly_total': {
      const { start, end } = getWeekRange()
      const rows = stmts.getDailyInputRange.all({
        user_id: userId, start_date: start, end_date: end,
      }) as Array<{ keyboard_count: number; mouse_count: number }>
      return rows.reduce((sum, r) => sum + r.keyboard_count + r.mouse_count, 0)
    }
    case 'weekly_streak': {
      const dailyMin = cond.daily_min ?? 1000
      const { start, end } = getWeekRange()
      const rows = stmts.getDailyInputRange.all({
        user_id: userId, start_date: start, end_date: end,
      }) as Array<{ keyboard_count: number; mouse_count: number }>
      return rows.filter(r => (r.keyboard_count + r.mouse_count) >= dailyMin).length
    }
    default:
      return 0
  }
}

// ── Get active quests with computed progress ──

export function getActiveQuests(userId: string): QuestInfo[] {
  ensureDailyQuests(userId)
  ensureWeeklyQuest(userId)

  const date = todayStr()
  const { start } = getWeekRange()

  const daily = stmts.getUserQuestsByDate.all({ user_id: userId, date }) as QuestRow[]
  const weekly = date === start
    ? []
    : stmts.getUserQuestsByDate.all({ user_id: userId, date: start }) as QuestRow[]

  const allQuests = [...daily, ...weekly.filter(w => w.type === 'weekly')]
  const seen = new Set<number>()

  const result: QuestInfo[] = []
  for (const q of allQuests) {
    if (seen.has(q.id)) continue
    seen.add(q.id)

    const progress = evaluateQuestProgress(userId, q.condition)
    const completed = progress >= q.target
    if (completed && !q.completed) {
      stmts.markQuestCompleted.run({ id: q.id })
    }
    result.push({ ...q, progress, completed: completed ? 1 : q.completed })
  }

  return result
}

// ── Claim quest reward ──

export interface ClaimResult {
  ok: boolean
  error?: string
  reward_type?: string
  reward_amount?: number
  tokens?: number
}

export function claimQuestReward(userId: string, questRowId: number): ClaimResult {
  const quest = stmts.getUserQuestById.get({ id: questRowId, user_id: userId }) as QuestRow | undefined
  if (!quest) return { ok: false, error: 'Quest not found' }

  const progress = evaluateQuestProgress(userId, quest.condition)
  if (progress < quest.target) return { ok: false, error: 'Quest not completed' }
  if (quest.reward_claimed) return { ok: false, error: 'Already claimed' }

  stmts.markQuestCompleted.run({ id: questRowId })
  stmts.markQuestClaimed.run({ id: questRowId })

  if (quest.reward_type === 'energy') {
    stmts.upsertEnergy.run({ user_id: userId, energy: quest.reward_amount })
  } else if (quest.reward_type === 'token') {
    stmts.upsertTokens.run({ user_id: userId, amount: quest.reward_amount })
  }

  const tokenRow = stmts.getUserTokens.get({ user_id: userId }) as { tokens: number } | undefined
  return {
    ok: true,
    reward_type: quest.reward_type,
    reward_amount: quest.reward_amount,
    tokens: tokenRow?.tokens ?? 0,
  }
}

// ── Track daily activity ──

export function trackDailyActivity(
  userId: string,
  action: 'box' | 'craft' | 'interact',
): void {
  const date = todayStr()
  stmts.upsertDailyActivity.run({
    user_id: userId,
    date,
    boxes_inc: action === 'box' ? 1 : 0,
    crafts_inc: action === 'craft' ? 1 : 0,
    interactions_inc: action === 'interact' ? 1 : 0,
  })
}
