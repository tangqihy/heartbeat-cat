import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, cleanUserData, createTestUser, giveEnergy, giveItem, giveOpenAllowance, stmts } from './helpers'

let app: FastifyInstance

beforeAll(async () => { app = await buildApp() })
beforeEach(() => cleanUserData())

// ── Friends ──

describe('Friends', () => {
  it('adds a friend by friend code', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')

    const res = await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })
    expect(res.json().ok).toBe(true)
    expect(res.json().friend_id).toBe(bob.id)
  })

  it('creates bidirectional friendship', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })

    const aliceFriends = await app.inject({
      method: 'GET',
      url: `/api/friends/list?user_id=${alice.id}`,
    })
    const bobFriends = await app.inject({
      method: 'GET',
      url: `/api/friends/list?user_id=${bob.id}`,
    })
    expect(aliceFriends.json().length).toBe(1)
    expect(bobFriends.json().length).toBe(1)
  })

  it('rejects adding yourself', async () => {
    const alice = createTestUser('Alice')
    const res = await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: alice.friend_code },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('yourself')
  })

  it('rejects duplicate friendship', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Already')
  })

  it('removes a friend bidirectionally', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/friends/remove',
      payload: { user_id: alice.id, friend_id: bob.id },
    })
    expect(res.json().ok).toBe(true)

    const aliceFriends = await app.inject({
      method: 'GET',
      url: `/api/friends/list?user_id=${alice.id}`,
    })
    expect(aliceFriends.json().length).toBe(0)
  })

  it('returns friend profile', async () => {
    const bob = createTestUser('Bob')
    const res = await app.inject({
      method: 'GET',
      url: `/api/friends/profile?friend_id=${bob.id}`,
    })
    expect(res.json().user.display_name).toBe('Bob')
  })
})

// ── Achievements ──

describe('Achievements', () => {
  it('returns the achievement catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/achievements/catalog' })
    const catalog = res.json()
    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog[0]).toHaveProperty('id')
    expect(catalog[0]).toHaveProperty('condition')
  })

  it('returns empty achievements for new user', async () => {
    const user = createTestUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/user?user_id=${user.id}`,
    })
    expect(res.json()).toEqual([])
  })

  it('unlocks keyboard milestone after pushing input', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 1000, mouse: 0 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/user?user_id=${user.id}`,
    })
    const achievements = res.json()
    const kb1k = achievements.find((a: { achievement_id: string }) => a.achievement_id === 'kb-1k')
    expect(kb1k).toBeDefined()
    expect(kb1k.name).toBe('初出茅庐')
  })

  it('unlocks mouse milestone', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 0, mouse: 1000 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/user?user_id=${user.id}`,
    })
    const ms1k = res.json().find((a: { achievement_id: string }) => a.achievement_id === 'ms-1k')
    expect(ms1k).toBeDefined()
  })

  it('unlocks box milestone after opening boxes', async () => {
    const user = createTestUser()
    giveEnergy(user.id, 10000)
    giveOpenAllowance(user.id, 10)
    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/box/open',
        payload: { user_id: user.id },
      })
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/user?user_id=${user.id}`,
    })
    const box10 = res.json().find((a: { achievement_id: string }) => a.achievement_id === 'box-10')
    expect(box10).toBeDefined()
  })

  it('unlocks friend milestone', async () => {
    const user = createTestUser('Main')
    const friend = createTestUser('Friend1')
    await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: user.id, friend_code: friend.friend_code },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/user?user_id=${user.id}`,
    })
    const f1 = res.json().find((a: { achievement_id: string }) => a.achievement_id === 'friend-1')
    expect(f1).toBeDefined()
  })

  it('returns achievement progress', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 500, mouse: 200 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/achievements/progress?user_id=${user.id}`,
    })
    const prog = res.json()
    expect(prog.total_keyboard).toBe(500)
    expect(prog.total_mouse).toBe(200)
    expect(prog).toHaveProperty('boxes_opened')
    expect(prog).toHaveProperty('distinct_items')
    expect(prog).toHaveProperty('friend_count')
    expect(prog).toHaveProperty('gifts_sent')
    expect(prog).toHaveProperty('active_days')
  })

  it('grants reward energy on achievement unlock', async () => {
    const user = createTestUser()
    const energyBefore = (await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })).json().energy

    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 1000, mouse: 0 },
    })

    const energyAfter = (await app.inject({
      method: 'GET',
      url: `/api/user/energy?user_id=${user.id}`,
    })).json().energy

    expect(energyAfter).toBeGreaterThan(energyBefore)
  })
})

