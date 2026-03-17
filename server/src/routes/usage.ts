import { FastifyInstance } from 'fastify'
import { stmts } from '../db/index'

interface RangeQuery {
  Querystring: {
    start:      string
    end:        string
    device_id?: string
  }
}

interface WeeklyQuery {
  Querystring: {
    week_start: string   // unix seconds — Monday 00:00 local (frontend computes)
    device_id?: string
  }
}

function parseRange(startStr: string, endStr: string) {
  const start = Number(startStr)
  const end   = Number(endStr)
  return { start, end, valid: start > 0 && end > 0 && start < end }
}

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/usage/summary  →  [{app_name, total_duration}]
  app.get<RangeQuery>('/api/usage/summary', async (req, reply) => {
    const { start: s, end: e, device_id } = req.query
    const { start, end, valid } = parseRange(s, e)
    if (!valid) return reply.code(400).send({ error: 'Invalid start/end timestamps' })

    if (device_id && device_id !== 'all') {
      return stmts.getUsageByDevice.all({ device_id, start, end })
    }
    return stmts.getUsageAll.all({ start, end })
  })

  // GET /api/usage/timeline  →  [{device_id, app_name, app_title, start_time, end_time, duration}]
  app.get<RangeQuery>('/api/usage/timeline', async (req, reply) => {
    const { start: s, end: e, device_id } = req.query
    const { start, end, valid } = parseRange(s, e)
    if (!valid) return reply.code(400).send({ error: 'Invalid start/end timestamps' })

    if (device_id && device_id !== 'all') {
      return stmts.getTimelineByDevice.all({ device_id, start, end })
    }
    return stmts.getTimelineAll.all({ start, end })
  })

  // GET /api/usage/weekly  →  [{day_index, app_name, total_duration}]
  app.get<WeeklyQuery>('/api/usage/weekly', async (req, reply) => {
    const { week_start: ws, device_id } = req.query
    const weekStart = Number(ws)
    if (!weekStart) return reply.code(400).send({ error: 'Invalid week_start' })

    const weekEnd = weekStart + 7 * 86400

    if (device_id && device_id !== 'all') {
      return stmts.getWeeklyByDevice.all({ week_start: weekStart, week_end: weekEnd, device_id })
    }
    return stmts.getWeeklyAll.all({ week_start: weekStart, week_end: weekEnd })
  })
}
