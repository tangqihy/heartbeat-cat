<template>
  <div class="week-view">
    <!-- Week navigation -->
    <div class="toolbar">
      <button class="nav-btn" @click="changeWeek(-1)">‹</button>
      <span class="date-label">{{ weekLabel }}</span>
      <button class="nav-btn" @click="changeWeek(1)" :disabled="isCurrentWeek">›</button>
    </div>

    <div class="loading" v-if="loading">加载中…</div>
    <div class="error" v-else-if="error">{{ error }}</div>

    <template v-else>
      <section class="section">
        <h2 class="section-title">每日应用使用时长</h2>
        <div class="chart-box">
          <div class="empty" v-if="!hasData">暂无数据</div>
          <v-chart v-else :option="chartOption" autoresize style="height: 360px" />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { api, type WeeklyEntry } from '../api/client'
import { getAppColor, formatDuration } from '../utils/colors'

const props = defineProps<{ deviceId: string }>()

// --- State ---
function thisMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

const weekStart = ref(thisMonday())
const loading   = ref(false)
const error     = ref('')
const entries   = ref<WeeklyEntry[]>([])

// --- Computed ---
const weekStartUnix = computed(() => Math.floor(weekStart.value.getTime() / 1000))

const isCurrentWeek = computed(() => weekStart.value.getTime() === thisMonday().getTime())

const weekLabel = computed(() => {
  const start = weekStart.value
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  const year = start.getFullYear()
  return `${year}年 ${fmt(start)} – ${fmt(end)}`
})

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// Build ECharts stacked bar data
const chartOption = computed(() => {
  // Collect all app names (sorted by total usage desc)
  const appTotals: Record<string, number> = {}
  for (const e of entries.value) {
    appTotals[e.app_name] = (appTotals[e.app_name] ?? 0) + e.total_duration
  }
  const apps = Object.keys(appTotals).sort((a, b) => appTotals[b] - appTotals[a])

  // Build per-app series
  const series = apps.map((appName) => {
    const data = Array<number>(7).fill(0)
    for (const e of entries.value) {
      if (e.app_name === appName && e.day_index >= 0 && e.day_index < 7) {
        data[e.day_index] += e.total_duration
      }
    }
    return {
      name: appName,
      type: 'bar',
      stack: 'total',
      data,
      itemStyle: { color: getAppColor(appName) },
      emphasis: { focus: 'series' },
    }
  })

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const lines = params
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((p) => `<span style="color:${p.color}">■</span> ${p.seriesName}: ${formatDuration(p.value)}`)
        const total = params.reduce((s: number, p: any) => s + p.value, 0)
        return [params[0].name, ...lines, `<b>合计: ${formatDuration(total)}</b>`].join('<br/>')
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: '#aaa', fontSize: 11 },
      pageTextStyle: { color: '#aaa' },
    },
    grid: { left: 8, right: 8, top: 8, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: DAY_NAMES,
      axisLabel: { color: '#aaa' },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#888',
        formatter: (v: number) => formatDuration(v),
      },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    series,
  }
})

const hasData = computed(() => entries.value.length > 0)

// --- Methods ---
function changeWeek(delta: number): void {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + delta * 7)
  if (d > thisMonday()) return
  weekStart.value = d
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const deviceId = props.deviceId !== 'all' ? props.deviceId : undefined
    entries.value = await api.getWeeklyUsage(weekStartUnix.value, deviceId)
  } catch (e) {
    console.error(e)
    error.value = '加载失败，请检查服务器连接'
    entries.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([weekStart, () => props.deviceId], load)
</script>

<style scoped>
.week-view { display: flex; flex-direction: column; gap: 24px; }

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

.date-label { font-size: 16px; color: #eee; min-width: 220px; }

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
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #555;
  font-size: 14px;
}
</style>
