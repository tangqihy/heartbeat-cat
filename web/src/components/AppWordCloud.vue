<template>
  <div class="word-cloud-wrap">
    <v-chart :option="wordCloudOption" autoresize class="word-cloud-chart" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAppColor, formatDuration } from '../utils/colors'
import { getAppIconUrl } from '../utils/app-icons'

export interface WordCloudItem {
  app_name: string
  total_duration: number
}

const props = defineProps<{ items: WordCloudItem[] }>()

const wordCloudOption = computed(() => {
  const list = [...props.items]
    .filter((r) => r.total_duration > 0)
    .sort((a, b) => b.total_duration - a.total_duration)

  if (list.length === 0) {
    return { series: [] }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      trigger: 'item',
      confine: true,
      formatter: (params: { name: string; value: number }) => {
        const item = list.find((r) => r.app_name === params.name)
        const duration = item ? item.total_duration : params.value
        const url = getAppIconUrl(params.name)
        return `<img src="${url}" width="16" height="16" style="vertical-align:middle;margin-right:4px"/> ${params.name}<br/><b>${formatDuration(duration)}</b>`
      },
      backgroundColor: 'rgba(30,30,30,0.95)',
      borderColor: '#333',
      textStyle: { color: '#ddd', fontSize: 12 },
      padding: [8, 12],
    },
    series: [
      {
        type: 'wordCloud',
        shape: 'circle',
        left: 'center',
        top: 'center',
        width: '92%',
        height: '92%',
        sizeRange: [14, 52],
        rotationRange: [-15, 15],
        rotationStep: 15,
        gridSize: 6,
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: {
          fontFamily: 'Microsoft YaHei, PingFang SC, -apple-system, sans-serif',
          fontWeight: 'bold',
          color: (params: { name: string }) => getAppColor(params.name),
        },
        emphasis: {
          focus: 'self',
          textStyle: {
            textShadowBlur: 12,
            textShadowColor: 'rgba(255,255,255,0.4)',
            fontWeight: 'bold',
          },
        },
        data: list.map((r) => ({
          name: r.app_name,
          value: r.total_duration,
        })),
      },
    ],
  }
})
</script>

<style scoped>
.word-cloud-wrap {
  width: 100%;
  min-height: 380px;
  padding: 8px;
}

.word-cloud-chart {
  width: 100%;
  height: 380px;
}
</style>
