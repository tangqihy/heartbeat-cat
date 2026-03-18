import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import db, { stmts } from '../db/index'
import { checkAchievements } from '../services/achievements'
import { broadcastToUser } from '../ws/hub'
import { getUserSkillEffect, ensureLevel } from '../services/level'
import { trackDailyActivity } from '../services/quests'

// ── Config ──

const ENERGY_PER_BOX = 1000
const ALLOWANCE_INTERVAL = 30 * 60 // 30 minutes per slot
const MAX_ALLOWANCE = 48            // cap: 24 hours worth
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const
type Rarity = (typeof RARITY_ORDER)[number]

const DROP_WEIGHTS: Record<Rarity, number> = {
  common: 55,
  rare: 30,
  epic: 12,
  legendary: 3,
}

const CRAFT_COST = 10
const CRAFT_SAME_RATE = 0.80
const CRAFT_UP1_RATE = 0.18
// remaining 0.02 = up 2 tiers

// ── Helpers ──

function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return `MEOW-${code}`
}

function weightedRarityPick(rareBoost = 0): Rarity {
  const weights = { ...DROP_WEIGHTS }
  if (rareBoost > 0) {
    weights.rare += rareBoost
    weights.epic += Math.floor(rareBoost * 0.6)
    weights.legendary += Math.floor(rareBoost * 0.3)
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [rarity, w] of Object.entries(weights) as [Rarity, number][]) {
    r -= w
    if (r <= 0) return rarity
  }
  return 'common'
}

function pickRandomItem(rarity: Rarity): Record<string, unknown> | null {
  const items = stmts.getCatalogByRarity.all({ rarity }) as Record<string, unknown>[]
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r)
}

function clampRarity(idx: number): Rarity {
  return RARITY_ORDER[Math.min(idx, RARITY_ORDER.length - 1)]
}

function resolveUserId(req: FastifyRequest): string | null {
  const uid = (req.query as Record<string, string>).user_id
    ?? (req.body as Record<string, string> | null)?.user_id
  return uid || null
}

// ── Seed catalog on startup ──

function seedCatalog(): void {
  const catalogPath = path.resolve(__dirname, '../../data/item-catalog.json')
  try {
    const raw = readFileSync(catalogPath, 'utf-8')
    const items = JSON.parse(raw) as Array<{
      id: string; name: string; category: string; rarity: string; svg_ref: string
    }>
    const tx = db.transaction(() => {
      for (const item of items) {
        stmts.upsertCatalogItem.run(item)
      }
    })
    tx()
  } catch (err) {
    console.warn('[bongo] failed to seed item catalog:', (err as Error).message)
  }
}

seedCatalog()

function seedAchievements(): void {
  const achPath = path.resolve(__dirname, '../../data/achievements.json')
  try {
    const raw = readFileSync(achPath, 'utf-8')
    const items = JSON.parse(raw) as Array<{
      id: string; name: string; description: string; icon: string
      category: string; condition: string; reward_energy: number
    }>
    const tx = db.transaction(() => {
      for (const a of items) stmts.upsertAchievement.run(a)
    })
    tx()
  } catch (err) {
    console.warn('[bongo] failed to seed achievements:', (err as Error).message)
  }
}

seedAchievements()

// ── Routes ──

