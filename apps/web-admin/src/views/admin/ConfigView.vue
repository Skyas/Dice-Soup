<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('config.title') }}</h1>
        <p class="page-sub">{{ t('config.sub') }}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn" @click="fetchConfig">
          <DsIcon name="refresh" :size="13" /> {{ t('config.refresh') }}
        </button>
      </div>
    </div>

    <!-- Notice -->
    <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--info-soft); border:1px solid rgba(120,149,194,0.2); border-radius:var(--r-md); font-size:12.5px; color:var(--info);">
      <DsIcon name="shield" :size="14" />
      {{ t('config.notice') }}
    </div>

    <!-- Loading -->
    <div v-if="loading" style="text-align:center; padding:40px; color:var(--fg-muted);">
      <DsIcon name="clock" :size="24" style="opacity:0.4; display:block; margin:0 auto 8px;" />
      {{ t('config.loading') }}
    </div>

    <!-- Config groups -->
    <template v-else>
      <div
        v-for="(group, cat) in grouped"
        :key="cat"
        class="ds-card flush"
      >
        <!-- Section head -->
        <div class="config-section-head">
          <span :class="['config-category-badge', cat]">{{ t(`config.categories.${cat}`) }}</span>
          <span class="section-title">{{ t(`config.categoryDescs.${cat}`) }}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--fg-faint); font-family:var(--font-mono);">{{ t('config.nItems', { n: group.length }) }}</span>
        </div>

        <!-- Config rows -->
        <div
          v-for="item in group"
          :key="item.key"
          class="config-row"
        >
          <div class="config-label">
            <div class="config-desc">{{ item.description || item.key }}</div>
            <div class="config-key">{{ item.key }}</div>
          </div>
          <div class="config-val" :title="JSON.stringify(item.value)">{{ formatValue(item.value) }}</div>
          <button class="btn" style="padding:4px 10px; flex-shrink:0;" @click="openEdit(item)">{{ t('config.edit') }}</button>
        </div>
      </div>

      <div v-if="Object.keys(grouped).length === 0" style="text-align:center; padding:40px; color:var(--fg-muted);">
        暂无配置项
      </div>
    </template>

    <!-- Edit Modal -->
    <n-modal v-model:show="editModal.show" preset="dialog" :title="t('config.modal.title')" style="width:480px;">
      <div style="margin-bottom:16px;">
        <div style="font-size:14px; font-weight:600; color:var(--fg-primary); margin-bottom:4px;">
          {{ editModal.desc || editModal.key }}
        </div>
        <div style="font-size:11px; color:var(--fg-faint); font-family:var(--font-mono);">{{ editModal.key }}</div>
      </div>
      <n-form label-placement="top">
        <n-form-item :label="t('config.modal.fieldValue')">
          <n-input
            v-model:value="editModal.valueStr"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 12 }"
            :placeholder="t('config.modal.placeholder')"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="editModal.show = false">{{ t('config.cancel') }}</n-button>
        <n-button type="primary" :loading="editModal.saving" @click="saveEdit">{{ t('config.save') }}</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet, apiPut } from '@/api/client'

const { t } = useI18n()

interface ConfigItem {
  key: string
  value: unknown
  category: string
  description?: string
}


const message = useMessage()
const loading = ref(false)
const items = ref<ConfigItem[]>([])

// 'llm' 类别由「AI 配置」专页管理，此处不再显示
const HIDDEN_CATEGORIES = new Set(['llm'])

const grouped = computed(() => {
  const result: Record<string, ConfigItem[]> = {}
  const order = ['security', 'game', 'platform', 'ui']
  for (const item of items.value) {
    if (HIDDEN_CATEGORIES.has(item.category)) continue
    if (!result[item.category]) result[item.category] = []
    result[item.category].push(item)
  }
  const sorted: Record<string, ConfigItem[]> = {}
  for (const cat of order) {
    if (result[cat]) sorted[cat] = result[cat]
  }
  for (const cat of Object.keys(result)) {
    if (!sorted[cat]) sorted[cat] = result[cat]
  }
  return sorted
})

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (typeof val === 'string') return val.length > 40 ? val.slice(0, 40) + '…' : val
  const str = JSON.stringify(val)
  return str.length > 48 ? str.slice(0, 48) + '…' : str
}

const editModal = ref({ show: false, key: '', desc: '', valueStr: '', saving: false })

function openEdit(item: ConfigItem) {
  editModal.value = {
    show: true,
    key: item.key,
    desc: item.description ?? '',
    valueStr: JSON.stringify(item.value, null, 2),
    saving: false,
  }
}

async function saveEdit() {
  let value: unknown
  try {
    value = JSON.parse(editModal.value.valueStr)
  } catch {
    message.error('JSON 格式错误，请检查')
    return
  }
  editModal.value.saving = true
  try {
    await apiPut(`/api/admin/config/${encodeURIComponent(editModal.value.key)}`, { value })
    message.success(t('config.modal.success'))
    editModal.value.show = false
    await fetchConfig()
  } catch (err: any) {
    message.error(err.message || t('config.modal.errorUpdate'))
  } finally {
    editModal.value.saving = false
  }
}

async function fetchConfig() {
  loading.value = true
  try {
    const res = await apiGet<{ items: ConfigItem[] }>('/api/admin/config')
    items.value = res.items
  } catch (err: any) {
    message.error(err.message || t('config.modal.errorLoad'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchConfig)
</script>
