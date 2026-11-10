<script setup lang="ts">
import { computed, reactive, ref, nextTick } from 'vue'
import { useOkrStore, type WbsFormRow } from '@/stores/okr'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/tasks'
import { useToast } from '@/composables/toast'
import Modal from '@/components/Modal.vue'
import TaskDraftCard from '@/components/TaskDraftCard.vue'
import IconOkr from '@/components/icons/IconOkr.vue'
import type { TaskDraft } from '@/services/ai'
import type { KeyResult } from '@/domain/okr'
import { computeKrProgress, quarterRange } from '@/domain/okr'

const okrStore = useOkrStore()
const settingsStore = useSettingsStore()
const taskStore = useTaskStore()
const toast = useToast()

const objectiveModal = ref(false)
const objectiveForm = reactive({ title: '', description: '', owner: '', confidence: 0.7 })

const krModal = ref(false)
const krTargetObjective = ref('')
const krForm = reactive({
  title: '',
  metric: '',
  baseline: 0,
  target: 100,
  current: 0,
  unit: '',
  dueDate: '',
  manualProgress: 0,
})

const wbsOpen = ref(false)
const wbsTarget = ref<{ objectiveId: string; keyResultId?: string; label: string } | null>(null)
const wbsRows = ref<WbsFormRow[]>([])

const decomposeOpen = ref(false)
const decomposeTarget = ref<{ objectiveId: string; keyResultId?: string } | null>(null)
const decomposeDrafts = ref<TaskDraft[]>([])
const decomposing = ref(false)

const statuses = computed(() => settingsStore.statuses)
const focusedObjective = ref<string | null>(null)

