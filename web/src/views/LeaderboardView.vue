<template>
  <div class="leaderboard-view">
    <p v-if="!userId" class="empty-msg">请输入 User ID 以查看排行</p>

    <template v-else>
      <div class="toolbar">
        <button
          :class="['tab-btn', { active: mode === 'daily' }]"
          @click="mode = 'daily'"
        >
          今日排行
        </button>
        <button
          :class="['tab-btn', { active: mode === 'weekly' }]"
          @click="mode = 'weekly'"
        >
          本周排行
        </button>
      </div>

      <div class="loading" v-if="loading">加载中…</div>
      <div class="error" v-else-if="error">{{ error }}</div>
      <div class="empty" v-else-if="!entries.length">暂无排行数据</div>

      <div v-else class="leaderboard-list">
        <div
          v-for="(entry, idx) in entries"
          :key="entry.user_id"
          class="leaderboard-row"
        >
          <span :class="['rank', rankClass(idx + 1)]">{{ rankMedal(idx + 1) }}</span>
          <span class="dot" :style="{ background: entry.cat_color || '#666' }"></span>
          <span class="name">{{ entry.display_name || entry.user_id }}</span>
          <span class="stat">⌨️ {{ formatNum(entry.keyboard_count) }}</span>
          <span class="stat">🖱️ {{ formatNum(entry.mouse_count) }}</span>
          <span class="stat total">{{ formatNum(totalCount(entry)) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { getLeaderboardDaily, getLeaderboardWeekly } from '../api/client'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  cat_color: string
  keyboard_count: number
  mouse_count: number
}

const props = defineProps<{ userId: string }>()

const mode = ref<'daily' | 'weekly'>('daily')
const loading = ref(false)
const error = ref('')
const entries = ref<LeaderboardEntry[]>([])

function totalCount(e: LeaderboardEntry): number {
  return (e.keyboard_count ?? 0) + (e.mouse_count ?? 0)
}

function formatNum(n: number): string {
  return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
}

function rankClass(rank: number): string {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return ''
}

async function load(): Promise<void> {
  if (!props.userId.trim()) return
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'daily') {
      entries.value = await getLeaderboardDaily(props.userId)
    } else {
      entries.value = await getLeaderboardWeekly(props.userId)
    }
  } catch (e) {
    console.error(e)
    error.value = '加载失败，请检查服务器连接'
    entries.value = []
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.userId, mode],
  () => {
    if (props.userId.trim()) load()
    else entries.value = []
  },
  { immediate: true }
)
</script>

<style scoped>
.leaderboard-view { display: flex; flex-direction: column; gap: 20px; }

.empty-msg { color: #888; font-size: 14px; padding: 24px 0; }

.toolbar { display: flex; gap: 8px; }
.tab-btn {
  background: #2a2a2a;
  border: 1px solid #444;
  color: #888;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.tab-btn:hover { background: #333; color: #ccc; }
.tab-btn.active { background: #3a3a3a; color: #eee; border-color: #555; }

.loading { color: #666; text-align: center; padding: 40px; }
.error { color: #ef5350; text-align: center; padding: 40px; }
.empty { color: #555; text-align: center; padding: 40px; font-size: 14px; }

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #333;
}

.leaderboard-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #252525;
  border-radius: 6px;
  border: 1px solid #2a2a2a;
}

.rank {
  min-width: 28px;
  font-size: 14px;
  font-weight: 600;
  color: #888;
  text-align: center;
}
.rank.gold { color: #ffd700; }
.rank.silver { color: #c0c0c0; }
.rank.bronze { color: #cd7f32; }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat {
  font-size: 13px;
  color: #888;
  min-width: 70px;
  text-align: right;
}
.stat.total { color: #7c4dff; font-weight: 600; min-width: 80px; }
</style>
