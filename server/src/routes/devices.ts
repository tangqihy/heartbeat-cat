import { FastifyInstance } from 'fastify'
import { stmts } from '../db/index'

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/devices', async () => stmts.getDevices.all())
}
