import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, cleanUserData, createTestUser, giveEnergy, giveItem, resetBoxCooldown, giveOpenAllowance, stmts } from './helpers'

const COMMON_HAT = 'hat-party'
const RARE_HAT = 'hat-cat-ears'

let app: FastifyInstance

beforeAll(async () => { app = await buildApp() })
beforeEach(() => cleanUserData())

describe('User Registration', () => {
  it('registers a new user via device', async () => {
    stmts.upsertDevice.run({ id: 'reg-dev', name: 'PC', type: 'windows', last_seen: 0 })
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/register',
      payload: { device_id: 'reg-dev', display_name: 'Alice' },
    })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.existing).toBe(false)
    expect(body.user).toHaveProperty('id')
    expect(body.user.display_name).toBe('Alice')
    expect(body.user.friend_code).toMatch(/^MEOW-/)
  })

  it('returns existing user on second registration', async () => {
    stmts.upsertDevice.run({ id: 'reg-dev2', name: 'PC', type: 'windows', last_seen: 0 })
    await app.inject({
      method: 'POST',
      url: '/api/user/register',
      payload: { device_id: 'reg-dev2', display_name: 'Bob' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/register',
      payload: { device_id: 'reg-dev2', display_name: 'Bob' },
    })
    expect(res.json().existing).toBe(true)
  })

  it('rejects missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/register',
      payload: { device_id: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('User Profile', () => {
  it('returns user profile with energy and equipment', async () => {
    const user = createTestUser('ProfileUser')
    giveEnergy(user.id, 500)

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/profile?user_id=${user.id}`,
    })
    const body = res.json()
    expect(body.user.display_name).toBe('ProfileUser')
    expect(body.energy.energy).toBe(500)
    expect(body.energy_per_box).toBe(1000)
  })

  it('returns 400 without user_id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/user/profile' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/profile?user_id=nonexistent',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Energy', () => {
  it('returns energy status', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 2500)
    giveOpenAllowance(user.id, 5)

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })
    const body = res.json()
    expect(body.energy).toBe(2500)
    expect(body.available_boxes).toBe(2)
    expect(body.energy_boxes).toBe(2)
    expect(body.open_allowance).toBe(5)
    expect(body.progress).toBe(500)
    expect(body.energy_per_box).toBe(1000)
  })
})

describe('Treasure Box', () => {
  it('opens a box and receives an item', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 1000)

    const res = await app.inject({
      method: 'POST',
      url: '/api/box/open',
      payload: { user_id: user.id },
    })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.item).toHaveProperty('id')
    expect(body.item).toHaveProperty('rarity')
    expect(body.energy.energy).toBe(0)
  })

  it('rejects when energy is insufficient', async () => {
    const user = createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/api/box/open',
      payload: { user_id: user.id },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Not enough energy')
  })

  it('increments boxes_opened counter', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 3000)
    giveOpenAllowance(user.id, 3)

    await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })
    expect(res.json().boxes_opened).toBe(2)
  })

  it('rejects box open when no allowance slots', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 2000)
    giveOpenAllowance(user.id, 1)

    const r1 = await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    expect(r1.statusCode).toBe(200)

    const r2 = await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    expect(r2.statusCode).toBe(429)
    expect(r2.json().error).toContain('No open slots')
    expect(r2.json().next_open_in).toBeGreaterThan(0)
  })

  it('allows consecutive opens with accumulated allowance', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 3000)
    giveOpenAllowance(user.id, 3)

    const r1 = await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    expect(r1.statusCode).toBe(200)
    const r2 = await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    expect(r2.statusCode).toBe(200)
    const r3 = await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })
    expect(r3.statusCode).toBe(200)
  })

  it('returns allowance info in energy status', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 2000)
    giveOpenAllowance(user.id, 2)

    await app.inject({ method: 'POST', url: '/api/box/open', payload: { user_id: user.id } })

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })
    const body = res.json()
    expect(body.open_allowance).toBe(1)
    expect(body.allowance_interval).toBe(1800)
    expect(body.energy_boxes).toBe(1)
  })
})

describe('Item Catalog', () => {
  it('returns the full catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/items/catalog' })
    const items = res.json()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveProperty('id')
    expect(items[0]).toHaveProperty('rarity')
  })
})

describe('Inventory', () => {
  it('returns user items', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT)

    const res = await app.inject({
      method: 'GET',
      url: `/api/items/inventory?user_id=${user.id}`,
    })
    const items = res.json()
    expect(items.length).toBe(1)
    expect(items[0].item_id).toBe(COMMON_HAT)
    expect(items[0].quantity).toBe(1)
  })

  it('stacks duplicate items', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT, 3)

    const res = await app.inject({
      method: 'GET',
      url: `/api/items/inventory?user_id=${user.id}`,
    })
    expect(res.json()[0].quantity).toBe(3)
  })
})

describe('Equip / Unequip', () => {
  it('equips an item', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT)

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'hat', item_id: COMMON_HAT },
    })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('equip')
    expect(body.equipped.some((e: { slot: string }) => e.slot === 'hat')).toBe(true)
  })

  it('unequips a slot', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT)
    await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'hat', item_id: COMMON_HAT },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'hat' },
    })
    expect(res.json().action).toBe('unequip')
  })

  it('rejects invalid slot', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'invalid_slot', item_id: COMMON_HAT },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects equipping unowned item', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'hat', item_id: COMMON_HAT },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('do not own')
  })

  it('rejects category mismatch', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT)
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/equip',
      payload: { user_id: user.id, slot: 'glasses', item_id: COMMON_HAT },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('does not match slot')
  })
})

describe('Crafting', () => {
  it('crafts 10 items into 1', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT, 10)

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/craft',
      payload: {
        user_id: user.id,
        item_ids: [{ item_id: COMMON_HAT, count: 10 }],
      },
    })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.item).toHaveProperty('id')
    expect(body).toHaveProperty('output_rarity')
  })

  it('rejects insufficient materials', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT, 3)

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/craft',
      payload: {
        user_id: user.id,
        item_ids: [{ item_id: COMMON_HAT, count: 10 }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('consumes input items after crafting', async () => {
    const user = createTestUser()
    giveItem(user.id, COMMON_HAT, 10)

    await app.inject({
      method: 'POST',
      url: '/api/items/craft',
      payload: {
        user_id: user.id,
        item_ids: [{ item_id: COMMON_HAT, count: 10 }],
      },
    })

    const inv = await app.inject({
      method: 'GET',
      url: `/api/items/inventory?user_id=${user.id}`,
    })
    const items = inv.json()
    const cap = items.find((i: { item_id: string }) => i.item_id === COMMON_HAT)
    // Craft output may randomly be the same item; if so, quantity should be 1 (from craft output), not 10
    if (cap) {
      expect(cap.quantity).toBe(1)
    }
  })
})

describe('Daily Input Stats', () => {
  it('POST increments daily counters', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 100, mouse: 50 },
    })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.keyboard).toBe(100)
    expect(body.mouse).toBe(50)
  })

  it('accumulates across multiple pushes', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 100, mouse: 50 },
    })
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 200, mouse: 30 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/user/daily-input?user_id=${user.id}`,
    })
    expect(res.json().keyboard).toBe(300)
    expect(res.json().mouse).toBe(80)
  })

  it('GET returns zeros for no data', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/user/daily-input?user_id=${user.id}`,
    })
    expect(res.json().keyboard).toBe(0)
    expect(res.json().mouse).toBe(0)
  })

  it('ignores negative values', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: -10, mouse: -5 },
    })
    expect(res.json().ok).toBe(true)
  })
})

describe('Item SVG', () => {
  it('returns SVG content for valid ref', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/svg/kb-mechanical.svg',
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('svg')
  })

  it('rejects invalid svg_ref pattern', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/svg/bad%20file!.txt',
    })
    expect(res.statusCode).toBe(400)
  })
})
