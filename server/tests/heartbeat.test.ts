import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, cleanUserData, createTestUser, stmts } from './helpers'

let app: FastifyInstance

beforeAll(async () => { app = await buildApp() })
beforeEach(() => cleanUserData())

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('ok', true)
    expect(res.json()).toHaveProperty('ts')
  })
})

describe('POST /api/heartbeat', () => {
  it('accepts a valid heartbeat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: {
        device_id: 'dev-1',
        device_name: 'MyPC',
        device_type: 'windows',
        app_name: 'VSCode',
        app_title: 'test.ts',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('rejects missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: { device_id: 'dev-1' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('registers the device', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: { device_id: 'dev-hb', device_name: 'HBDevice', app_name: 'Chrome' },
    })
    const devRes = await app.inject({ method: 'GET', url: '/api/devices' })
    const devices = devRes.json()
    expect(devices.some((d: { id: string }) => d.id === 'dev-hb')).toBe(true)
  })

  it('creates a session after app switch', async () => {
    const now = Math.floor(Date.now() / 1000)
    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: { device_id: 'dev-s', device_name: 'PC', app_name: 'AppA', timestamp: now },
    })
    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: { device_id: 'dev-s', device_name: 'PC', app_name: 'AppB', timestamp: now + 10 },
    })

    const start = now - 1
    const end = now + 100
    const res = await app.inject({
      method: 'GET',
      url: `/api/usage/timeline?start=${start}&end=${end}&device_id=dev-s`,
    })
    const sessions = res.json()
    expect(sessions.length).toBe(1)
    expect(sessions[0].app_name).toBe('AppA')
    expect(sessions[0].duration).toBe(10)
  })

  it('accumulates energy for registered user', async () => {
    const user = createTestUser('EnergyUser')
    const now = Math.floor(Date.now() / 1000)

    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: {
        device_id: user.device_id,
        device_name: 'PC',
        app_name: 'VSCode',
        timestamp: now,
        input_events: { keyboard: 50, mouse: 20 },
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })
    expect(res.json().energy).toBe(70)
  })

  it('handles iOS close event', async () => {
    const now = Math.floor(Date.now() / 1000)
    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: {
        device_id: 'ios-dev', device_name: 'iPhone', device_type: 'ios',
        app_name: 'Safari', timestamp: now,
      },
    })
    await app.inject({
      method: 'POST',
      url: '/api/heartbeat',
      payload: {
        device_id: 'ios-dev', device_name: 'iPhone', device_type: 'ios',
        app_name: 'Safari', timestamp: now + 300, event: 'close',
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/usage/timeline?start=${now - 1}&end=${now + 500}&device_id=ios-dev`,
    })
    const sessions = res.json()
    expect(sessions.length).toBe(1)
    expect(sessions[0].duration).toBe(300)
  })
})

describe('GET /api/devices', () => {
  it('returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('Usage APIs', () => {
  it('GET /api/usage/summary rejects invalid params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usage/summary?start=0&end=0',
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /api/usage/summary returns aggregated data', async () => {
    const now = Math.floor(Date.now() / 1000)
    stmts.upsertDevice.run({ id: 'ud1', name: 'PC', type: 'win', last_seen: now })
    stmts.insertSession.run({
      device_id: 'ud1', app_name: 'VSCode', app_title: null,
      start_time: now, end_time: now + 100, duration: 100,
      keyboard_events: 50, mouse_events: 10,
    })
    stmts.insertSession.run({
      device_id: 'ud1', app_name: 'VSCode', app_title: null,
      start_time: now + 200, end_time: now + 300, duration: 100,
      keyboard_events: 30, mouse_events: 5,
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/usage/summary?start=${now - 1}&end=${now + 500}&device_id=all`,
    })
    const data = res.json()
    expect(data.length).toBe(1)
    expect(data[0].total_duration).toBe(200)
    expect(data[0].total_keyboard).toBe(80)
  })

  it('GET /api/usage/weekly returns by day_index', async () => {
    const weekStart = Math.floor(Date.now() / 1000)
    stmts.upsertDevice.run({ id: 'wd1', name: 'PC', type: 'win', last_seen: weekStart })
    stmts.insertSession.run({
      device_id: 'wd1', app_name: 'Chrome', app_title: null,
      start_time: weekStart + 100, end_time: weekStart + 200, duration: 100,
      keyboard_events: 10, mouse_events: 5,
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/usage/weekly?week_start=${weekStart}&device_id=all`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThanOrEqual(1)
  })
})
