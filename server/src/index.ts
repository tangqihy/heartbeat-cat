import 'dotenv/config'
import Fastify        from 'fastify'
import cors           from '@fastify/cors'
import fastifyWs      from '@fastify/websocket'
import staticPlugin   from '@fastify/static'
import path           from 'path'
import { existsSync } from 'fs'
import { heartbeatRoutes } from './routes/heartbeat'
import { deviceRoutes }    from './routes/devices'
import { usageRoutes }     from './routes/usage'
import { bongoRoutes }     from './routes/bongo'
import { addUser, removeUser, handleMessage } from './ws/hub'
import { stmts } from './db/index'

const app = Fastify({ logger: true })

async function start(): Promise<void> {
  await app.register(cors, { origin: true })
  await app.register(fastifyWs)

  // API routes must be registered before static-file catch-all
  await app.register(heartbeatRoutes)
  await app.register(deviceRoutes)
  await app.register(usageRoutes)
  await app.register(bongoRoutes)

  // WebSocket endpoint for real-time Bongo Cat multiplayer
  app.get('/ws', { websocket: true }, (connection, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`)
    const userId = url.searchParams.get('user_id')
    if (!userId) {
      connection.socket.close(4001, 'user_id required')
      return
    }

    const user = stmts.getUserById.get({ id: userId }) as { display_name: string } | undefined
    if (!user) {
      connection.socket.close(4002, 'user not found')
      return
    }

    const ws = connection.socket
    addUser(userId, user.display_name, ws)
    app.log.info(`[ws] ${user.display_name} connected`)

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(String(raw))
        handleMessage(userId, msg)
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      removeUser(userId)
      app.log.info(`[ws] ${user.display_name} disconnected`)
    })
  })

  app.get('/health', async () => ({ ok: true, ts: Date.now() }))

  // Serve the built web frontend when web/dist exists.
  // Build it first:  cd ../web && npm run build
  const webDist = path.resolve(__dirname, '../../web/dist')
  if (existsSync(path.join(webDist, 'index.html'))) {
    await app.register(staticPlugin, { root: webDist, wildcard: false })
    // SPA fallback: non-API routes → index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html', webDist)
    })
    app.log.info(`Serving web frontend from ${webDist}`)
  }

  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen({ port, host })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
