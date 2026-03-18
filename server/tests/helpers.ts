import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import db, { stmts } from '../src/db/index'
import { heartbeatRoutes } from '../src/routes/heartbeat'
import { deviceRoutes } from '../src/routes/devices'
import { usageRoutes } from '../src/routes/usage'
import { bongoRoutes } from '../src/routes/bongo'
import { rpgRoutes } from '../src/routes/rpg'
import { resourceRoutes } from '../src/routes/resources'

// Disable API_KEY auth for tests
delete process.env.API_KEY

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(heartbeatRoutes)
  await app.register(deviceRoutes)
  await app.register(usageRoutes)
  await app.register(bongoRoutes)
  await app.register(rpgRoutes)
  await app.register(resourceRoutes)
  app.get('/health', async () => ({ ok: true, ts: Date.now() }))
  await app.ready()
  return app
}

export function cleanUserData(): void {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    DELETE FROM user_achievements;
    DELETE FROM user_equipped;
    DELETE FROM user_items;
    DELETE FROM user_energy;
    DELETE FROM daily_input_stats;
    DELETE FROM daily_interaction_limits;
    DELETE FROM interactions;
    DELETE FROM friends;
    DELETE FROM user_level;
    DELETE FROM user_skills;
    DELETE FROM user_quests;
    DELETE FROM user_tokens;
    DELETE FROM daily_activity;
    DELETE FROM user_resources;
    DELETE FROM daily_resource_stats;
    DELETE FROM user_box_roadmap;
    DELETE FROM sessions;
    DELETE FROM heartbeat_snapshots;
    DELETE FROM devices;
    DELETE FROM users;
  `)
  db.pragma('foreign_keys = ON')
}

let userSeq = 0

export interface TestUser {
  id: string
  friend_code: string
  display_name: string
  device_id: string
}

export function createTestUser(name = 'TestUser'): TestUser {
  userSeq++
  const id = `test-user-${userSeq}-${Date.now()}`
  const deviceId = `test-device-${userSeq}-${Date.now()}`
  const friendCode = `TEST-${String(userSeq).padStart(4, '0')}`
  const now = Math.floor(Date.now() / 1000)

  stmts.upsertDevice.run({ id: deviceId, name: 'TestPC', type: 'windows', last_seen: now })
  stmts.insertUser.run({
    id,
    friend_code: friendCode,
    display_name: name,
    cat_color: '#f5f5f5',
    created_at: now,
  })
  stmts.bindDeviceToUser.run({ user_id: id, device_id: deviceId })
  stmts.upsertEnergy.run({ user_id: id, energy: 0 })

  return { id, friend_code: friendCode, display_name: name, device_id: deviceId }
}

export function giveEnergy(userId: string, amount: number): void {
  stmts.upsertEnergy.run({ user_id: userId, energy: amount })
}

export function resetBoxCooldown(userId: string): void {
  db.prepare(`UPDATE user_energy SET last_box_opened_at = 0 WHERE user_id = ?`).run(userId)
}

export function giveOpenAllowance(userId: string, slots: number): void {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`UPDATE user_energy SET open_allowance = ?, last_allowance_ts = ? WHERE user_id = ?`).run(slots, now, userId)
}

export function giveItem(userId: string, itemId: string, quantity = 1): void {
  const now = Math.floor(Date.now() / 1000)
  for (let i = 0; i < quantity; i++) {
    stmts.upsertUserItem.run({ user_id: userId, item_id: itemId, obtained_at: now })
  }
}

export { db, stmts }
