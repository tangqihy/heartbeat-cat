import { FastifyInstance } from 'fastify'
import { readFileSync } from 'fs'
import path from 'path'
import { getUserResources, getDailyResourceStats, getDailyResourceStatsRange } from '../services/resources'
import { getIntensityMetrics } from '../services/intensity'
import { getFullConfig } from '../services/app-category'

let catalystConfigCache: unknown = null
function getCachedCatalystConfig(): unknown {
  if (!catalystConfigCache) {
    const p = path.resolve(__dirname, '../../data/catalyst-config.json')
    catalystConfigCache = JSON.parse(readFileSync(p, 'utf-8'))
  }
  return catalystConfigCache
}

function resolveUserId(req: { query: unknown; body: unknown }): string | null {
  const uid = (req.query as Record<string, string>).user_id
    ?? (req.body as Record<string, string> | null)?.user_id
  return uid || null
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function resourceRoutes(app: FastifyInstance): Promise<void> {

  app.get('/api/user/resources', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const resources = getUserResources(userId)
    return { resources }
  })

  app.get('/api/user/resources/daily', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const date = (req.query as Record<string, string>).date || todayStr()
    const stats = getDailyResourceStats(userId, date)
    return { date, stats }
  })

  app.get('/api/user/resources/range', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const q = req.query as Record<string, string>
    const startDate = q.start_date
    const endDate = q.end_date
    if (!startDate || !endDate) return reply.code(400).send({ error: 'start_date and end_date required' })
    const stats = getDailyResourceStatsRange(userId, startDate, endDate)
    return { stats }
  })

  app.get('/api/user/intensity', async (req, reply) => {
    const userId = resolveUserId(req)
    if (!userId) return reply.code(400).send({ error: 'user_id required' })
    const metrics = getIntensityMetrics(userId)
    return { metrics }
  })

  app.get('/api/app-categories', async () => {
    const config = getFullConfig()
    return {
      categories: config.categories,
      mappings: config.mappings,
    }
  })

  app.get('/api/catalyst-config', async () => {
    return getCachedCatalystConfig()
  })
}
