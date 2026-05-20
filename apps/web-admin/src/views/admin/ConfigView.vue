<template>
  <div>
    <n-h2>配置中心</n-h2>
    <n-alert type="info" style="margin-bottom: 16px;">
      此处修改的配置立即生效（热更新），无需重启服务。敏感配置（API Key、Token）请在 .env 文件中修改。
    </n-alert>

    <n-spin :show="loading">
      <n-data-table
        :columns="columns"
        :data="items"
        :row-key="(row: ConfigItem) => row.key"
        size="small"
      />
    </n-spin>

    <!-- 编辑 Modal -->
    <n-modal v-model:show="editModal.show" preset="dialog" title="修改配置项">
      <n-form label-placement="top">
        <n-form-item label="Key">
          <n-input :value="editModal.key" disabled />
        </n-form-item>
        <n-form-item label="值（JSON 格式）">
          <n-input
            v-model:value="editModal.valueStr"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 10 }"
            placeholder="输入 JSON 格式的值"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="editModal.show = false">取消</n-button>
        <n-button type="primary" :loading="editModal.saving" @click="saveEdit">保存</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NH2, NAlert, NSpin, NDataTable, NModal, NForm, NFormItem, NInput, NButton, NTag,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { apiGet, apiPut } from '@/api/client'

interface ConfigItem {
  key: string
  value: unknown
  category: string
  description?: string
}

const message = useMessage()
const loading = ref(false)
const items = ref<ConfigItem[]>([])

const editModal = ref({
  show: false,
  key: '',
  valueStr: '',
  saving: false,
})

const CATEGORY_COLOR: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  security: 'error',
  llm: 'info',
  game: 'success',
  ui: 'default',
  platform: 'warning',
}

const columns: DataTableColumns<ConfigItem> = [
  {
    title: 'Key',
    key: 'key',
    width: 300,
    render: (row) => h('code', { style: 'font-size:12px' }, row.key),
  },
  {
    title: '分类',
    key: 'category',
    width: 90,
    render: (row) =>
      h(NTag, { type: CATEGORY_COLOR[row.category] ?? 'default', size: 'small' }, () => row.category),
  },
  {
    title: '当前值',
    key: 'value',
    render: (row) => {
      const str = JSON.stringify(row.value)
      return h('code', { style: 'font-size:12px; max-width: 300px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, str)
    },
  },
  {
    title: '说明',
    key: 'description',
    render: (row) => h('span', { style: 'color: #888; font-size: 12px;' }, row.description ?? '-'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 80,
    render: (row) =>
      h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑'),
  },
]

function openEdit(item: ConfigItem) {
  editModal.value = {
    show: true,
    key: item.key,
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
    message.success('配置已更新')
    editModal.value.show = false
    await fetchConfig()
  } catch (err: any) {
    message.error(err.message || '更新失败')
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
    message.error(err.message || '加载配置失败')
  } finally {
    loading.value = false
  }
}

onMounted(fetchConfig)
</script>
