import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },

        // ── 总览 ───────────────────────────────────────────────────
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/admin/DashboardView.vue'),
        },

        // ── 运营 ───────────────────────────────────────────────────
        {
          path: 'logs',
          name: 'GameLogs',
          component: () => import('@/views/admin/GameLogsView.vue'),
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('@/views/admin/PlaceholderView.vue'),
          props: { title: '玩家管理', phase: 2 },
        },

        // ── 内容管理 ────────────────────────────────────────────────
        {
          path: 'puzzles',
          name: 'Puzzles',
          component: () => import('@/views/admin/PuzzlesView.vue'),
        },
        {
          path: 'undercover-words',
          name: 'UndercoverWords',
          component: () => import('@/views/admin/UndercoverWordsView.vue'),
        },

        // ── 系统 ───────────────────────────────────────────────────
        {
          path: 'llm-config',
          name: 'LLMConfig',
          component: () => import('@/views/admin/LLMConfigView.vue'),
        },
        {
          path: 'prompts',
          name: 'Prompts',
          component: () => import('@/views/admin/PromptsView.vue'),
        },
        {
          path: 'config',
          name: 'Config',
          component: () => import('@/views/admin/ConfigView.vue'),
        },
        {
          path: 'system-logs',
          name: 'SystemLogs',
          component: () => import('@/views/admin/LogViewer.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

// 路由守卫：未登录跳转到 /login
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth !== false && !auth.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
})

export default router
