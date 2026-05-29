<template>
  <div class="admin-shell">
    <!-- ── Sidebar ─────────────────────────────────────────── -->
    <aside class="sidebar">
      <!-- Brand -->
      <div class="brand">
        <div class="brand-mark">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <path d="M16 3 4 9v14l12 6 12-6V9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M4 9l12 6 12-6M16 15v14" stroke="currentColor" stroke-width="1.4"/>
            <circle cx="10" cy="19" r="1.1" fill="currentColor"/>
            <circle cx="22" cy="20" r="1.1" fill="currentColor"/>
            <circle cx="16" cy="22" r="1.1" fill="currentColor"/>
          </svg>
        </div>
        <div class="col">
          <div class="brand-name">Dice<span class="amp">&amp;</span>Soup</div>
          <div class="brand-sub">GAME · MASTER · AI</div>
        </div>
      </div>

      <!-- Nav -->
      <template v-for="group in NAV" :key="group.group">
        <div class="nav-group">{{ t(group.group) }}</div>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeKey === item.id, disabled: item.disabled }"
          @click="!item.disabled && navigate(item.route)"
        >
          <span class="ico">
            <DsIcon :name="item.icon" :size="16" />
          </span>
          <span>{{ t(item.label) }}</span>
          <span v-if="item.soon" class="badge-mini">{{ t('common.soon') }}</span>
        </div>
      </template>

      <!-- Footer -->
      <div class="sidebar-foot">
        <div class="avatar sm role-bot">{{ adminInitial }}</div>
        <div class="who">
          <div class="name">{{ auth.admin?.displayName || 'admin' }}</div>
          <div class="sub">{{ t('sidebar.role') }}</div>
        </div>
        <button class="icon-btn" :title="t('sidebar.logout')" @click="handleLogout" style="margin-left: auto;">
          <DsIcon name="key" :size="15" />
        </button>
      </div>
    </aside>

    <!-- ── Main area ──────────────────────────────────────── -->
    <div class="main">
      <!-- Topbar -->
      <div class="topbar">
        <div class="crumbs">
          <template v-for="(crumb, i) in crumbs" :key="i">
            <span :class="{ cur: i === crumbs.length - 1 }">{{ crumb }}</span>
            <span v-if="i < crumbs.length - 1" class="sep">
              <DsIcon name="chevron" :size="12" />
            </span>
          </template>
        </div>
        <div class="spacer" />

        <!-- Bot status -->
        <div
          class="status-dot"
          :class="botStatus"
          :title="botTooltip"
          @click="checkBotStatus"
        >
          <span class="dot" :class="{ 'dot-pulse': botConnected === true }" />
          <span>{{ botLabel }}</span>
        </div>

        <!-- Language switcher -->
        <div class="lang-switcher">
          <button
            v-for="loc in LOCALES"
            :key="loc.value"
            class="lang-btn"
            :class="{ active: currentLocale === loc.value }"
            @click="switchLocale(loc.value)"
          >{{ loc.native }}</button>
        </div>

        <!-- Theme toggle -->
        <button
          class="icon-btn"
          :title="isDark ? t('topbar.themeLight') : t('topbar.themeDark')"
          @click="toggleTheme"
        >
          <DsIcon :name="isDark ? 'sun' : 'moon'" :size="16" />
        </button>
      </div>

      <!-- Page content -->
      <div class="content-area">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import DsIcon from '@/components/DsIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { LOCALES, setLocale, type Locale } from '@/i18n'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const auth = useAuthStore()
const { isDark, toggle: toggleTheme } = useTheme()
const { t, locale } = useI18n()

const currentLocale = computed(() => locale.value as Locale)
function switchLocale(loc: Locale) { setLocale(loc) }

