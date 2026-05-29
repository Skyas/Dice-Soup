<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />骰子引擎</h1>
        <p class="page-sub">测试骰子表达式，查看 CoC / SW2.5 指令参考</p>
      </div>
    </div>

    <!-- Expression Tester -->
    <div class="ds-card">
      <div class="card-section-head">🎲 表达式测试器</div>
      <div class="tester-row">
        <input
          v-model="expr"
          class="expr-input"
          placeholder="输入骰子表达式，如 3d6+2 / 4d6kh3 / r30@10+4"
          @keydown.enter="rollExpr"
        />
        <button class="btn btn-accent" :disabled="rolling" @click="rollExpr">
          {{ rolling ? '投骰中…' : '投骰' }}
        </button>
      </div>

      <!-- Result -->
      <div v-if="rollResult" class="roll-result">
        <pre>{{ rollResult }}</pre>
      </div>
      <div v-if="rollError" class="roll-error">
        ❌ {{ rollError }}
      </div>

      <!-- Quick examples -->
      <div class="examples">
        <span class="examples-label">快速示例：</span>
        <button
          v-for="ex in EXAMPLES"
          :key="ex"
          class="example-chip"
          @click="setExpr(ex)"
        >{{ ex }}</button>
      </div>
    </div>

    <!-- Command Reference -->
    <div class="ds-card">
      <div class="card-section-head">📋 骰子指令速查</div>

      <!-- General Dice -->
      <div class="ref-section">
        <div class="ref-title">通用表达式（.r）</div>
        <table class="ref-table">
          <thead><tr><th>表达式</th><th>说明</th><th>示例</th></tr></thead>
          <tbody>
            <tr v-for="row in GENERAL_DICE" :key="row.expr">
              <td class="mono">{{ row.expr }}</td>
              <td>{{ row.desc }}</td>
              <td class="mono muted">{{ row.example }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- CoC -->
      <div class="ref-section">
        <div class="ref-title">CoC 7th 指令</div>
        <table class="ref-table">
          <thead><tr><th>指令</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="row in COC_CMDS" :key="row.cmd">
              <td class="mono">{{ row.cmd }}</td>
              <td>{{ row.desc }}</td>
            </tr>
          </tbody>
        </table>

        <!-- House rules -->
        <div class="sub-section">
          <div class="sub-title">CoC 房规（.setcoc 0-5）</div>
          <div class="house-rules">
            <div
              v-for="rule in COC_HOUSE_RULES"
              :key="rule.n"
              class="house-rule-item"
            >
              <span class="rule-badge">{{ rule.n }}</span>
              <span class="rule-desc">{{ rule.desc }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- SW2.5 -->
      <div class="ref-section">
        <div class="ref-title">SW2.5 指令</div>
        <table class="ref-table">
          <thead><tr><th>指令</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="row in SW25_CMDS" :key="row.cmd">
              <td class="mono">{{ row.cmd }}</td>
              <td>{{ row.desc }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiPost } from '@/api/client'

const expr = ref('')
const rolling = ref(false)
const rollResult = ref('')
const rollError = ref('')

const EXAMPLES = ['3d6+2', '4d6kh3', '2d20kh1', '1d100', 'r30@10+4', 'r50@10', '2d6']

const GENERAL_DICE = [
  { expr: 'NdX',       desc: '投 N 个 X 面骰，取总和',         example: '3d6' },
  { expr: 'NdXkhM',    desc: '投 N 骰取最高 M 个',             example: '4d6kh3' },
  { expr: 'NdXklM',    desc: '投 N 骰取最低 M 个',             example: '4d6kl1' },
  { expr: 'NdXdhM',    desc: '投 N 骰删除最高 M 个',           example: '4d6dh1' },
  { expr: 'NdXdlM',    desc: '投 N 骰删除最低 M 个',           example: '4d6dl1' },
  { expr: 'NdF',       desc: '命运骰（-1/0/+1）',             example: '4dF' },
  { expr: 'Nb/Np',     desc: 'CoC 奖励/惩罚骰（加在检定前）',  example: '1b+70' },
  { expr: 'A#expr',    desc: '重复投 A 次同一表达式',           example: '3#2d6' },
]

const COC_CMDS = [
  { cmd: '.ra <技能名><技能值>',  desc: '技能检定，投 1d100 并判定大/普/困难/极难/大失败' },
  { cmd: '.ra <技能值>',          desc: '同上，省略技能名' },
  { cmd: '.rh <表达式>',          desc: '暗骰，结果私聊发给投骰者，群内提示已暗骰' },
  { cmd: '.sc <成功>/<失败>',      desc: '理智检定，附加 san=N 指定当前 SAN 值' },
  { cmd: '.en <技能名><技能值>',  desc: '技能成长检定，投 1d100+1d10' },
  { cmd: '.coc [N]',              desc: '随机制卡，生成 N 套（最多 5）CoC 角色属性' },
  { cmd: '.setcoc <0-5>',         desc: '设置当前群的 CoC 大成功/大失败房规' },
]

const COC_HOUSE_RULES = [
  { n: 0, desc: '规则书默认：出1=大成功，skill<50时96-100=大失败，skill≥50时100=大失败' },
  { n: 1, desc: 'skill<50时出1=大成功（同 Rule 0），skill≥50时出1-5=大成功' },
  { n: 2, desc: '出1-5且成功=大成功；出96-100且失败=大失败（常用房规）' },
  { n: 3, desc: '出1-5=大成功（无视判定）；出96-100=大失败（无视判定）' },
  { n: 4, desc: '出1-5且≤skill/10=大成功；出96-100=大失败' },
  { n: 5, desc: '出1-2且≤skill/5=大成功；出96-100=大失败' },
]

const SW25_CMDS = [
  { cmd: '.r r<威力>[@<C值>][+<追加>]', desc: '威力骰，默认 C值=10，自动处理链式爆击（振り足し）' },
  { cmd: '.r r30@10+4',                 desc: '威力30，C值10，追加4点伤害' },
  { cmd: '.r r50',                      desc: '威力50，C值默认10' },
]

function setExpr(e: string) {
  expr.value = e
  rollResult.value = ''
  rollError.value = ''
}

async function rollExpr() {
  const e = expr.value.trim()
  if (!e) return
  rolling.value = true
  rollResult.value = ''
  rollError.value = ''
  try {
    const res = await apiPost<{ expr: string; total: number; formatted: string }>(
      '/api/admin/dice/roll',
      { expr: e },
    )
    rollResult.value = res.formatted
  } catch (err: unknown) {
    rollError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    rolling.value = false
  }
}
</script>

<style scoped>
.tester-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.expr-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  color: var(--fg-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
  transition: border-color 120ms;
}
.expr-input:focus { border-color: var(--accent); }

.btn-accent {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 8px 18px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: opacity 120ms;
}
.btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-accent:not(:disabled):hover { opacity: 0.85; }

.roll-result {
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 12px 14px;
  margin-bottom: 12px;
}
.roll-result pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.roll-error {
  padding: 10px 14px;
  background: var(--error-soft, rgba(220,53,69,0.08));
  border: 1px solid rgba(220,53,69,0.2);
  border-radius: var(--r-sm);
  color: var(--error, #dc3545);
  font-size: 13px;
  margin-bottom: 12px;
}

.examples {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.examples-label {
  font-size: 11.5px;
  color: var(--fg-muted);
}
.example-chip {
  padding: 3px 9px;
  border-radius: 99px;
  border: 1px solid var(--line);
  background: var(--bg-elevated);
  color: var(--fg-secondary);
  font-family: var(--font-mono);
  font-size: 11.5px;
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
}
.example-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.card-section-head {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-secondary);
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 14px;
}

.ref-section {
  padding: 0 18px 18px;
}
.ref-section + .ref-section {
  border-top: 1px solid var(--line);
  padding-top: 18px;
}

.ref-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.ref-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.ref-table th {
  text-align: left;
  padding: 6px 10px;
  color: var(--fg-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--line);
}
.ref-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--line-faint, rgba(128,128,128,0.08));
  color: var(--fg-primary);
  vertical-align: top;
}
.ref-table tr:last-child td { border-bottom: none; }

.mono { font-family: var(--font-mono); }
.muted { color: var(--fg-muted); }

.sub-section {
  margin-top: 16px;
}
.sub-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--fg-muted);
  margin-bottom: 8px;
}

.house-rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.house-rule-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 12.5px;
}
.rule-badge {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: var(--r-sm);
  font-weight: 600;
  font-size: 11px;
  font-family: var(--font-mono);
}
.rule-desc {
  color: var(--fg-secondary);
  line-height: 1.5;
  padding-top: 3px;
}
</style>
