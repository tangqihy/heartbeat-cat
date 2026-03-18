<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <span class="logo">💓 My Heartbeat</span>
        <nav class="tabs">
          <button :class="['tab', { active: view === 'day' }]" @click="view = 'day'">日视图</button>
          <button :class="['tab', { active: view === 'week' }]" @click="view = 'week'">周视图</button>
          <button :class="['tab', { active: view === 'stats' }]" @click="view = 'stats'">统计</button>
          <button :class="['tab', { active: view === 'leaderboard' }]" @click="view = 'leaderboard'">排行榜</button>
          <button :class="['tab', { active: view === 'achievement' }]" @click="view = 'achievement'">成就</button>
        </nav>
      </div>
      <div class="header-right">
        <input v-model="userId" class="user-id-input" placeholder="User ID" />
        <select v-model="deviceId" class="device-select">
          <option value="all">全部设备</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
    </header>

    <main class="main">
      <DayView         v-if="view === 'day'"         :device-id="deviceId" />
      <WeekView        v-else-if="view === 'week'"  :device-id="deviceId" />
      <StatsView       v-else-if="view === 'stats'" :user-id="userId" />
      <LeaderboardView v-else-if="view === 'leaderboard'" :user-id="userId" />
      <AchievementView v-else-if="view === 'achievement'" :user-id="userId" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { api, type Device } from './api/client'

const DayView         = defineAsyncComponent(() => import('./views/DayView.vue'))
const WeekView        = defineAsyncComponent(() => import('./views/WeekView.vue'))
const StatsView       = defineAsyncComponent(() => import('./views/StatsView.vue'))
const LeaderboardView = defineAsyncComponent(() => import('./views/LeaderboardView.vue'))
const AchievementView = defineAsyncComponent(() => import('./views/AchievementView.vue'))

const view     = ref<'day' | 'week' | 'stats' | 'leaderboard' | 'achievement'>('day')
const userId   = ref('')
const deviceId = ref('all')
const devices  = ref<Device[]>([])

onMounted(async () => {
  try {
    devices.value = await api.getDevices()
  } catch { /* server may not be up yet */ }
})
</script>

<style>
/* Global reset + dark theme */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #141414;
  color: #ddd;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  min-height: 100vh;
}

button { font-family: inherit; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; min-height: 100vh; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left { display: flex; align-items: center; gap: 24px; }

.logo { font-size: 16px; font-weight: 600; color: #eee; letter-spacing: 0.02em; }

.tabs { display: flex; gap: 4px; }
.tab {
  background: none;
  border: none;
  color: #888;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}
.tab:hover { background: #242424; color: #ccc; }
.tab.active { background: #2a2a2a; color: #eee; font-weight: 500; }

.user-id-input {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 13px;
  width: 120px;
  margin-right: 8px;
  outline: none;
}
.user-id-input::placeholder { color: #666; }
.user-id-input:hover { border-color: #555; }

.device-select {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}
.device-select:hover { border-color: #555; }

.main {
  flex: 1;
  padding: 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}
</style>
