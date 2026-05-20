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
        <n-space>
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
import { ref, computed, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayout, NLayoutSider, NLayoutHeader, NLayoutContent,
  NMenu, NButton, NSpace, NText,
  useMessage,
  type MenuOption,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const auth = useAuthStore()
const collapsed = ref(false)

const menuOptions: MenuOption[] = [
  { label: '仪表盘', key: 'dashboard', icon: () => '📊' },
  { label: 'Log Viewer', key: 'logs', icon: () => '📋' },
  { label: '配置中心', key: 'config', icon: () => '⚙️' },
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
</style>
