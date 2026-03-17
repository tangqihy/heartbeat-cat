<template>
  <div class="chart-wrap" v-if="props.items.length">
    <v-chart :option="option" autoresize style="height: 100%" />
  </div>
  <div class="empty" v-else>暂无数据</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UsageSummary } from '../api/client'
import { getAppColor, formatDuration } from '../utils/colors'

const props = defineProps<{ items: UsageSummary[] }>()

const option = computed(() => {
  // Reverse so longest bar is at top
  const sorted = [...props.items].reverse()
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const p = params[0]
        return `${p.name}<br/><b>${formatDuration(p.value)}</b>`
      },
    },
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#888',
        formatter: (v: number) => formatDuration(v),
      },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((r) => r.app_name),
      axisLabel: { color: '#ccc', fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((r) => ({
          value: r.total_duration,
          itemStyle: { color: getAppColor(r.app_name), borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#aaa',
            fontSize: 11,
            formatter: () => formatDuration(r.total_duration),
          },
        })),
        barMaxWidth: 32,
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
