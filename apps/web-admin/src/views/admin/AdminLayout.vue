<template>
  <n-layout has-sider style="height: 100vh;">
    <!-- 侧边栏 -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      v-model:collapsed="collapsed"
    >
      <div class="logo">
        <span v-if="!collapsed">🎲 Dice&Soup</span>
        <span v-else>🎲</span>
      </div>
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :options="menuOptions"
        :value="activeKey"
        @update:value="handleMenuClick"
      />
    </n-layout-sider>

    <n-layout>
      <!-- 顶栏 -->
      <n-layout-header bordered style="height: 48px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 14px; color: #888;">{{ currentRouteTitle }}</span>
        <n-space align="center">
          <!-- Bot 连接状态指示器 -->
          <n-tooltip>
            <template #trigger>
              <span
                class="bot-status"
                :class="botConnected === null ? 'checking' : botConnected ? 'connected' : 'disconnected'"
                @click="checkBotStatus"
                style="cursor: pointer;"
              >
                <span v-if="botConnected === null">⏳ 检测中...</span>
                <span v-else-if="botConnected">🟢 Bot 在线</span>
                <span v-else>🔴 Bot 离线</span>
              </span>
            </template>
            <span v-if="botConnected === null">正在检测 Bot 状态...</span>
            <span v-else-if="botConnected">NapCat 已连接，Bot 正常工作。点击刷新。</span>
            <span v-else>NapCat 未连接，Bot 不可用。请检查 NapCat 进程后点击刷新。</span>
          </n-tooltip>
          <n-text depth="3" style="font-size: 13px;">{{ auth.admin?.displayName }}</n-text>
          <n-button text @click="handleLogout">退出登录</n-button>
        </n-space>
      </n-layout-header>

      <!-- 内容区 -->
      <n-layout-content style="padding: 20px; overflow: auto; height: calc(100vh - 48px);">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayout, NLayoutSider, NLayoutHeader, NLayoutContent,
  NMenu, NButton, NSpace, NText, NTooltip,
  useMessage,
  type MenuOption,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const auth = useAuthStore()
const collapsed = ref(false)

// ── Bot 状态 ──────────────────────────────────────────────────────────────────
const botConnected = ref<boolean | null>(null)
let statusTimer: ReturnType<typeof setInterval> | null = null

async function checkBotStatus() {
  try {
    const res = await fetch('/health')
    const data = await res.json()
    botConnected.value = data.onebot?.connected === true
  } catch {
    botConnected.value = false
  }
}

onMounted(() => {
  checkBotStatus()
  // 每 15 秒轮询一次
  statusTimer = setInterval(checkBotStatus, 15_000)
})

onUnmounted(() => {
  if (statusTimer !== null) clearInterval(statusTimer)
})

// ── 菜单 ──────────────────────────────────────────────────────────────────────
const menuOptions: MenuOption[] = [
  { label: '仪表盘', key: 'dashboard', icon: () => '📊' },
  { label: 'Log Viewer', key: 'logs', icon: () => '📋' },
  { label: '配置中心', key: 'config', icon: () => '⚙️' },
  { type: 'divider' },
  { label: '🐢 题库管理', key: 'puzzles', icon: () => '' },
  { type: 'divider' },
  { label: '用户管理', key: 'users', icon: () => '👥' },
  { label: '内容管理', key: 'content', icon: () => '🗂️' },
  { label: '会话监控', key: 'sessions', icon: () => '🎮' },
  { label: '审计日志', key: 'audit', icon: () => '🔍' },
]

const activeKey = computed(() => route.name as string || 'dashboard')

const routeTitleMap: Record<string, string> = {
  Dashboard: '仪表盘',
  LogViewer: 'Log Viewer',
  Config: '配置中心',
  Puzzles: '🐢 题库管理',
  Users: '用户管理',
  Content: '内容管理',
  Sessions: '会话监控',
  Audit: '审计日志',
}
const currentRouteTitle = computed(() => routeTitleMap[route.name as string] ?? '')

function handleMenuClick(key: string) {
  router.push({ name: key.charAt(0).toUpperCase() + key.slice(1) })
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
  message.success('已退出登录')
}
</script>

<style scoped>
.logo {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  white-space: nowrap;
  overflow: hidden;
}

.bot-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  user-select: none;
  transition: opacity 0.2s;
}
.bot-status.connected {
  background: rgba(82, 196, 26, 0.15);
  color: #52c41a;
}
.bot-status.disconnected {
  background: rgba(255, 77, 79, 0.15);
  color: #ff4d4f;
}
.bot-status.checking {
  background: rgba(250, 173, 20, 0.15);
  color: #faad14;
}
</style>
