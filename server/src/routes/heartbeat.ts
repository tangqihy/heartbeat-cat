import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { stmts } from '../db/index'
import { handleHeartbeat, closeSession, IOS_TIMEOUT_SEC } from '../services/session'
import { accumulateEnergy } from '../services/energy'

interface InputEvents {
  keyboard: number
  mouse:    number
}

interface AiContext {
  activity_type?: 'work' | 'entertainment' | 'communication' | 'browsing' | 'creative' | 'other'
  description?:   string
  details?:       string
  apps_visible?:  string[]
  is_idle?:       boolean
}

interface HeartbeatBody {
  device_id:    string
  device_name:  string
  device_type?: string
  app_name:     string
  app_title?:   string
  timestamp?:   number
  // iOS Shortcuts sends 'open' when an app is launched, 'close' when it exits.
  // PC clients omit this field (continuous heartbeat model instead).
  event?:       'open' | 'close'
  input_events?: InputEvents
  ai_context?:   AiContext
}

async function authCheck(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = process.env.API_KEY
  if (!apiKey) return
  if (req.headers['authorization'] !== `Bearer ${apiKey}`) {
    await reply.code(401).send({ error: 'Unauthorized' })
    return
  }
}

export async function heartbeatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: HeartbeatBody }>(
    '/api/heartbeat',
    { preHandler: authCheck },
    async (req, reply) => {
      const {
        device_id,
        device_name,
        device_type = 'unknown',
        app_name,
        app_title,
        timestamp,
        event,
        input_events,
        ai_context,
      } = req.body

      if (!device_id || !device_name || !app_name) {
        return reply.code(400).send({ error: 'Missing required fields: device_id, device_name, app_name' })
      }

      const now = Math.floor(Date.now() / 1000)
      const ts = (typeof timestamp === 'number' && timestamp > 0) ? timestamp : now
      stmts.upsertDevice.run({ id: device_id, name: device_name, type: device_type, last_seen: ts })

      if (event === 'close') {
        closeSession(device_id, ts)
        return { ok: true }
      }

      const timeoutSec = device_type === 'ios' ? IOS_TIMEOUT_SEC : undefined

      try {
        handleHeartbeat(device_id, app_name, app_title ?? null, ts, input_events, timeoutSec)
      } catch (err) {
        app.log.error('[heartbeat] handleHeartbeat failed: %s', (err as Error).message)
      }

      try {
        accumulateEnergy(device_id, input_events)
      } catch (err) {
        app.log.error('[heartbeat] accumulateEnergy failed: %s', (err as Error).message)
      }

      if (ai_context) {
        try {
          stmts.insertSnapshot.run({
            device_id,
            timestamp:     ts,
            app_name,
            activity_type: ai_context.activity_type ?? null,
            description:   ai_context.description   ?? null,
            details:       ai_context.details        ?? null,
            apps_visible:  ai_context.apps_visible   ? JSON.stringify(ai_context.apps_visible) : null,
            is_idle:       ai_context.is_idle        ? 1 : 0,
          })
        } catch (err) {
          app.log.error('[heartbeat] insertSnapshot failed: %s', (err as Error).message)
        }
      }

      return { ok: true }
    },
  )
}
