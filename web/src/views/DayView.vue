<template>
  <div class="day-view">
    <!-- Date navigation -->
    <div class="toolbar">
      <button class="nav-btn" @click="changeDay(-1)">‹</button>
      <span class="date-label">{{ dateLabel }}</span>
      <button class="nav-btn" @click="changeDay(1)" :disabled="isToday">›</button>
    </div>

    <!-- Stats bar -->
    <div class="stats" v-if="summary.length">
      <span class="stat">总计 <b>{{ formatDuration(totalDuration) }}</b></span>
      <span class="stat">应用 <b>{{ summary.length }}</b> 个</span>
      <span class="stat">最多 <b>{{ summary[0].app_name }}</b> {{ formatDuration(summary[0].total_duration) }}</span>
    </div>

    <div class="loading" v-if="loading">加载中…</div>
    <div class="error" v-else-if="error">{{ error }}</div>

    <template v-else>
      <!-- App usage horizontal bars -->
      <section class="section">
        <h2 class="section-title">应用使用时长</h2>
        <div class="chart-box" :style="{ height: barChartHeight }">
          <AppUsageBar :items="summary" />
        </div>
      </section>

      <!-- Input stats (Bongo Cat) -->
      <section class="section">
        <h2 class="section-title">输入活动</h2>
        <InputStats :sessions="sessions" :day-start="dayStart" />
      </section>

      <!-- Session timeline -->
      <section class="section">
        <h2 class="section-title">时间线</h2>
        <div class="chart-box timeline-box">
          <TimelineChart :sessions="sessions" :devices="devices" :day-start="dayStart" />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { api, type Device, type UsageSummary, type Session } from '../api/client'
import { formatDuration } from '../utils/colors'
import AppUsageBar from '../components/AppUsageBar.vue'
import TimelineChart from '../components/TimelineChart.vue'
import InputStats from '../components/InputStats.vue'

const props = defineProps<{ deviceId: string }>()

// --- State ---
const today    = new Date()
today.setHours(0, 0, 0, 0)
const cursor   = ref(new Date(today))
const loading  = ref(false)
const error    = ref('')
const devices  = ref<Device[]>([])
const summary  = ref<UsageSummary[]>([])
const sessions = ref<Session[]>([])

// --- Computed ---
const dayStart = computed(() => Math.floor(cursor.value.getTime() / 1000))
const dayEnd   = computed(() => dayStart.value + 86400)

const isToday = computed(() => cursor.value.getTime() === today.getTime())

const dateLabel = computed(() => {
  const d = cursor.value
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
})

const totalDuration = computed(() => summary.value.reduce((s, r) => s + r.total_duration, 0))

const barChartHeight = computed(() => {
  const n = summary.value.length
  return `${Math.max(120, Math.min(n * 36 + 32, 480))}px`
})

// --- Methods ---
function changeDay(delta: number): void {
  const d = new Date(cursor.value)
  d.setDate(d.getDate() + delta)
  if (d > today) return
  cursor.value = d
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const deviceId = props.deviceId !== 'all' ? props.deviceId : undefined
    const [devs, sum, sesList] = await Promise.all([
      api.getDevices(),
      api.getUsageSummary(dayStart.value, dayEnd.value, deviceId),
      api.getTimeline(dayStart.value, dayEnd.value, deviceId),
    ])
    devices.value  = devs
    summary.value  = sum
    sessions.value = sesList
  } catch (e) {
    console.error(e)
    error.value = '加载失败，请检查服务器连接'
    summary.value = []
    sessions.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([cursor, () => props.deviceId], load)
</script>

<style scoped>
.day-view { display: flex; flex-direction: column; gap: 24px; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-btn {
  background: #2a2a2a;
  border: 1px solid #444;
  color: #ccc;
  padding: 4px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.nav-btn:disabled { opacity: 0.3; cursor: default; }
.nav-btn:not(:disabled):hover { background: #333; }

.date-label { font-size: 16px; color: #eee; min-width: 200px; }

.stats {
  display: flex;
  gap: 24px;
  padding: 10px 16px;
  background: #1c1c1c;
  border-radius: 8px;
  font-size: 13px;
  color: #aaa;
}
.stat b { color: #eee; }

.loading { color: #666; text-align: center; padding: 40px; }
.error { color: #ef5350; text-align: center; padding: 40px; }

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}
.chart-box { width: 100%; }
.timeline-box { height: 200px; }
</style>