// ── Nav structure ─────────────────────────────────────────────
const NAV = [
  { group: 'nav.groups.overview', items: [
    { id: 'dashboard',   route: 'Dashboard',  label: 'nav.items.dashboard',  icon: 'dashboard' },
  ]},
  { group: 'nav.groups.operations', items: [
    { id: 'logs',        route: 'GameLogs',   label: 'nav.items.gameLogs',   icon: 'scroll' },
    { id: 'sessions',    route: 'Sessions',   label: 'nav.items.sessions',   icon: 'sessions', soon: true, disabled: true },
    { id: 'users',       route: 'Users',      label: 'nav.items.users',      icon: 'users',    soon: true, disabled: true },
  ]},
  { group: 'nav.groups.content', items: [
    { id: 'puzzles',     route: 'Puzzles',    label: 'nav.items.puzzles',    icon: 'soup' },
    { id: 'content',     route: 'Content',    label: 'nav.items.content',    icon: 'book',     soon: true, disabled: true },
  ]},
  { group: 'nav.groups.modules', items: [
    { id: 'dice',        route: 'Dice',       label: 'nav.items.dice',       icon: 'dice' },
    { id: 'boardgame',   route: 'BoardGame',  label: 'nav.items.boardGame',  icon: 'card',     soon: true, disabled: true },
    { id: 'trpg',        route: 'Trpg',       label: 'nav.items.trpg',       icon: 'book',     soon: true, disabled: true },
  ]},
  { group: 'nav.groups.system', items: [
    { id: 'llm-config',  route: 'LLMConfig',  label: 'nav.items.llmConfig',  icon: 'lightning' },
    { id: 'prompts',     route: 'Prompts',    label: 'nav.items.prompts',    icon: 'prompt' },
    { id: 'config',      route: 'Config',     label: 'nav.items.config',     icon: 'settings' },
    { id: 'system-logs', route: 'SystemLogs', label: 'nav.items.systemLogs', icon: 'terminal' },
    { id: 'audit',       route: 'Audit',      label: 'nav.items.audit',      icon: 'audit',    soon: true, disabled: true },
  ]},
]

const CRUMB_MAP = computed<Record<string, string[]>>(() => ({
  // 总览
  Dashboard:  [t('nav.groups.overview'),    t('nav.items.dashboard')],
  // 运营
  GameLogs:   [t('nav.groups.operations'),  t('nav.items.gameLogs')],
  Sessions:   [t('nav.groups.operations'),  t('nav.items.sessions')],
  Users:      [t('nav.groups.operations'),  t('nav.items.users')],
  // 内容库
  Puzzles:    [t('nav.groups.content'),     t('nav.items.puzzles')],
  Content:    [t('nav.groups.content'),     t('nav.items.content')],
  // 游戏模块
  Dice:       [t('nav.groups.modules'),     t('nav.items.dice')],
  BoardGame:  [t('nav.groups.modules'),     t('nav.items.boardGame')],
  Trpg:       [t('nav.groups.modules'),     t('nav.items.trpg')],
  // 系统
  LLMConfig:  [t('nav.groups.system'),      t('nav.items.llmConfig')],
  Prompts:    [t('nav.groups.system'),      t('nav.items.prompts')],
  Config:     [t('nav.groups.system'),      t('nav.items.config')],
  SystemLogs: [t('nav.groups.system'),      t('nav.items.systemLogs')],
  Audit:      [t('nav.groups.system'),      t('nav.items.audit')],
}))

const activeKey = computed(() => {
  const name = route.name as string
  if (name === 'SystemLogs') return 'system-logs'
  if (name === 'LLMConfig')  return 'llm-config'
  if (name === 'BoardGame')  return 'boardgame'
  return name?.toLowerCase() ?? 'dashboard'
})

const crumbs = computed(() => CRUMB_MAP.value[route.name as string] ?? ['Dice&Soup'])

const adminInitial = computed(() =>
  (auth.admin?.displayName || 'A')[0].toUpperCase()
)

function navigate(routeName: string) {
  router.push({ name: routeName })
}

// ── Bot status ────────────────────────────────────────────────
const botConnected = ref<boolean | null>(null)
let statusTimer: ReturnType<typeof setInterval> | null = null

const botStatus = computed(() => {
  if (botConnected.value === null) return 'checking'
  return botConnected.value ? 'connected' : 'disconnected'
})
const botLabel = computed(() => {
  if (botConnected.value === null) return t('topbar.botChecking')
  return botConnected.value ? t('topbar.botOnline') : t('topbar.botOffline')
})
const botTooltip = computed(() => {
  if (botConnected.value === null) return t('topbar.botTooltipChecking')
  return botConnected.value ? t('topbar.botTooltipOnline') : t('topbar.botTooltipOffline')
})

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
  statusTimer = setInterval(checkBotStatus, 15_000)
})
onUnmounted(() => {
  if (statusTimer !== null) clearInterval(statusTimer)
})

// ── Logout ────────────────────────────────────────────────────
async function handleLogout() {
  await auth.logout()
  router.push('/login')
  message.success(t('sidebar.logoutSuccess'))
}
</script>

<style scoped>
.lang-switcher {
  display: flex;
  gap: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px;
}
.lang-btn {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: none;
  border: 0;
  cursor: pointer;
  transition: background 120ms, color 120ms;
  line-height: 1.4;
}
.lang-btn:hover { color: var(--fg-primary); }
.lang-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
</style>
