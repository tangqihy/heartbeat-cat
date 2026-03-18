<template>
  <div class="stats-view">
    <p v-if="!userId" class="empty-msg">请输入 User ID 以查看统计</p>

    <template v-else>
      <div class="loading" v-if="loading">加载中…</div>
      <div class="error" v-else-if="error">{{ error }}</div>

      <template v-else>
        <!-- Heatmap -->
        <section class="section">
          <h2 class="section-title">键盘活动热力图</h2>
          <div class="heatmap-wrap">
            <div class="heatmap-months">
              <span v-for="(m, i) in monthLabels" :key="i" class="month-label" :style="{ left: m.left + '%' }">{{ m.name }}</span>
            </div>
            <div class="heatmap-grid">
              <div class="heatmap-legend">
                <span>少</span>
                <span v-for="c in heatColors" :key="c" class="legend-cell" :style="{ background: c }"></span>
                <span>多</span>
              </div>
              <div class="heatmap-cells">
                <div
                  v-for="(cell, idx) in heatmapCells"
                  :key="idx"
                  class="cell"
                  :class="{ empty: !cell.count }"
                  :style="{ background: cell.color }"
                  :title="`${cell.date}\n⌨️ ${cell.keyboard_count || 0}  🖱️ ${cell.mouse_count || 0}`"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Input Trend Chart -->
        <section class="section">
          <h2 class="section-title">输入趋势（近 30 天）</h2>
          <div class="chart-box">
            <div class="empty" v-if="!inputTrend.length">暂无数据</div>
            <v-chart v-else :option="inputTrendOption" autoresize style="height: 280px" />
          </div>
        </section>

        <!-- 总时长（不含锁屏） -->
        <div class="stats-summary" v-if="appUsageNoLock.length">
          <span class="stats-total">今日总时长 <b>{{ formatDuration(totalDurationNoLock) }}</b> <span class="stat-hint">(不含锁屏)</span></span>
        </div>

        <!-- App Usage Pie Chart（不含锁屏） -->
        <section class="section">
          <h2 class="section-title">今日应用使用（不含锁屏）</h2>
          <div class="chart-box">
            <div class="empty" v-if="!appUsageNoLock.length">暂无数据</div>
            <v-chart v-else :option="appUsageOption" autoresize style="height: 300px" />
          </div>
        </section>

        <!-- App Word Cloud（不含锁屏） -->
        <section class="section">
          <h2 class="section-title">应用使用 文字云</h2>
          <div class="chart-box word-cloud-box">
            <div class="empty" v-if="!appUsageNoLock.length">暂无数据</div>
            <AppWordCloud v-else :items="appUsageNoLock" />
          </div>
        </section>

        <!-- Resource distribution -->
        <section class="section" v-if="hasResources">
          <h2 class="section-title">五元素资源</h2>
          <div class="resource-cards">
            <div
              v-for="r in resourceList"
              :key="r.key"
              class="resource-card"
              :style="{ borderColor: r.color + '40' }"
            >
              <span class="res-icon">{{ r.icon }}</span>
              <span class="res-name" :style="{ color: r.color }">{{ r.name }}</span>
              <span class="res-amount" :style="{ color: r.color }">{{ r.amount.toLocaleString() }}</span>
            </div>
          </div>
          <div class="chart-box" v-if="resourcePieOption">
            <v-chart :option="resourcePieOption" autoresize style="height: 260px" />
          </div>
        </section>

        <!-- Intensity metrics -->
        <section class="section" v-if="intensityData.length">
          <h2 class="section-title">今日活动强度</h2>
          <div class="intensity-cards">
            <div v-for="m in intensityData" :key="m.category" class="intensity-card">
              <div class="int-cat">{{ catNames[m.category] || m.category }}</div>
              <div class="int-row"><span class="int-label">APM</span><span class="int-val">{{ m.apm }}</span></div>
              <div class="int-row"><span class="int-label">专注比</span><span class="int-val">{{ (m.focus_ratio * 100).toFixed(0) }}%</span></div>
              <div class="int-row"><span class="int-label">多样性</span><span class="int-val">{{ m.diversity }} 应用</span></div>
              <div class="int-bonus">品质加成 +{{ m.quality_bonus }}%</div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api, getHeatmap, getInputTrend, getUserResources, getUserIntensity } from '../api/client'
import type { ResourceInfo, CategoryIntensity } from '../api/client'
import { getAppColor, formatDuration, excludeLockScreen } from '../utils/colors'
import { getAppIconUrl } from '../utils/app-icons'
import AppWordCloud from '../components/AppWordCloud.vue'

