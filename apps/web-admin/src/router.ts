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
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/admin/DashboardView.vue'),
        },
        {
          path: 'logs',
          name: 'GameLogs',
          component: () => import('@/views/admin/GameLogsView.vue'),
        },
        {
          path: 'system-logs',
          name: 'SystemLogs',
          component: () => import('@/views/admin/LogViewer.vue'),
        },
        {
          path: 'llm-config',
          name: 'LLMConfig',
          component: () => import('@/views/admin/LLMConfigView.vue'),
        },
        {
          path: 'config',
          name: 'Config',
          component: () => import('@/views/admin/ConfigView.vue'),
        },
        {
          path: 'puzzles',
          name: 'Puzzles',
          component: () => import('@/views/admin/PuzzlesView.vue'),
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('@/views/admin/PlaceholderView.vue'),
          props: { title: '用户管理', phase: 2 },
        },
        {
          path: 'content',
          name: 'Content',
          component: () => import('@/views/admin/PlaceholderView.vue'),
          props: { title: '内容管理', phase: 2 },
        },
        {
          path: 'sessions',
          name: 'Sessions',
          component: () => import('@/views/admin/PlaceholderView.vue'),
          props: { title: '会话监控', phase: 2 },
        },
        {
          path: 'audit',
          name: 'Audit',
          component: () => import('@/views/admin/PlaceholderView.vue'),
          props: { title: '审计日志', phase: 2 },
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
