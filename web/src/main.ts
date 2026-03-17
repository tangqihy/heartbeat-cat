import { createApp } from 'vue'
import App from './App.vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, CustomChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const app = createApp(App)
app.component('VChart', VChart)
app.mount('#app')
