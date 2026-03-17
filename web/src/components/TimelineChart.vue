<template>
  <div class="chart-wrap" v-if="props.sessions.length">
    <v-chart :option="option" autoresize style="height: 100%" />
  </div>
  <div class="empty" v-else>暂无数据</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Session, Device } from '../api/client'
import { getAppColor, formatDuration, formatTime } from '../utils/colors'

const props = defineProps<{
  sessions: Session[]
  devices: Device[]
  dayStart: number   // unix seconds of 00:00 local time
}>()

// Unique device IDs that appear in the session list (preserving order)
const deviceIds = computed(() => [...new Set(props.sessions.map((s) => s.device_id))])

const deviceLabel = (id: string) =>
  props.devices.find((d) => d.id === id)?.name ?? id

const option = computed(() => {
  const ids = deviceIds.value
  const dayStartMs = props.dayStart * 1000
  const dayEndMs   = dayStartMs + 86400 * 1000

  const data = props.sessions.map((s) => ({
    value: [
      ids.indexOf(s.device_id),
      s.start_time * 1000,
      s.end_time   * 1000,
      s.app_name,
      s.duration,
    ],
    itemStyle: { color: getAppColor(s.app_name) },
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params: any) => {
        const [, start, end, appName, duration] = params.value as [number, number, number, string, number]
        return `<b>${appName}</b><br/>${formatTime(start / 1000)} – ${formatTime(end / 1000)}<br/>${formatDuration(duration)}`
      },
    },
    grid: { left: 8, right: 16, top: 8, bottom: 32, containLabel: true },
    xAxis: {
      type: 'time',
      min: dayStartMs,
      max: dayEndMs,
      axisLabel: {
        color: '#888',
        formatter: (val: number) => {
          const d = new Date(val)
          return `${String(d.getHours()).padStart(2, '0')}:00`
        },
      },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    yAxis: {
      type: 'category',
      data: ids.map(deviceLabel),
      axisLabel: { color: '#ccc' },
    },
    series: [
      {
        type: 'custom',
        renderItem: (_params: unknown, api: any) => {
          const yIdx    = api.value(0)
          const start   = api.coord([api.value(1), yIdx])
          const end     = api.coord([api.value(2), yIdx])
          const height  = (api.size([0, 1]) as [number, number])[1] * 0.65
          const x       = Math.min(start[0], end[0])
          const width   = Math.max(end[0] - start[0], 2)
          return {
            type: 'rect',
            shape: { x, y: start[1] - height / 2, width, height, r: 3 },
            style: api.style(),
          }
        },
        encode: { x: [1, 2], y: 0 },
        data,
      },
    ],
  }
})
</script>

<style scoped>
.chart-wrap {
  width: 100%;
  height: 100%;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #555;
  font-size: 14px;
}
</style>
