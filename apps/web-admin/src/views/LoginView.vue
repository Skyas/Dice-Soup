<template>
  <div class="login-page">
    <div class="login-box">
      <!-- Brand -->
      <div class="login-brand">
        <div class="mark">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <path d="M16 3 4 9v14l12 6 12-6V9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M4 9l12 6 12-6M16 15v14" stroke="currentColor" stroke-width="1.4"/>
            <circle cx="10" cy="19" r="1.1" fill="currentColor"/>
            <circle cx="22" cy="20" r="1.1" fill="currentColor"/>
            <circle cx="16" cy="22" r="1.1" fill="currentColor"/>
          </svg>
        </div>
        <div class="name">Dice<span class="amp">&amp;</span>Soup</div>
        <div class="sub">ADMIN · CONSOLE</div>
      </div>

      <!-- Form -->
      <n-form @submit.prevent="handleLogin">
        <n-form-item :label="t('login.username')" :show-feedback="false" style="margin-bottom: 14px;">
          <n-input
            v-model:value="form.username"
            placeholder="admin"
            :disabled="loading"
            size="large"
          />
        </n-form-item>
        <n-form-item :label="t('login.password')" :show-feedback="false" style="margin-bottom: 24px;">
          <n-input
            v-model:value="form.password"
            type="password"
            :placeholder="t('login.password')"
            show-password-on="click"
            :disabled="loading"
            size="large"
            @keyup.enter="handleLogin"
          />
        </n-form-item>
        <n-button
          type="primary"
          block
          size="large"
          :loading="loading"
          @click="handleLogin"
        >
          {{ loading ? t('login.submitting') : t('login.submit') }}
        </n-button>
      </n-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()

const router = useRouter()
const route = useRoute()
const message = useMessage()
const auth = useAuthStore()

const form = ref({ username: 'admin', password: '' })
const loading = ref(false)

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    message.warning('请填写用户名和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
    const redirect = (route.query.redirect as string) || '/'
    await router.push(redirect)
    message.success(t('login.success'))
  } catch (err: any) {
    message.error(err.message || t('login.error'))
  } finally {
    loading.value = false
  }
}
</script>
