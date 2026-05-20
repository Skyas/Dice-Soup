import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiPost } from '@/api/client'

interface AdminInfo {
  username: string
  displayName: string
  mustChangePw: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const admin = ref<AdminInfo | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  async function login(username: string, password: string): Promise<void> {
    const data = await apiPost<{ token: string } & AdminInfo>(
      '/api/admin/auth/login',
      { username, password },
      { noAuth: true },
    )
    token.value = data.token
    admin.value = { username: data.username, displayName: data.displayName, mustChangePw: data.mustChangePw }
    localStorage.setItem('admin_token', data.token)
  }

  async function logout(): Promise<void> {
    try {
      await apiPost('/api/admin/auth/logout', {})
    } catch {
      // 忽略登出请求失败
    }
    token.value = null
    admin.value = null
    localStorage.removeItem('admin_token')
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiPost('/api/admin/auth/change-password', { currentPassword, newPassword })
    if (admin.value) admin.value.mustChangePw = false
  }

  return { token, admin, isLoggedIn, login, logout, changePassword }
})
