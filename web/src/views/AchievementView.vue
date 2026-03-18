<template>
  <div class="achievement-view">
    <p v-if="!userId" class="empty-msg">请输入 User ID 以查看成就</p>

    <template v-else>
      <div class="loading" v-if="loading">加载中…</div>
      <div class="error" v-else-if="error">{{ error }}</div>

      <div v-else class="achievement-grid">
        <div
          v-for="ach in achievementList"
          :key="ach.id"
          :class="['card', { unlocked: ach.unlocked, locked: !ach.unlocked }]"
        >
          <div class="icon">{{ ach.icon || '🏆' }}</div>
          <h3 class="name">{{ ach.name }}</h3>
          <p class="desc">{{ ach.description }}</p>
          <span class="badge">{{ categoryLabel(ach.category) }}</span>
          <p v-if="ach.unlocked && ach.unlocked_at" class="unlock-date">
            解锁于 {{ formatDate(ach.unlocked_at) }}
          </p>
          <div v-else-if="ach.target != null && ach.target > 0" class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPct(ach) + '%' }"></div>
            </div>
            <span class="progress-text">{{ ach.progress }} / {{ ach.target }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getAchievementCatalog, getUserAchievements, getAchievementProgress } from '../api/client'

interface CatalogAchievement {
  id: string
  name: string
  description: string
  icon: string
  category: string
  condition: string
  reward_energy?: number
}

interface UserAchievement {
  achievement_id: string
  unlocked_at: number
  name: string
  description: string
  icon: string
  category: string
  reward_energy?: number
}

interface ProgressMap {
  total_keyboard?: number
  total_mouse?: number
  boxes_opened?: number
  distinct_items?: number
  friend_count?: number
  gifts_sent?: number
  active_days?: number
}

interface AchievementWithMeta {
  id: string
  name: string
  description: string
  icon: string
  category: string
  unlocked: boolean
  unlocked_at?: number
  progress?: number
  target?: number
}

const props = defineProps<{ userId: string }>()

const loading = ref(false)
const error = ref('')
const catalog = ref<CatalogAchievement[]>([])
const userAch = ref<UserAchievement[]>([])
const progress = ref<ProgressMap>({})

const CATEGORY_LABELS: Record<string, string> = {
  milestone: '里程碑',
  streak: '连续',
  collection: '收集',
  social: '社交',
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat || '成就'
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function parseCondition(condStr: string): { type: string; target?: number; category?: string } | null {
  try {
    return JSON.parse(condStr)
  } catch {
    return null
  }
}

function getProgressForCondition(
  cond: { type: string; target?: number; category?: string }
): { progress: number; target?: number } {
  const p = progress.value
  switch (cond.type) {
    case 'total_keyboard':
      return { progress: p.total_keyboard ?? 0, target: cond.target }
    case 'total_mouse':
      return { progress: p.total_mouse ?? 0, target: cond.target }
    case 'boxes_opened':
      return { progress: p.boxes_opened ?? 0, target: cond.target }
    case 'distinct_items':
      return { progress: p.distinct_items ?? 0, target: cond.target }
    case 'consecutive_days':
      return { progress: p.active_days ?? 0, target: cond.target }
    case 'friend_count':
      return { progress: p.friend_count ?? 0, target: cond.target }
    case 'gifts_sent':
      return { progress: p.gifts_sent ?? 0, target: cond.target }
    case 'complete_category':
      return { progress: 0, target: 1 }
    default:
      return { progress: 0 }
  }
}

function progressPct(ach: AchievementWithMeta): number {
  if (!ach.target || ach.target <= 0) return 0
  const prog = ach.progress ?? 0
  return Math.min(100, (prog / ach.target) * 100)
}

const achievementList = computed(() => {
  const unlockedMap = new Map<string, number>()
  for (const u of userAch.value) {
    unlockedMap.set(u.achievement_id, u.unlocked_at)
  }

  return catalog.value.map((c) => {
    const unlockedAt = unlockedMap.get(c.id)
    const cond = parseCondition(c.condition || '{}')
    const { progress: prog, target } = cond ? getProgressForCondition(cond) : { progress: 0 }

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      category: c.category,
      unlocked: !!unlockedAt,
      unlocked_at: unlockedAt,
      progress: prog,
      target,
    } as AchievementWithMeta
  })
})

async function load(): Promise<void> {
  if (!props.userId.trim()) return
  loading.value = true
  error.value = ''
  try {
    const [cat, user, prog] = await Promise.all([
      getAchievementCatalog(),
      getUserAchievements(props.userId),
      getAchievementProgress(props.userId),
    ])
    catalog.value = cat
    userAch.value = user
    progress.value = prog
  } catch (e) {
    console.error(e)
    error.value = '加载失败，请检查服务器连接'
    catalog.value = []
    userAch.value = []
    progress.value = {}
  } finally {
    loading.value = false
  }
}

watch(
  () => props.userId,
  () => {
    if (props.userId.trim()) load()
    else {
      catalog.value = []
      userAch.value = []
      progress.value = {}
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.achievement-view {
  min-height: 200px;
}

.empty-msg { color: #888; font-size: 14px; padding: 24px 0; }
.loading { color: #666; text-align: center; padding: 40px; }
.error { color: #ef5350; text-align: center; padding: 40px; }

.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: #e0e0e0;
}

.card.unlocked {
  border-color: #b8860b;
  box-shadow: 0 0 0 1px rgba(184, 134, 11, 0.3);
}

.card.locked {
  opacity: 0.85;
  border-color: #333;
}

.icon {
  font-size: 40px;
  margin-bottom: 8px;
  line-height: 1;
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0 0 4px 0;
}

.desc {
  font-size: 12px;
  color: #999;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #333;
  color: #888;
  margin-bottom: 6px;
}

.unlock-date {
  font-size: 11px;
  color: #b8860b;
  margin: 0;
}

.progress-wrap {
  width: 100%;
  margin-top: 4px;
}

.progress-bar {
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: #4fc3f7;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #888;
}
</style>