function focusObjective(id: string) {
  focusedObjective.value = id
  nextTick(() => {
    document.getElementById(`okr-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function emptyRow(): WbsFormRow {
  return {
    title: '',
    description: '',
    phase: '',
    process: '',
    dueStart: '',
    dueEnd: '',
    owner: '',
    participants: '',
    statusId: statuses.value[0]?.id ?? 'todo',
    importance: '中',
    urgency: '中',
    workload: '中',
  }
}

function openObjectiveModal() {
  objectiveForm.title = ''
  objectiveForm.description = ''
  objectiveForm.owner = ''
  objectiveForm.confidence = 0.7
  objectiveModal.value = true
}

async function createObjective() {
  try {
    await okrStore.createObjective({ ...objectiveForm })
    objectiveModal.value = false
    toast.push('Objective 已创建', 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

function openKrModal(objectiveId: string) {
  krTargetObjective.value = objectiveId
  Object.assign(krForm, {
    title: '',
    metric: '',
    baseline: 0,
    target: 100,
    current: 0,
    unit: '',
    dueDate: '',
    manualProgress: 0,
  })
  krModal.value = true
}

async function createKr() {
  try {
    await okrStore.createKeyResult(krTargetObjective.value, { ...krForm, dueDate: krForm.dueDate || null })
    krModal.value = false
    toast.push('Key Result 已创建', 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

async function removeObjective(id: string) {
  if (!confirm('删除这个 Objective 及其下所有 KR？关联任务不会被删除。')) return
  await okrStore.removeObjective(id)
  toast.push('已删除', 'info')
}

async function removeKr(id: string) {
  if (!confirm('删除这个 KR？')) return
  await okrStore.removeKeyResult(id)
  toast.push('已删除', 'info')
}

function openWbs(objectiveId: string, keyResultId?: string) {
  const objective = okrStore.objectives.find((o) => o.id === objectiveId)
  const kr = okrStore.keyResults.find((k) => k.id === keyResultId)
  wbsTarget.value = {
    objectiveId,
    keyResultId,
    label: kr ? `${objective?.title ?? ''} / ${kr.title}` : (objective?.title ?? ''),
  }
  wbsRows.value = [emptyRow()]
  wbsOpen.value = true
}

function addWbsRow() {
  wbsRows.value.push(emptyRow())
}

function removeWbsRow(index: number) {
  wbsRows.value.splice(index, 1)
  if (!wbsRows.value.length) wbsRows.value.push(emptyRow())
}

async function submitWbs() {
  if (!wbsTarget.value) return
  const valid = wbsRows.value.filter((row) => row.title.trim())
  if (!valid.length) {
    toast.push('请至少填写一条任务项', 'error')
    return
  }
  try {
    const count = await okrStore.createFromWbs(
      wbsTarget.value.objectiveId,
      valid,
      wbsTarget.value.keyResultId,
    )
    wbsOpen.value = false
    toast.push(`已创建 ${count} 条任务并关联 OKR`, 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '提交失败', 'error')
  }
}

async function runDecompose(objectiveId: string, keyResultId?: string) {
  decomposing.value = true
  decomposeTarget.value = { objectiveId, keyResultId }
  decomposeOpen.value = true
  decomposeDrafts.value = []
  try {
    const drafts = await okrStore.decompose(objectiveId)
    decomposeDrafts.value = keyResultId
      ? drafts.filter((d) => d.okrLinks.some((l) => l.keyResultId === keyResultId)).length
        ? drafts.filter((d) => d.okrLinks.some((l) => l.keyResultId === keyResultId))
        : drafts
      : drafts
  } catch (error) {
    toast.push(error instanceof Error ? error.message : 'AI 拆解失败', 'error')
    decomposeOpen.value = false
  } finally {
    decomposing.value = false
  }
}

async function commitDecompose() {
  try {
    const count = await okrStore.commitDrafts(decomposeDrafts.value, 'okr-ai')
    toast.push(`已创建 ${count} 条任务`, 'success')
    decomposeOpen.value = false
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

function krProgress(kr: KeyResult): number {
  return computeKrProgress(kr, taskStore.tasks, statuses.value)
}

const selectedDrafts = computed(
  () => decomposeDrafts.value.filter((draft) => draft.selected).length,
)

const quarterLabel = computed(() => {
  const range = quarterRange(okrStore.quarter)
  return `${range.start} ~ ${range.end}`
})
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading">季度</div>
          <button
            v-for="q in okrStore.availableQuarters"
            :key="q"
            class="subcol-item"
            :class="{ active: okrStore.quarter === q }"
            @click="okrStore.quarter = q"
          >
            {{ q }}
          </button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">本季目标 · {{ okrStore.quarter }}</div>
          <p v-if="!okrStore.quarterObjectives.length" class="muted empty-block">还没有 O</p>
          <button
            v-for="objective in okrStore.quarterObjectives"
            :key="objective.id"
            class="subcol-item objective-item"
            :class="{ active: focusedObjective === objective.id }"
            @click="focusObjective(objective.id)"
          >
            <span class="objective-name">{{ objective.title }}</span>
            <span class="count">{{ okrStore.progressOf(objective.id) }}%</span>
          </button>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>OKR 管理</h1>
        <p class="muted">录入季度 OKR，让 AI 拆成可执行任务；也可以按 WBS 表单手工填写。</p>
      </div>
      <div class="head-actions">
        <select v-model="okrStore.quarter" class="field quarter">
          <option v-for="q in okrStore.availableQuarters" :key="q" :value="q">{{ q }}</option>
        </select>
        <button class="btn-primary" @click="openObjectiveModal">+ 新建 O</button>
      </div>
    </header>

    <div class="quarter-meta muted">{{ quarterLabel }}</div>

    <div v-if="!okrStore.quarterObjectives.length" class="empty card">
      <div class="empty-icon"><IconOkr :size="22" /></div>
      <h3>{{ okrStore.quarter }} 还没有 OKR</h3>
      <p class="muted">先建一个 Objective，再用 AI 拆解成任务；也可以直接手工填写 WBS。</p>
      <button class="btn-primary" @click="openObjectiveModal">新建 Objective</button>
    </div>

    <section v-for="objective in okrStore.quarterObjectives" :key="objective.id" :id="`okr-${objective.id}`" class="okr-card card" :class="{ focused: focusedObjective === objective.id }">
      <header class="okr-head">
        <div class="okr-title">
          <div class="o-tag">O</div>
          <div>
            <h3>{{ objective.title }}</h3>
            <p class="muted">
              {{ objective.owner || '未指定负责人' }} · 置信度 {{ Math.round(objective.confidence * 100) }}%
              · {{ okrStore.statsOf(objective.id).done }}/{{ okrStore.statsOf(objective.id).total }} 任务完成
            </p>
          </div>
        </div>
        <div class="okr-progress">
          <div
            class="ring"
            :style="{ background: `conic-gradient(var(--brand) ${okrStore.progressOf(objective.id)}%, var(--border) 0)` }"
          >
            <span>{{ okrStore.progressOf(objective.id) }}%</span>
          </div>
        </div>
        <div class="okr-actions">
          <button class="btn-outline" @click="runDecompose(objective.id)">AI 拆解</button>
          <button class="btn-outline" @click="openWbs(objective.id)">手工填写</button>
          <button class="btn-ghost" @click="openKrModal(objective.id)">+ KR</button>
          <button class="btn-ghost danger-text" @click="removeObjective(objective.id)">删除</button>
        </div>
      </header>

      <div class="kr-list">
        <div v-for="kr in okrStore.krsOf(objective.id)" :key="kr.id" class="kr-row">
          <div class="kr-main">
            <div class="kr-title-line">
              <span class="kr-tag">KR</span>
              <strong>{{ kr.title }}</strong>
              <span class="muted">{{ kr.metric }}</span>
            </div>
            <div class="progress-bar">
              <div class="bar" :style="{ width: `${krProgress(kr)}%` }" />
            </div>
            <div class="kr-meta muted">
              进度 {{ krProgress(kr) }}% · 目标 {{ kr.target }}{{ kr.unit }} · 当前 {{ kr.current }}{{ kr.unit }}
              <span v-if="kr.dueDate"> · 截止 {{ kr.dueDate }}</span>
            </div>
          </div>
          <div class="kr-actions">
            <button class="btn-ghost" @click="runDecompose(objective.id, kr.id)">AI 拆解</button>
            <button class="btn-ghost" @click="openWbs(objective.id, kr.id)">手工填写</button>
            <button class="btn-ghost danger-text" @click="removeKr(kr.id)">删除</button>
          </div>
        </div>
        <p v-if="!okrStore.krsOf(objective.id).length" class="muted no-kr">
          还没有 KR。点击右上角「+ KR」补充，AI 拆解会围绕 O 直接生成任务。
        </p>
      </div>
    </section>

    <Modal :open="objectiveModal" title="新建 Objective" subtitle="本季度要达成的方向性目标" @close="objectiveModal = false">
      <div class="form-stack">
        <label class="block">
          <span>O 标题</span>
          <input v-model="objectiveForm.title" class="field" placeholder="例如：提升组织人才密度" />
        </label>
        <label class="block">
          <span>说明</span>
          <textarea v-model="objectiveForm.description" class="field" rows="3" placeholder="为什么要做、成功是什么样" />
        </label>
        <div class="grid-2">
          <label class="block">
            <span>负责人</span>
            <input v-model="objectiveForm.owner" class="field" placeholder="姓名" />
          </label>
          <label class="block">
            <span>置信度（0~1）</span>
            <input v-model.number="objectiveForm.confidence" type="number" min="0" max="1" step="0.1" class="field" />
          </label>
        </div>
      </div>
      <template #footer>
        <button class="btn-outline" @click="objectiveModal = false">取消</button>
        <button class="btn-primary" @click="createObjective">创建</button>
      </template>
    </Modal>

    <Modal :open="krModal" title="新建 Key Result" subtitle="可量化的关键结果" @close="krModal = false">
      <div class="form-stack">
        <label class="block">
          <span>KR 标题</span>
          <input v-model="krForm.title" class="field" placeholder="例如：Q4 完成 10 名关键岗位入职" />
        </label>
        <div class="grid-2">
          <label class="block">
            <span>指标</span>
            <input v-model="krForm.metric" class="field" placeholder="例如：入职人数" />
          </label>
          <label class="block">
            <span>单位</span>
            <input v-model="krForm.unit" class="field" placeholder="人 / % / 个" />
          </label>
        </div>
        <div class="grid-3">
          <label class="block">
            <span>基线</span>
            <input v-model.number="krForm.baseline" type="number" class="field" />
          </label>
          <label class="block">
            <span>目标</span>
            <input v-model.number="krForm.target" type="number" class="field" />
          </label>
          <label class="block">
            <span>当前</span>
            <input v-model.number="krForm.current" type="number" class="field" />
          </label>
        </div>
        <div class="grid-2">
          <label class="block">
            <span>截止日期</span>
            <input v-model="krForm.dueDate" type="date" class="field" />
          </label>
          <label class="block">
            <span>手动进度（0~100）</span>
            <input v-model.number="krForm.manualProgress" type="number" min="0" max="100" class="field" />
          </label>
        </div>
      </div>
      <template #footer>
        <button class="btn-outline" @click="krModal = false">取消</button>
        <button class="btn-primary" @click="createKr">创建</button>
      </template>
    </Modal>

    <Modal
      :open="wbsOpen"
      title="手工填写 WBS"
      :subtitle="wbsTarget?.label"
      width="980px"
      @close="wbsOpen = false"
    >
      <div class="wbs-form">
        <div v-for="(row, index) in wbsRows" :key="index" class="wbs-row">
          <div class="row-head">
            <strong>任务 {{ index + 1 }}</strong>
            <button class="btn-ghost danger-text" @click="removeWbsRow(index)">删除本行</button>
          </div>
          <div class="grid-3">
            <label class="block">
              <span>阶段</span>
              <input v-model="row.phase" class="field" placeholder="例如：确定名单" />
            </label>
            <label class="block">
              <span>流程</span>
              <input v-model="row.process" class="field" placeholder="例如：通知提名" />
            </label>
            <label class="block">
              <span>任务项</span>
              <input v-model="row.title" class="field" placeholder="必填" />
            </label>
          </div>
          <label class="block">
            <span>说明</span>
            <input v-model="row.description" class="field" placeholder="验收标准 / 背景" />
          </label>
          <div class="grid-4">
            <label class="block">
              <span>启动时间</span>
              <input v-model="row.dueStart" type="date" class="field" />
            </label>
            <label class="block">
              <span>完成时间</span>
              <input v-model="row.dueEnd" type="date" class="field" />
            </label>
            <label class="block">
              <span>主责人</span>
              <input v-model="row.owner" class="field" />
            </label>
            <label class="block">
              <span>参与人</span>
              <input v-model="row.participants" class="field" placeholder="逗号分隔" />
            </label>
          </div>
          <div class="grid-4">
            <label class="block">
              <span>完成情况</span>
              <select v-model="row.statusId" class="field">
                <option v-for="status in statuses" :key="status.id" :value="status.id">{{ status.name }}</option>
              </select>
            </label>
            <label class="block">
              <span>重要</span>
              <select v-model="row.importance" class="field">
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </label>
            <label class="block">
              <span>紧急</span>
              <select v-model="row.urgency" class="field">
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </label>
            <label class="block">
              <span>工作量</span>
              <select v-model="row.workload" class="field">
                <option value="大">大</option>
                <option value="中">中</option>
                <option value="小">小</option>
              </select>
            </label>
          </div>
        </div>
        <button class="btn-outline add-row" @click="addWbsRow">+ 添加一行</button>
      </div>
      <template #footer>
        <button class="btn-outline" @click="wbsOpen = false">取消</button>
        <button class="btn-primary" @click="submitWbs">提交并匹配到任务表</button>
      </template>
    </Modal>

    <Modal
      :open="decomposeOpen"
      title="AI 拆解预览"
      subtitle="勾选要创建的任务，可逐条修改后加入任务表"
      width="900px"
      @close="decomposeOpen = false"
    >
      <div v-if="decomposing" class="decomposing">
        <div class="spinner" />
        <p class="muted">正在拆解 OKR…</p>
      </div>
      <div v-else class="decompose-list">
        <TaskDraftCard
          v-for="draft in decomposeDrafts"
          :key="draft.id"
          :draft="draft"
          @update="(patch) => Object.assign(draft, patch)"
          @remove="decomposeDrafts = decomposeDrafts.filter((d) => d.id !== draft.id)"
        />
        <p v-if="!decomposeDrafts.length" class="muted">AI 没有返回可用任务，请调整 OKR 描述后重试。</p>
      </div>
      <template #footer>
        <button class="btn-outline" @click="decomposeOpen = false">取消</button>
        <button class="btn-primary" :disabled="decomposing || selectedDrafts === 0" @click="commitDecompose">
          创建 {{ selectedDrafts }} 条任务
        </button>
      </template>
    </Modal>
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.page-head h1 {
  margin: 0 0 3px;
  font-size: 22px;
}
.page-head p {
  margin: 0;
  font-size: 12.5px;
}
.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.quarter {
  width: auto;
}
.empty-block {
  font-size: 12px;
  padding: 6px 8px;
  margin: 0;
}
.objective-item {
  text-align: left;
}
.objective-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.okr-card.focused {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand-bg);
}
.quarter-meta {
  font-size: 12px;
  margin-bottom: 14px;
}
.okr-card {
  padding: 16px 18px;
  margin-bottom: 14px;
}
.okr-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.okr-title {
  display: flex;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.o-tag,
.kr-tag {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--brand) 13%, transparent);
  color: var(--brand);
  font-weight: 800;
  font-size: 12px;
}
.kr-tag {
  width: 24px;
  height: 24px;
  flex-basis: 24px;
  background: var(--surface-2);
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-weight: 600;
}
.okr-title h3 {
  margin: 0;
  font-size: 15px;
}
.okr-title p {
  margin: 3px 0 0;
  font-size: 11.5px;
}
.okr-progress {
  flex: 0 0 auto;
}
.ring {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  position: relative;
}
.ring::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--surface);
}
.ring span {
  position: relative;
  font-size: 12px;
  font-weight: 700;
}
.okr-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.kr-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kr-row {
  display: flex;
  gap: 10px;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 9px;
}
.kr-main {
  flex: 1;
  min-width: 0;
}
.kr-title-line {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  margin-bottom: 5px;
}
.kr-title-line .muted {
  font-size: 11px;
}
.progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}
.bar {
  height: 100%;
  background: var(--brand);
  border-radius: 999px;
  transition: width 0.25s ease;
}
.kr-meta {
  font-size: 10.5px;
  margin-top: 3px;
}
.kr-actions {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.no-kr {
  font-size: 12px;
  padding: 8px 0;
}
.decomposing {
  padding: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--border);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.decompose-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.wbs-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wbs-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--surface-2);
}
.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
}
.add-row {
  align-self: flex-start;
}
.empty {
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--brand-bg);
  color: var(--brand);
}
.empty h3 {
  margin: 0;
}
.danger-text {
  color: var(--danger);
}
@media (max-width: 860px) {
  .okr-head {
    flex-wrap: wrap;
  }
  .okr-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .grid-2,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