const props = defineProps<{ userId: string }>()

const loading = ref(false)
const error = ref('')
const heatmapData = ref<Array<{ date: string; keyboard_count: number; mouse_count: number }>>([])
const inputTrend = ref<Array<{ date: string; keyboard_count: number; mouse_count: number }>>([])
const appUsage = ref<Array<{ app_name: string; total_duration: number; total_keyboard: number; total_mouse: number }>>([])
const resources = ref<ResourceInfo | null>(null)
const intensityData = ref<CategoryIntensity[]>([])

const catNames: Record<string, string> = {
  office: '办公', devtool: '工具', game: '游戏', browser: '浏览器', chat: '聊天',
}

const RESOURCE_DEFS: Record<string, { name: string; icon: string; color: string }> = {
  order_crystal: { name: '秩序晶体', icon: '💎', color: '#42a5f5' },
  creation_shard: { name: '创造结晶', icon: '🔮', color: '#ab47bc' },
  passion_spark: { name: '激情火花', icon: '🔥', color: '#ef5350' },
  info_fragment: { name: '信息碎片', icon: '🧩', color: '#66bb6a' },
  social_spark: { name: '社交火花', icon: '⚡', color: '#ffa726' },
}

const hasResources = computed(() => resources.value && Object.values(resources.value).some(v => v > 0))

const resourceList = computed(() => {
  if (!resources.value) return []
  return Object.entries(RESOURCE_DEFS).map(([key, def]) => ({
    key,
    ...def,
    amount: (resources.value as any)[key] || 0,
  }))
})

const resourcePieOption = computed(() => {
  if (!hasResources.value) return null
  const data = resourceList.value.filter(r => r.amount > 0)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      data: data.map(r => ({
        name: r.name,
        value: r.amount,
        itemStyle: { color: r.color },
      })),
    }],
  }
})

const appUsageNoLock = computed(() => excludeLockScreen(appUsage.value))
const totalDurationNoLock = computed(() => appUsageNoLock.value.reduce((s, r) => s + r.total_duration, 0))

const heatColors = ['transparent', '#1a3a4a', '#2d6a8a', '#4fc3f7', '#7c4dff']

// Heatmap: 52 cols x 7 rows, past year
const heatmapCells = computed(() => {
  const data = heatmapData.value
  const map = new Map<string, { keyboard_count: number; mouse_count: number }>()
  for (const r of data) {
    map.set(r.date, { keyboard_count: r.keyboard_count ?? 0, mouse_count: r.mouse_count ?? 0 })
  }

  const counts: number[] = []
  for (const [_d, v] of map) {
    const t = v.keyboard_count + v.mouse_count
    if (t > 0) counts.push(t)
  }
  counts.sort((a, b) => a - b)
  const q1 = counts[Math.floor(counts.length * 0.25)] ?? 0
  const q2 = counts[Math.floor(counts.length * 0.5)] ?? 0
  const q3 = counts[Math.floor(counts.length * 0.75)] ?? 0

  function getColor(count: number): string {
    if (count <= 0) return heatColors[0]
    if (count <= q1) return heatColors[1]
    if (count <= q2) return heatColors[2]
    if (count <= q3) return heatColors[3]
    return heatColors[4]
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(today)
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - 364)

  const cells: Array<{ date: string; count: number; color: string; keyboard_count: number; mouse_count: number }> = []
  for (let i = 0; i < 364; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const v = map.get(dateStr) ?? { keyboard_count: 0, mouse_count: 0 }
    const count = v.keyboard_count + v.mouse_count
    cells.push({
      date: dateStr,
      count,
      color: getColor(count),
      keyboard_count: v.keyboard_count,
      mouse_count: v.mouse_count,
    })
  }
  return cells
})

const monthLabels = computed(() => {
  const labels: Array<{ name: string; left: number }> = []
  const monthSet = new Set<string>()
  for (let c = 0; c < 52; c++) {
    const d = new Date()
    d.setDate(d.getDate() - (52 - c) * 7)
    const m = `${d.getMonth() + 1}月`
    if (!monthSet.has(m)) {
      monthSet.add(m)
      labels.push({ name: m, left: (c / 52) * 100 })
    }
  }
  return labels
})