// ── Leaderboard ──

describe('Leaderboard', () => {
  it('returns daily leaderboard including self', async () => {
    const user = createTestUser('Leader')
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 500, mouse: 200 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/leaderboard/daily?user_id=${user.id}`,
    })
    const board = res.json()
    expect(board.length).toBe(1)
    expect(board[0].user_id).toBe(user.id)
    expect(board[0].keyboard_count).toBe(500)
  })

  it('includes friends in leaderboard', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    await app.inject({
      method: 'POST',
      url: '/api/friends/add',
      payload: { user_id: alice.id, friend_code: bob.friend_code },
    })
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: alice.id, keyboard: 300, mouse: 0 },
    })
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: bob.id, keyboard: 500, mouse: 0 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/leaderboard/daily?user_id=${alice.id}`,
    })
    const board = res.json()
    expect(board.length).toBe(2)
    expect(board[0].user_id).toBe(bob.id)
  })

  it('returns weekly leaderboard', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 1000, mouse: 500 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/leaderboard/weekly?user_id=${user.id}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThanOrEqual(1)
  })
})

// ── Interactions ──

describe('Interactions', () => {
  function makeFriends(a: ReturnType<typeof createTestUser>, b: ReturnType<typeof createTestUser>) {
    const now = Math.floor(Date.now() / 1000)
    stmts.addFriend.run({ user_id: a.id, friend_id: b.id, added_at: now })
    stmts.addFriend.run({ user_id: b.id, friend_id: a.id, added_at: now })
  }

  it('sends a fish interaction', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'fish' },
    })
    expect(res.json().ok).toBe(true)
    expect(res.json().type).toBe('fish')
  })

  it('sends a pet interaction', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'pet' },
    })
    expect(res.json().ok).toBe(true)
  })

  it('enforces daily fish limit', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/interact',
        payload: { from_user: alice.id, to_user: bob.id, type: 'fish' },
      })
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'fish' },
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toContain('limit')
  })

  it('enforces daily pet limit', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/interact',
        payload: { from_user: alice.id, to_user: bob.id, type: 'pet' },
      })
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'pet' },
    })
    expect(res.statusCode).toBe(429)
  })

  it('sends a gift (transfers item)', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)
    giveItem(alice.id, 'hat-party')

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'gift', item_id: 'hat-party' },
    })
    expect(res.json().ok).toBe(true)

    const aliceInv = await app.inject({
      method: 'GET',
      url: `/api/items/inventory?user_id=${alice.id}`,
    })
    const bobInv = await app.inject({
      method: 'GET',
      url: `/api/items/inventory?user_id=${bob.id}`,
    })
    expect(aliceInv.json().length).toBe(0)
    expect(bobInv.json().some((i: { item_id: string }) => i.item_id === 'hat-party')).toBe(true)
  })

  it('rejects gift without item_id', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'gift' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects interaction between non-friends', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'fish' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Not friends')
  })

  it('rejects invalid interaction type', async () => {
    const alice = createTestUser('Alice')
    const bob = createTestUser('Bob')
    makeFriends(alice, bob)

    const res = await app.inject({
      method: 'POST',
      url: '/api/interact',
      payload: { from_user: alice.id, to_user: bob.id, type: 'poke' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ── Stats API ──

describe('Stats', () => {
  it('GET /api/stats/heatmap returns daily data', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 100, mouse: 50 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/stats/heatmap?user_id=${user.id}`,
    })
    const data = res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0]).toHaveProperty('date')
    expect(data[0]).toHaveProperty('keyboard_count')
  })

  it('GET /api/stats/input-trend returns recent data', async () => {
    const user = createTestUser()
    await app.inject({
      method: 'POST',
      url: '/api/user/daily-input',
      payload: { user_id: user.id, keyboard: 200, mouse: 80 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/stats/input-trend?user_id=${user.id}&days=7`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThanOrEqual(1)
  })

  it('returns 400 without user_id', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/stats/heatmap' })
    expect(res1.statusCode).toBe(400)

    const res2 = await app.inject({ method: 'GET', url: '/api/stats/input-trend' })
    expect(res2.statusCode).toBe(400)
  })
})
