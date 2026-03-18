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
  energy_boxes: number
  progress: number
  boxes_opened: number
  open_allowance: number
  next_open_in: number
  allowance_interval: number
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

export interface BoxTypeInfo {
  name: string
  icon: string
  color: string
}

export interface BoxResult {
  ok: boolean
  box_type: string
  box_info: BoxTypeInfo
  items: CatalogItem[]
  item: CatalogItem
  energy: EnergyInfo
  next_position: number
}

export interface CraftResult {
  ok: boolean
  item: CatalogItem
  upgraded: boolean
  input_rarity: string
  output_rarity: string
  catalyst_used: boolean
}

export interface RoadmapEntry {
  index: number
  box_type: string
  box_info: {
    name: string
    icon: string
    color: string
    guaranteed_floor: string | null
    item_count: number
    bonus_item_chance: number
  }
}

export interface RoadmapInfo {
  cycle_position: number
  cycle_length: number
  upcoming: RoadmapEntry[]
}

export interface ResourceInfo {
  order_crystal: number
  creation_shard: number
  passion_spark: number
  info_fragment: number
  social_spark: number
}

export interface CategoryIntensity {
  category: string
  apm: number
  focus_ratio: number
  diversity: number
  quality_bonus: number
}

export interface CatalystDef {
  name: string
  description: string
  cost: number
  effect: string
  bonus_pct: number
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

export async function craftItems(
  userId: string,
  itemIds: Array<{ item_id: string; count: number }>,
  catalyst?: { resource_type: string; amount: number },
) {
  return api<CraftResult>('/api/items/craft', 'POST', {
    user_id: userId,
    item_ids: itemIds,
    ...(catalyst ? { catalyst } : {}),
  })
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

// Daily input stats
export interface DailyInput {
  date: string
  keyboard: number
  mouse: number
}

export async function getDailyInput(userId: string, date?: string) {
  const qs = date ? `&date=${date}` : ''
  return api<DailyInput>(`/api/user/daily-input?user_id=${userId}${qs}`)
}

export async function pushDailyInput(userId: string, keyboard: number, mouse: number) {
  return api<DailyInput & { ok: boolean }>(
    '/api/user/daily-input', 'POST',
    { user_id: userId, keyboard, mouse },
  )
}

// Achievements
export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: string
  condition: string
  reward_energy: number
}

export interface UserAchievement {
  achievement_id: string
  unlocked_at: number
  name: string
  description: string
  icon: string
  category: string
  reward_energy: number
}

export async function getAchievementCatalog() {
  return api<Achievement[]>('/api/achievements/catalog')
}

export async function getUserAchievements(userId: string) {
  return api<UserAchievement[]>(`/api/achievements/user?user_id=${userId}`)
}

export async function getAchievementProgress(userId: string) {
  return api<Record<string, number>>(`/api/achievements/progress?user_id=${userId}`)
}

// Leaderboard
export interface LeaderboardEntry {
  user_id: string
  display_name: string
  cat_color: string
  keyboard_count: number
  mouse_count: number
}

export async function getLeaderboardDaily(userId: string, date?: string) {
  const qs = date ? `&date=${date}` : ''
  return api<LeaderboardEntry[]>(`/api/leaderboard/daily?user_id=${userId}${qs}`)
}

export async function getLeaderboardWeekly(userId: string) {
  return api<LeaderboardEntry[]>(`/api/leaderboard/weekly?user_id=${userId}`)
}

// Interactions
export async function sendInteraction(fromUser: string, toUser: string, type: string, itemId?: string) {
  return api<{ ok: boolean; type: string }>(
    '/api/interact', 'POST',
    { from_user: fromUser, to_user: toUser, type, item_id: itemId },
  )
}

// ── RPG: Level & Skills ──

export interface LevelInfo {
  level: number
  experience: number
  total_experience: number
  skill_points: number
  xp_to_next: number
  xp_progress_pct: number
  unlocked_systems: string[]
}

export interface SystemUnlockConfig {
  tabs: Record<string, number>
}

export interface SkillDef {
  id: string
  name: string
  description: string
  max_level: number
  effect_per_level: number
}

export interface SkillBranch {
  id: string
  name: string
  icon: string
  skills: SkillDef[]
}

export interface SkillTreeConfig {
  branches: SkillBranch[]
}

export interface UserSkill {
  skill_id: string
  level: number
}

export async function getUserLevel(userId: string) {
  return api<LevelInfo>(`/api/user/level?user_id=${userId}`)
}

export async function getSkillTree() {
  return api<SkillTreeConfig>('/api/skills/tree')
}

export async function getUserSkills(userId: string) {
  return api<{ skills: UserSkill[]; skill_points: number }>(`/api/user/skills?user_id=${userId}`)
}

export async function upgradeSkill(userId: string, skillId: string) {
  return api<{ ok: boolean; skill_id: string; new_level: number; remaining_points: number }>(
    '/api/user/skill/upgrade', 'POST',
    { user_id: userId, skill_id: skillId },
  )
}

// ── RPG: Quests ──

export interface QuestInfo {
  id: number
  quest_id: string
  date: string
  target: number
  progress: number
  completed: number
  reward_claimed: number
  name: string
  description: string
  type: string
  condition: string
  reward_type: string
  reward_amount: number
  icon: string
}

export async function getActiveQuests(userId: string) {
  return api<{ quests: QuestInfo[]; tokens: number }>(`/api/quests/active?user_id=${userId}`)
}

export async function claimQuestReward(userId: string, questId: number) {
  return api<{ ok: boolean; reward_type: string; reward_amount: number; tokens: number }>(
    '/api/quests/claim', 'POST',
    { user_id: userId, quest_id: questId },
  )
}

// ── RPG: Quest Shop ──

export interface ShopItem {
  id: string
  item_id: string
  cost: number
  stock: number
  name: string
  category: string
  rarity: string
  svg_ref: string
}

export async function getQuestShop() {
  return api<ShopItem[]>('/api/quest/shop')
}

export async function buyShopItem(userId: string, shopItemId: string) {
  return api<{ ok: boolean; item: CatalogItem; tokens: number }>(
    '/api/quest/shop/buy', 'POST',
    { user_id: userId, shop_item_id: shopItemId },
  )
}

export async function getUserTokens(userId: string) {
  return api<{ tokens: number }>(`/api/user/tokens?user_id=${userId}`)
}

// ── Resources ──

export async function getUserResources(userId: string) {
  return api<{ resources: ResourceInfo }>(`/api/user/resources?user_id=${userId}`)
}

export async function getUserIntensity(userId: string) {
  return api<{ metrics: CategoryIntensity[] }>(`/api/user/intensity?user_id=${userId}`)
}

// ── Box Roadmap ──

export async function getBoxRoadmap(userId: string, count = 10) {
  return api<RoadmapInfo>(`/api/box/roadmap?user_id=${userId}&count=${count}`)
}

// ── Catalyst Config ──

export async function getCatalystConfig() {
  return api<{ catalysts: Record<string, CatalystDef> }>('/api/catalyst-config')
}

export async function getSystemUnlockConfig() {
  return api<SystemUnlockConfig>('/api/system-unlock-config')
}