const inputTrendOption = computed(() => {
  const kb = inputTrend.value.map((r) => r.keyboard_count ?? 0)
  const ms = inputTrend.value.map((r) => r.mouse_count ?? 0)
  const dates = inputTrend.value.map((r) => r.date)
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex
        if (idx == null) return ''
        return `${dates[idx]}<br/>
          <span style="color:#4fc3f7">■</span> 键盘: ${kb[idx].toLocaleString()}<br/>
          <span style="color:#7c4dff">■</span> 鼠标: ${ms[idx].toLocaleString()}`
      },
    },
    legend: {
      data: ['键盘', '鼠标'],
      bottom: 0,
      textStyle: { color: '#aaa', fontSize: 11 },
    },
    grid: { left: 40, right: 24, top: 24, bottom: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#888', fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#888' },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    series: [
      { name: '键盘', type: 'line', data: kb, smooth: true, itemStyle: { color: '#4fc3f7' }, lineStyle: { color: '#4fc3f7' } },
      { name: '鼠标', type: 'line', data: ms, smooth: true, itemStyle: { color: '#7c4dff' }, lineStyle: { color: '#7c4dff' } },
    ],
  }
})

const appUsageOption = computed(() => {
  const sorted = [...appUsageNoLock.value].sort((a, b) => b.total_duration - a.total_duration).slice(0, 12)
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const url = getAppIconUrl(params.name)
        return `<img src="${url}" width="16" height="16" style="vertical-align:middle;margin-right:4px"/> ${params.name}<br/><b>${formatDuration(params.value)}</b>`
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: '#aaa', fontSize: 11 },
      formatter: (name: string) => name,
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        data: sorted.map((r) => ({
          name: r.app_name,
          value: r.total_duration,
          itemStyle: { color: getAppColor(r.app_name) },
        })),
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0 } },
      },
    ],
  }
})

async function load(): Promise<void> {
  if (!props.userId.trim()) return
  loading.value = true
  error.value = ''
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayStart = Math.floor(today.getTime() / 1000)
    const dayEnd = dayStart + 86400

    const [heat, trend, usage, res, intensity] = await Promise.all([
      getHeatmap(props.userId),
      getInputTrend(props.userId, 30),
      api.getUsageSummary(dayStart, dayEnd),
      getUserResources(props.userId).catch(() => null),
      getUserIntensity(props.userId).catch(() => null),
    ])
    heatmapData.value = heat
    inputTrend.value = trend
    appUsage.value = usage
    resources.value = res?.resources ?? null
    intensityData.value = intensity?.metrics ?? []
  } catch (e) {
    console.error(e)
    error.value = '加载失败，请检查服务器连接'
    heatmapData.value = []
    inputTrend.value = []
    appUsage.value = []
    resources.value = null
    intensityData.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.userId,
  () => {
    if (props.userId.trim()) load()
    else {
      heatmapData.value = []
      inputTrend.value = []
      appUsage.value = []
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.stats-view { display: flex; flex-direction: column; gap: 24px; }

.empty-msg { color: #888; font-size: 14px; padding: 24px 0; }

.stats-summary {
  padding: 10px 16px;
  background: #1c1c1c;
  border-radius: 8px;
  font-size: 13px;
  color: #aaa;
}
.stats-total b { color: #eee; }
.stat-hint { font-size: 11px; color: #666; }

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
.word-cloud-box { min-height: 380px; }
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #555;
  font-size: 14px;
}

.heatmap-wrap { background: #1e1e1e; border-radius: 8px; padding: 16px; border: 1px solid #333; }
.heatmap-months { position: relative; height: 16px; margin-bottom: 8px; }
.month-label { position: absolute; font-size: 10px; color: #888; transform: translateX(-50%); }

.heatmap-grid { display: flex; align-items: flex-start; gap: 12px; }
.heatmap-legend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #888;
}
.legend-cell { width: 10px; height: 10px; border-radius: 2px; }

.heatmap-cells {
  display: grid;
  grid-template-columns: repeat(52, 1fr);
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 2px;
  min-width: 8px;
  min-height: 8px;
}
.cell.empty { background: #252525 !important; }

.resource-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.resource-card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.res-icon { font-size: 24px; }
.res-name { font-size: 12px; font-weight: 600; }
.res-amount { font-size: 18px; font-weight: 700; }

.intensity-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.intensity-card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px;
}
.int-cat { font-size: 13px; font-weight: 600; color: #ddd; margin-bottom: 6px; }
.int-row { display: flex; justify-content: space-between; font-size: 12px; color: #888; margin-bottom: 2px; }
.int-label { color: #666; }
.int-val { color: #aaa; }
.int-bonus { font-size: 12px; color: #4caf50; font-weight: 600; margin-top: 4px; }
</style>
