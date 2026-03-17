<template>
  <div class="input-stats" v-if="totalKeyboard > 0 || totalMouse > 0">
    <div class="stats-row">
      <!-- Bongo Cat mini SVG -->
      <div class="cat-mini">
        <svg width="80" height="70" viewBox="0 0 180 140">
          <g class="ear-left" :class="{ wiggle: mouseAnim }">
            <polygon points="42,52 30,12 58,38" fill="#f5f5f5" stroke="#555" stroke-width="1"/>
            <polygon points="44,48 35,22 54,40" fill="#ffb5b5"/>
          </g>
          <g class="ear-right" :class="{ wiggle: mouseAnim }">
            <polygon points="138,52 150,12 122,38" fill="#f5f5f5" stroke="#555" stroke-width="1"/>
            <polygon points="136,48 145,22 126,40" fill="#ffb5b5"/>
          </g>
          <ellipse cx="90" cy="72" rx="55" ry="48" fill="#f5f5f5" stroke="#555" stroke-width="1"/>
          <ellipse cx="72" cy="66" rx="5" ry="6" fill="#333"/>
          <ellipse cx="108" cy="66" rx="5" ry="6" fill="#333"/>
          <ellipse cx="74" cy="64" rx="2" ry="2" fill="#fff"/>
          <ellipse cx="110" cy="64" rx="2" ry="2" fill="#fff"/>
          <polygon points="90,76 87,80 93,80" fill="#ffb5b5"/>
          <path d="M82,83 Q90,90 98,83" fill="none" stroke="#888" stroke-width="1.2"/>
        </svg>
      </div>
      <!-- Counters -->
      <div class="counters">
        <div class="counter-card">
          <span class="counter-icon">⌨</span>
          <span class="counter-value">{{ formatNum(totalKeyboard) }}</span>
          <span class="counter-label">键盘敲击</span>
        </div>
        <div class="counter-card">
          <span class="counter-icon">🖱</span>
          <span class="counter-value">{{ formatNum(totalMouse) }}</span>
          <span class="counter-label">鼠标点击</span>
        </div>
      </div>
    </div>
    <!-- Hourly activity chart -->
    <div class="hourly-chart" v-if="hasHourlyData">
      <v-chart :option="chartOption" autoresize style="height: 120px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { Session } from '../api/client'

const props = defineProps<{ sessions: Session[]; dayStart: number }>()

const mouseAnim = ref(false)
let animTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  animTimer = setInterval(() => {
    if (totalMouse.value > 0) {
      mouseAnim.value = true
      setTimeout(() => { mouseAnim.value = false }, 200)
    }
  }, 3000)
})
onUnmounted(() => { if (animTimer) clearInterval(animTimer) })

const totalKeyboard = computed(() => props.sessions.reduce((s, r) => s + r.keyboard_events, 0))
const totalMouse    = computed(() => props.sessions.reduce((s, r) => s + r.mouse_events, 0))

const hourlyData = computed(() => {
  const kb = Array<number>(24).fill(0)
  const ms = Array<number>(24).fill(0)
  for (const s of props.sessions) {
    const hour = Math.floor((s.start_time - props.dayStart) / 3600)
    if (hour >= 0 && hour < 24) {
      kb[hour] += s.keyboard_events
      ms[hour] += s.mouse_events
    }
  }
  return { kb, ms }
})

const hasHourlyData = computed(() =>
  hourlyData.value.kb.some(v => v > 0) || hourlyData.value.ms.some(v => v > 0)
)

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { show: false },
  grid: { left: 8, right: 8, top: 8, bottom: 24, containLabel: true },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
    axisLabel: { color: '#666', fontSize: 10, interval: 3 },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#555', fontSize: 10 },
    splitLine: { lineStyle: { color: '#2a2a2a' } },
  },
  series: [
    {
      name: '键盘', type: 'bar', stack: 'total',
      data: hourlyData.value.kb,
      itemStyle: { color: '#5470c6' },
      barMaxWidth: 16,
    },
    {
      name: '鼠标', type: 'bar', stack: 'total',
      data: hourlyData.value.ms,
      itemStyle: { color: '#91cc75' },
      barMaxWidth: 16,
    },
  ],
}))

function formatNum(n: number): string {
  if (n >= 100_000) return (n / 1000).toFixed(0) + 'k'
  if (n >= 10_000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}
</script>

<style scoped>
.input-stats {
  background: #1c1c1c;
  border-radius: 8px;
  padding: 16px;
}
.stats-row {
  display: flex;
  align-items: center;
  gap: 20px;
}
.cat-mini {
  flex-shrink: 0;
}
.cat-mini .ear-left, .cat-mini .ear-right {
  transition: transform 0.15s ease-out;
  transform-origin: bottom center;
}
.cat-mini .ear-left.wiggle  { transform: rotate(-10deg); }
.cat-mini .ear-right.wiggle { transform: rotate(10deg); }

.counters { display: flex; gap: 24px; flex: 1; }
.counter-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.counter-icon { font-size: 20px; }
.counter-value { font-size: 24px; font-weight: 700; color: #eee; font-variant-numeric: tabular-nums; }
.counter-label { font-size: 11px; color: #666; }

.hourly-chart { margin-top: 12px; }
</style>
