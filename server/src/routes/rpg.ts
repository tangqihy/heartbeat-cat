import { FastifyInstance } from 'fastify'
import db, { stmts } from '../db/index'
import {
  getUserLevel, getSkillTreeConfig, upgradeSkill,
  getUserSkillLevel, ensureLevel,
  getUnlockedSystems, getSystemUnlockConfig,
} from '../services/level'
import {
  getActiveQuests, claimQuestReward,
} from '../services/quests'

function resolveUserId(req: { query: unknown; body: unknown }): string | null {
  const uid = (req.query as Record<string, string>).user_id
    ?? (req.body as Record<string, string> | null)?.user_id
  return uid || null
}

export async function rpgRoutes(app: FastifyInstance): Promise<void> {

  // ── Level ──

  app.get('/api/user/level', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const info = getUserLevel(userId)
    return { ...info, unlocked_systems: getUnlockedSystems(info.level) }
  })

  app.get('/api/system-unlock-config', async () => {
    return getSystemUnlockConfig()
  })

  // ── Skill tree config ──

  app.get('/api/skills/tree', async () => {
    return getSkillTreeConfig()
  })

  // ── User skills ──

  app.get('/api/user/skills', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })

    const skills = stmts.getUserSkills.all({ user_id: userId }) as Array<{
      skill_id: string; level: number
    }>
    const levelInfo = getUserLevel(userId)
    return { skills, skill_points: levelInfo.skill_points }
  })

  // ── Upgrade skill ──

  app.post<{ Body: { user_id: string; skill_id: string } }>(
    '/api/user/skill/upgrade',
    async (req, reply) => {
      const { user_id, skill_id } = req.body
      if (!user_id || !skill_id) {
        return reply.code(400).send({ error: 'user_id and skill_id required' })
      }

      const result = upgradeSkill(user_id, skill_id)
      if (!result.ok) {
        return reply.code(400).send({ error: result.error })
      }
      return result
    },
  )

  // ── Active quests ──

  app.get('/api/quests/active', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })

    const quests = getActiveQuests(userId)
    const tokenRow = stmts.getUserTokens.get({ user_id: userId }) as { tokens: number } | undefined
    return {
      quests,
      tokens: tokenRow?.tokens ?? 0,
    }
  })

  // ── Claim quest reward ──

  app.post<{ Body: { user_id: string; quest_id: number } }>(
    '/api/quests/claim',
    async (req, reply) => {
      const { user_id, quest_id } = req.body
      if (!user_id || quest_id == null) {
        return reply.code(400).send({ error: 'user_id and quest_id required' })
      }

      const result = claimQuestReward(user_id, quest_id)
      if (!result.ok) {
        return reply.code(400).send({ error: result.error })
      }
      return result
    },
  )

  // ── Quest shop ──

  app.get('/api/quest/shop', async () => {
    return stmts.getQuestShop.all()
  })

  app.post<{ Body: { user_id: string; shop_item_id: string } }>(
    '/api/quest/shop/buy',
    async (req, reply) => {
      const { user_id, shop_item_id } = req.body
      if (!user_id || !shop_item_id) {
        return reply.code(400).send({ error: 'user_id and shop_item_id required' })
      }

      const shopItem = stmts.getQuestShopItem.get({ id: shop_item_id }) as {
        id: string; item_id: string; cost: number; stock: number
        name: string; category: string; rarity: string; svg_ref: string
      } | undefined
      if (!shopItem) return reply.code(404).send({ error: 'Shop item not found' })

      if (shopItem.stock === 0) {
        return reply.code(400).send({ error: 'Out of stock' })
      }

      const tokenRow = stmts.getUserTokens.get({ user_id }) as { tokens: number } | undefined
      const tokens = tokenRow?.tokens ?? 0
      if (tokens < shopItem.cost) {
        return reply.code(400).send({ error: 'Not enough tokens', tokens, cost: shopItem.cost })
      }

      const now = Math.floor(Date.now() / 1000)
      const tx = db.transaction(() => {
        stmts.setTokens.run({ user_id, tokens: tokens - shopItem.cost })
        stmts.upsertUserItem.run({ user_id, item_id: shopItem.item_id, obtained_at: now })
        if (shopItem.stock > 0) {
          // Decrement stock (only if not unlimited=-1)
          db.prepare(`UPDATE quest_shop SET stock = stock - 1 WHERE id = @id`).run({ id: shop_item_id })
        }
      })
      tx()

      return {
        ok: true,
        item: {
          id: shopItem.item_id,
          name: shopItem.name,
          category: shopItem.category,
          rarity: shopItem.rarity,
          svg_ref: shopItem.svg_ref,
        },
        tokens: tokens - shopItem.cost,
      }
    },
  )

  // ── User tokens ──

  app.get('/api/user/tokens', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const row = stmts.getUserTokens.get({ user_id: userId }) as { tokens: number } | undefined
    return { tokens: row?.tokens ?? 0 }
  })
}
