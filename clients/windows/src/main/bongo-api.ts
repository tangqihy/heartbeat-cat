import { getConfig } from './config-store'

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const cfg = getConfig()
  const url = `${cfg.serverUrl}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Types ──

export interface UserInfo {
  id: string
  friend_code: string
  display_name: string
  cat_color: string
  created_at: number
}

export interface EnergyInfo {
  energy: number
  energy_per_box: number
  available_boxes: number
  progress: number
  boxes_opened: number
}

export interface CatalogItem {
  id: string
  name: string
  category: string
  rarity: string
  svg_ref: string
}

export interface InventoryItem extends CatalogItem {
  item_id: string
  quantity: number
  obtained_at: number
}

export interface EquippedItem {
  slot: string
  item_id: string
  name: string
  category: string
  rarity: string
  svg_ref: string
}

export interface BoxResult {
  ok: boolean
  item: CatalogItem
  energy: EnergyInfo
}

export interface CraftResult {
  ok: boolean
  item: CatalogItem
  upgraded: boolean
  input_rarity: string
  output_rarity: string
}

// ── API calls ──

export async function registerUser(deviceId: string, displayName: string, catColor?: string) {
  return api<{ ok: boolean; user: UserInfo; existing: boolean }>(
    '/api/user/register', 'POST',
    { device_id: deviceId, display_name: displayName, cat_color: catColor },
  )
}

export async function getUserProfile(userId: string) {
  return api<{ user: UserInfo; energy: EnergyInfo; equipped: EquippedItem[]; energy_per_box: number }>(
    `/api/user/profile?user_id=${userId}`,
  )
}

export async function getUserEnergy(userId: string) {
  return api<EnergyInfo>(`/api/user/energy?user_id=${userId}`)
}

export async function openBox(userId: string) {
  return api<BoxResult>('/api/box/open', 'POST', { user_id: userId })
}

export async function craftItems(userId: string, itemIds: Array<{ item_id: string; count: number }>) {
  return api<CraftResult>('/api/items/craft', 'POST', { user_id: userId, item_ids: itemIds })
}

export async function getCatalog() {
  return api<CatalogItem[]>('/api/items/catalog')
}

export async function getInventory(userId: string) {
  return api<InventoryItem[]>(`/api/items/inventory?user_id=${userId}`)
}

export async function equipItem(userId: string, slot: string, itemId?: string) {
  return api<{ ok: boolean; equipped: EquippedItem[] }>(
    '/api/items/equip', 'POST',
    { user_id: userId, slot, item_id: itemId },
  )
}

// ── Friends ──

export interface FriendInfo {
  id: string
  display_name: string
  friend_code: string
  cat_color: string
  online: boolean
  last_seen: number | null
  equipped: EquippedItem[]
  added_at: number
}

export interface FriendProfile {
  user: UserInfo
  equipped: EquippedItem[]
  boxes_opened: number
  online: boolean
  last_seen: number | null
}

export async function addFriend(userId: string, friendCode: string) {
  return api<{ ok: boolean; friend_id: string }>(
    '/api/friends/add', 'POST',
    { user_id: userId, friend_code: friendCode },
  )
}

export async function getFriends(userId: string) {
  return api<FriendInfo[]>(`/api/friends/list?user_id=${userId}`)
}

export async function removeFriend(userId: string, friendId: string) {
  return api<{ ok: boolean }>(
    '/api/friends/remove', 'DELETE',
    { user_id: userId, friend_id: friendId },
  )
}

export async function getFriendProfile(friendId: string) {
  return api<FriendProfile>(`/api/friends/profile?friend_id=${friendId}`)
}