export async function bongoRoutes(app: FastifyInstance): Promise<void> {

  /** Compute & persist time-accrued open slots for a user. */
  function refreshAllowance(userId: string): { open_allowance: number; next_open_in: number; effective_interval: number } {
    const cdReduce = getUserSkillEffect(userId, 'cooldown_reduce')
    const effectiveInterval = Math.max(60, Math.floor(ALLOWANCE_INTERVAL * (1 - cdReduce / 100)))

    const row = stmts.getEnergy.get({ user_id: userId }) as
      { open_allowance: number; last_allowance_ts: number } | undefined
    if (!row) return { open_allowance: 0, next_open_in: effectiveInterval, effective_interval: effectiveInterval }

    const now = Math.floor(Date.now() / 1000)
    let { open_allowance, last_allowance_ts } = row

    if (last_allowance_ts === 0) {
      stmts.updateAllowance.run({ user_id: userId, open_allowance: 1, last_allowance_ts: now })
      return { open_allowance: 1, next_open_in: effectiveInterval, effective_interval: effectiveInterval }
    }

    const elapsed = now - last_allowance_ts
    const newSlots = Math.floor(elapsed / effectiveInterval)
    if (newSlots > 0) {
      open_allowance = Math.min(open_allowance + newSlots, MAX_ALLOWANCE)
      last_allowance_ts += newSlots * effectiveInterval
      stmts.updateAllowance.run({ user_id: userId, open_allowance, last_allowance_ts })
    }

    const timeSinceLastSlot = now - last_allowance_ts
    const next_open_in = open_allowance > 0 ? 0 : Math.max(0, effectiveInterval - timeSinceLastSlot)
    return { open_allowance, next_open_in, effective_interval: effectiveInterval }
  }

  function triggerAchievementCheck(userId: string): void {
    try {
      const unlocked = checkAchievements(userId)
      for (const ach of unlocked) {
        broadcastToUser(userId, {
          type: 'achievement_unlocked',
          achievement: ach,
        })
      }
    } catch (err) {
      app.log.error('[achievements] check failed: %s', (err as Error).message)
    }
  }

  // ── User registration ──
  app.post<{ Body: { device_id: string; display_name: string; cat_color?: string } }>(
    '/api/user/register',
    async (req, reply) => {
      const { device_id, display_name, cat_color } = req.body
      if (!device_id || !display_name) {
        return reply.code(400).send({ error: 'device_id and display_name required' })
      }

      const existing = stmts.getUserIdByDevice.get({ device_id }) as { user_id: string | null } | undefined
      if (existing?.user_id) {
        const user = stmts.getUserById.get({ id: existing.user_id })
        return { ok: true, user, existing: true }
      }

      let friendCode: string
      for (let attempts = 0; ; attempts++) {
        friendCode = generateFriendCode()
        try {
          const id = randomUUID()
          const now = Math.floor(Date.now() / 1000)
          stmts.insertUser.run({
            id,
            friend_code: friendCode,
            display_name,
            cat_color: cat_color ?? '#f5f5f5',
            created_at: now,
          })
          stmts.bindDeviceToUser.run({ user_id: id, device_id })
          stmts.upsertEnergy.run({ user_id: id, energy: 0 })
          ensureLevel(id)

          const user = stmts.getUserById.get({ id })
          return { ok: true, user, existing: false }
        } catch (e) {
          if (attempts > 10) return reply.code(500).send({ error: 'Failed to generate unique friend code' })
        }
      }
    },
  )

  // ── User profile ──
  app.get('/api/user/profile', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const user = stmts.getUserById.get({ id: userId })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    const energy = stmts.getEnergy.get({ user_id: userId }) ?? { energy: 0, boxes_opened: 0 }
    const equipped = stmts.getEquipped.all({ user_id: userId })
    return { user, energy, equipped, energy_per_box: ENERGY_PER_BOX }
  })

  // ── Energy status ──
  app.get('/api/user/energy', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const row = stmts.getEnergy.get({ user_id: userId }) as
      { energy: number; boxes_opened: number } | undefined
    if (!row) return reply.code(404).send({ error: 'User not found' })

    const allowance = refreshAllowance(userId)
    const energyBoxes = Math.floor(row.energy / ENERGY_PER_BOX)
    const canOpen = Math.min(energyBoxes, allowance.open_allowance)

    return {
      energy: row.energy,
      energy_per_box: ENERGY_PER_BOX,
      available_boxes: canOpen,
      energy_boxes: energyBoxes,
      progress: row.energy % ENERGY_PER_BOX,
      boxes_opened: row.boxes_opened,
      open_allowance: allowance.open_allowance,
      next_open_in: allowance.next_open_in,
      allowance_interval: allowance.effective_interval,
    }
  })

  // ── Open treasure box ──
  app.post<{ Body: { user_id: string } }>(
    '/api/box/open',
    async (req, reply) => {
      const { user_id } = req.body
      if (!user_id) return reply.code(400).send({ error: 'user_id required' })

      // Refresh time-based allowance before the transaction
      const allowance = refreshAllowance(user_id)
      if (allowance.open_allowance <= 0) {
        return reply.code(429).send({
          error: 'No open slots available',
          next_open_in: allowance.next_open_in,
          allowance_interval: ALLOWANCE_INTERVAL,
        })
      }

      const rareBoost = getUserSkillEffect(user_id, 'rare_boost')
      const rarity = weightedRarityPick(rareBoost)
      const item = pickRandomItem(rarity)
      if (!item) return reply.code(500).send({ error: 'No items in catalog for rarity: ' + rarity })

      const now = Math.floor(Date.now() / 1000)
      const txResult = db.transaction(() => {
        const row = stmts.getEnergy.get({ user_id }) as { energy: number } | undefined
        if (!row) return { error: 'not_found' as const }
        if (row.energy < ENERGY_PER_BOX) {
          return { error: 'not_enough' as const, energy: row.energy }
        }
        stmts.setEnergy.run({ user_id, energy: row.energy - ENERGY_PER_BOX })
        stmts.incrementBoxesOpened.run({ user_id, now })
        stmts.upsertUserItem.run({ user_id, item_id: item.id as string, obtained_at: now })
        return { ok: true as const }
      })()

      if ('error' in txResult) {
        if (txResult.error === 'not_found') return reply.code(404).send({ error: 'User not found' })
        return reply.code(400).send({ error: 'Not enough energy', energy: txResult.energy, required: ENERGY_PER_BOX })
      }

      trackDailyActivity(user_id, 'box')
      const updatedEnergy = stmts.getEnergy.get({ user_id })
      triggerAchievementCheck(user_id)
      return { ok: true, item, energy: updatedEnergy }
    },
  )

  // ── Craft (10 items → 1 random, chance to upgrade rarity) ──
  app.post<{ Body: { user_id: string; item_ids: Array<{ item_id: string; count: number }> } }>(
    '/api/items/craft',
    async (req, reply) => {
      const { user_id, item_ids } = req.body
      if (!user_id || !item_ids) return reply.code(400).send({ error: 'user_id and item_ids required' })
      if (!Array.isArray(item_ids)) return reply.code(400).send({ error: 'item_ids must be an array' })

      const totalCount = item_ids.reduce((sum, e) => sum + (Number(e.count) || 0), 0)
      if (totalCount < CRAFT_COST) {
        return reply.code(400).send({ error: `Need ${CRAFT_COST} items, got ${totalCount}` })
      }

      // Apply craft_boost skill to upgrade chances
      const craftBoost = getUserSkillEffect(user_id, 'craft_boost')
      const effectiveCraftUp1 = CRAFT_UP1_RATE + craftBoost / 100
      const roll = Math.random()

      const txResult = db.transaction(() => {
        // Validate ownership inside transaction to prevent TOCTOU
        let maxRarityIdx = 0
        for (const { item_id, count } of item_ids) {
          if (!item_id || count <= 0) continue
          const owned = stmts.getUserItem.get({ user_id, item_id }) as { quantity: number } | undefined
          if (!owned || owned.quantity < count) {
            return { error: `Not enough of item ${item_id}` as const }
          }
          const catalogItem = stmts.getCatalogItem.get({ id: item_id }) as { rarity: string } | undefined
          if (catalogItem) {
            maxRarityIdx = Math.max(maxRarityIdx, rarityIndex(catalogItem.rarity as Rarity))
          }
        }

        let outputRarityIdx: number
        const sameRate = Math.max(0, CRAFT_SAME_RATE - craftBoost / 100)
        if (roll < sameRate) {
          outputRarityIdx = maxRarityIdx
        } else if (roll < sameRate + effectiveCraftUp1) {
          outputRarityIdx = maxRarityIdx + 1
        } else {
          outputRarityIdx = maxRarityIdx + 2
        }
        const outputRarity = clampRarity(outputRarityIdx)
        const resultItem = pickRandomItem(outputRarity)
        if (!resultItem) return { error: `No items for rarity ${outputRarity}` as const }

        // Consume input items
        let remaining = CRAFT_COST
        for (const { item_id, count } of item_ids) {
          const consume = Math.min(count, remaining)
          if (consume <= 0) continue
          stmts.decrementUserItem.run({ user_id, item_id, amount: consume })
          stmts.deleteUserItem.run({ user_id, item_id })
          remaining -= consume
          if (remaining <= 0) break
        }

        const now = Math.floor(Date.now() / 1000)
        stmts.upsertUserItem.run({ user_id, item_id: resultItem.id as string, obtained_at: now })

        return {
          ok: true as const,
          item: resultItem,
          upgraded: outputRarityIdx > maxRarityIdx,
          input_rarity: RARITY_ORDER[maxRarityIdx],
          output_rarity: outputRarity,
        }
      })()

      if ('error' in txResult) {
        return reply.code(400).send({ error: txResult.error })
      }

      trackDailyActivity(user_id, 'craft')
      triggerAchievementCheck(user_id)
      return txResult
    },
  )

  // ── Item catalog ──
  app.get('/api/items/catalog', async () => {
    return stmts.getCatalog.all()
  })

  // ── User inventory ──
  app.get('/api/items/inventory', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    return stmts.getUserItems.all({ user_id: userId })
  })

  // ── Equip / unequip ──
  const VALID_SLOTS = new Set(['hat', 'glasses', 'scarf', 'accessory', 'color', 'keyboard'])

  app.post<{ Body: { user_id: string; slot: string; item_id?: string } }>(
    '/api/items/equip',
    async (req, reply) => {
      const { user_id, slot, item_id } = req.body
      if (!user_id || !slot) return reply.code(400).send({ error: 'user_id and slot required' })
      if (!VALID_SLOTS.has(slot)) return reply.code(400).send({ error: `Invalid slot: ${slot}` })

      if (!item_id) {
        stmts.unequipSlot.run({ user_id, slot })
        return { ok: true, action: 'unequip', slot }
      }

      const catalogItem = stmts.getCatalogItem.get({ id: item_id }) as { category: string } | undefined
      if (!catalogItem) return reply.code(404).send({ error: 'Item not found' })

      if (catalogItem.category !== slot && catalogItem.category !== 'color') {
        return reply.code(400).send({ error: `Item category ${catalogItem.category} does not match slot ${slot}` })
      }

      const owned = stmts.getUserItem.get({ user_id, item_id }) as { quantity: number } | undefined
      if (!owned || owned.quantity <= 0) {
        return reply.code(400).send({ error: 'You do not own this item' })
      }

      stmts.equipItem.run({ user_id, slot, item_id })
      const equipped = stmts.getEquipped.all({ user_id })
      return { ok: true, action: 'equip', slot, item_id, equipped }
    },
  )

  // ── Friends: add by friend code ──
  app.post<{ Body: { user_id: string; friend_code: string } }>(
    '/api/friends/add',
    async (req, reply) => {
      const { user_id, friend_code } = req.body
      if (!user_id || !friend_code) {
        return reply.code(400).send({ error: 'user_id and friend_code required' })
      }

      const self = stmts.getUserById.get({ id: user_id }) as { friend_code: string } | undefined
      if (!self) return reply.code(404).send({ error: 'User not found' })
      if (self.friend_code === friend_code) {
        return reply.code(400).send({ error: 'Cannot add yourself' })
      }

      const target = stmts.getUserByFriendCode.get({ friend_code }) as { id: string } | undefined
      if (!target) return reply.code(404).send({ error: 'Friend code not found' })

      const already = stmts.isFriend.get({ user_id, friend_id: target.id })
      if (already) return reply.code(400).send({ error: 'Already friends' })

      const now = Math.floor(Date.now() / 1000)
      const tx = db.transaction(() => {
        stmts.addFriend.run({ user_id, friend_id: target.id, added_at: now })
        stmts.addFriend.run({ user_id: target.id, friend_id: user_id, added_at: now })
      })
      tx()

      triggerAchievementCheck(user_id)
      return { ok: true, friend_id: target.id }
    },
  )

  // ── Friends: list ──
  app.get('/api/friends/list', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })

    const rows = stmts.getFriends.all({ user_id: userId }) as Array<{
      friend_id: string; added_at: number; display_name: string
      friend_code: string; cat_color: string; created_at: number
    }>

    const now = Math.floor(Date.now() / 1000)
    const ONLINE_THRESHOLD = 60

    const friends = rows.map(row => {
      const lastSeen = stmts.getLastSeenByUser.get({ user_id: row.friend_id }) as { last_seen: number | null } | undefined
      const online = lastSeen?.last_seen ? (now - lastSeen.last_seen) < ONLINE_THRESHOLD : false
      const equipped = stmts.getEquipped.all({ user_id: row.friend_id })
      return {
        id: row.friend_id,
        display_name: row.display_name,
        friend_code: row.friend_code,
        cat_color: row.cat_color,
        online,
        last_seen: lastSeen?.last_seen ?? null,
        equipped,
        added_at: row.added_at,
      }
    })

    return friends
  })

  // ── Friends: remove ──
  app.delete<{ Body: { user_id: string; friend_id: string } }>(
    '/api/friends/remove',
    async (req, reply) => {
      const { user_id, friend_id } = req.body
      if (!user_id || !friend_id) {
        return reply.code(400).send({ error: 'user_id and friend_id required' })
      }

      const tx = db.transaction(() => {
        stmts.removeFriend.run({ user_id, friend_id })
        stmts.removeFriend.run({ user_id: friend_id, friend_id: user_id })
      })
      tx()

      return { ok: true }
    },
  )

  // ── Friend's profile (public view) ──
  app.get('/api/friends/profile', async (req, reply) => {
    const friendId = (req.query as Record<string, string>).friend_id
    if (!friendId) return reply.code(400).send({ error: 'friend_id required' })

    const user = stmts.getUserById.get({ id: friendId }) as Record<string, unknown> | undefined
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const equipped = stmts.getEquipped.all({ user_id: friendId })
    const energy = stmts.getEnergy.get({ user_id: friendId }) as { boxes_opened: number } | undefined
    const lastSeen = stmts.getLastSeenByUser.get({ user_id: friendId }) as { last_seen: number | null } | undefined
    const now = Math.floor(Date.now() / 1000)

    return {
      user,
      equipped,
      boxes_opened: energy?.boxes_opened ?? 0,
      online: lastSeen?.last_seen ? (now - lastSeen.last_seen) < 60 : false,
      last_seen: lastSeen?.last_seen ?? null,
    }
  })

  // ── Daily input stats ──

  function todayDateStr(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  app.get('/api/user/daily-input', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const date = (req.query as Record<string, string>).date || todayDateStr()
    const row = stmts.getDailyInput.get({ user_id: userId, date }) as
      { keyboard_count: number; mouse_count: number } | undefined
    return {
      date,
      keyboard: row?.keyboard_count ?? 0,
      mouse: row?.mouse_count ?? 0,
    }
  })

  app.post<{ Body: { user_id: string; keyboard: number; mouse: number } }>(
    '/api/user/daily-input',
    async (req, reply) => {
      const { user_id, keyboard, mouse } = req.body
      if (!user_id) return reply.code(400).send({ error: 'user_id required' })
      const kb = Math.max(0, Math.floor(Number(keyboard) || 0))
      const ms = Math.max(0, Math.floor(Number(mouse) || 0))
      if (kb === 0 && ms === 0) return { ok: true }
      const date = todayDateStr()
      stmts.upsertDailyInput.run({ user_id, date, keyboard: kb, mouse: ms })
      const row = stmts.getDailyInput.get({ user_id, date }) as
        { keyboard_count: number; mouse_count: number } | undefined
      triggerAchievementCheck(user_id)
      return {
        ok: true,
        date,
        keyboard: row?.keyboard_count ?? kb,
        mouse: row?.mouse_count ?? ms,
      }
    },
  )

  // ── Achievements API ──

  app.get('/api/achievements/catalog', async () => {
    return stmts.getAchievementCatalog.all()
  })

  app.get('/api/achievements/user', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    return stmts.getUserAchievements.all({ user_id: userId })
  })

  app.get('/api/achievements/progress', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })

    const totals = stmts.getTotalDailyInput.get({ user_id: userId }) as { total_keyboard: number; total_mouse: number }
    const energy = stmts.getEnergy.get({ user_id: userId }) as { boxes_opened: number } | undefined
    const items = stmts.countDistinctUserItems.get({ user_id: userId }) as { total: number }
    const friends = stmts.countFriends.get({ user_id: userId }) as { total: number }
    const gifts = stmts.countInteractionsSent.get({ user_id: userId, type: 'gift' }) as { total: number }
    const days = stmts.countActiveDays.get({ user_id: userId }) as { total: number }

    return {
      total_keyboard: totals.total_keyboard,
      total_mouse: totals.total_mouse,
      boxes_opened: energy?.boxes_opened ?? 0,
      distinct_items: items.total,
      friend_count: friends.total,
      gifts_sent: gifts.total,
      active_days: days.total,
    }
  })

  // ── Leaderboard API ──

  app.get('/api/leaderboard/daily', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const date = (req.query as Record<string, string>).date || todayDateStr()
    return stmts.getLeaderboardDaily.all({ user_id: userId, date })
  })

  app.get('/api/leaderboard/weekly', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })

    const now = new Date()
    const dayOfWeek = now.getDay() || 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    return stmts.getLeaderboardWeekly.all({
      user_id: userId,
      start_date: fmt(monday),
      end_date: fmt(sunday),
    })
  })

  // ── Interactions API ──

  const BASE_FISH_LIMIT = 5
  const BASE_PET_LIMIT = 10

  app.post<{ Body: { from_user: string; to_user: string; type: string; item_id?: string } }>(
    '/api/interact',
    async (req, reply) => {
      const { from_user, to_user, type, item_id } = req.body
      if (!from_user || !to_user || !type) {
        return reply.code(400).send({ error: 'from_user, to_user and type required' })
      }
      if (!['fish', 'gift', 'pet'].includes(type)) {
        return reply.code(400).send({ error: 'Invalid interaction type' })
      }

      const areFriends = stmts.isFriend.get({ user_id: from_user, friend_id: to_user })
      if (!areFriends) return reply.code(400).send({ error: 'Not friends' })

      const date = todayDateStr()
      const limits = stmts.getDailyInteractionLimits.get({ user_id: from_user, date }) as
        { fish_count: number; pet_count: number } | undefined

      const interactBonus = getUserSkillEffect(from_user, 'interact_limit')
      const fishLimit = BASE_FISH_LIMIT + interactBonus
      const petLimit = BASE_PET_LIMIT + interactBonus

      if (type === 'fish') {
        if ((limits?.fish_count ?? 0) >= fishLimit) {
          return reply.code(429).send({ error: 'Daily fish limit reached', limit: fishLimit })
        }
      }
      if (type === 'pet') {
        if ((limits?.pet_count ?? 0) >= petLimit) {
          return reply.code(429).send({ error: 'Daily pet limit reached', limit: petLimit })
        }
      }

      const now = Math.floor(Date.now() / 1000)

      if (type === 'gift') {
        if (!item_id) return reply.code(400).send({ error: 'item_id required for gift' })
        const owned = stmts.getUserItem.get({ user_id: from_user, item_id }) as { quantity: number } | undefined
        if (!owned || owned.quantity <= 0) {
          return reply.code(400).send({ error: 'You do not own this item' })
        }
        const giftLuck = getUserSkillEffect(from_user, 'gift_luck')
        const keepItem = Math.random() * 100 < giftLuck
        db.transaction(() => {
          if (!keepItem) {
            stmts.decrementUserItem.run({ user_id: from_user, item_id, amount: 1 })
            stmts.deleteUserItem.run({ user_id: from_user, item_id })
          }
          stmts.upsertUserItem.run({ user_id: to_user, item_id, obtained_at: now })
        })()
      }

      stmts.insertInteraction.run({ from_user, to_user, type, item_id: item_id ?? null, created_at: now })

      if (type === 'fish') {
        stmts.upsertDailyInteraction.run({ user_id: from_user, date, fish_inc: 1, pet_inc: 0 })
      } else if (type === 'pet') {
        stmts.upsertDailyInteraction.run({ user_id: from_user, date, fish_inc: 0, pet_inc: 1 })
      }

      trackDailyActivity(from_user, 'interact')

      const fromUser = stmts.getUserById.get({ id: from_user }) as { display_name: string } | undefined
      broadcastToUser(to_user, {
        type: 'interaction',
        interaction_type: type,
        from_user,
        from_name: fromUser?.display_name ?? 'Someone',
        item_id: item_id ?? null,
      })

      triggerAchievementCheck(from_user)
      return { ok: true, type }
    },
  )

  // ── Stats API (for Web dashboard) ──

  app.get('/api/stats/heatmap', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    return stmts.getAllDailyInputForUser.all({ user_id: userId })
  })

  app.get('/api/stats/input-trend', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const days = parseInt((req.query as Record<string, string>).days ?? '30') || 30

    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    return stmts.getDailyInputRange.all({
      user_id: userId,
      start_date: fmt(start),
      end_date: fmt(end),
    })
  })

  // ── Item SVG content ──
  const SVG_REF_PATTERN = /^[a-zA-Z0-9_-]+\.svg$/

  app.get<{ Params: { svg_ref: string } }>(
    '/api/items/svg/:svg_ref',
    async (req, reply) => {
      const { svg_ref } = req.params
      if (!svg_ref || !SVG_REF_PATTERN.test(svg_ref)) {
        return reply.code(400).send({ error: 'Invalid svg_ref' })
      }
      const itemsDir = path.resolve(__dirname, '../../data/items')
      const svgPath = path.join(itemsDir, svg_ref)
      if (!svgPath.startsWith(itemsDir) || !existsSync(svgPath)) {
        return reply.code(404).send({ error: 'SVG not found' })
      }
      const content = readFileSync(svgPath, 'utf-8')
      return reply.type('image/svg+xml').send(content)
    },
  )
}
