import { createApp } from 'vue'
import App from './App.vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, CustomChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts-wordcloud'

use([BarChart, CustomChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const app = createApp(App)
app.component('VChart', VChart)
app.mount('#app')
