<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Importance, Priority, StatusDefinition, Task, Workload } from '@/domain/task'
import { PRIORITY_ORDER } from '@/domain/priority'
import DateRangePicker from './DateRangePicker.vue'
import { useProjectStore } from '@/stores/projects'

const props = defineProps<{
  open: boolean
  task: Task | null
  statuses: StatusDefinition[]
}>()

const emit = defineEmits<{
  close: []
  save: [payload: Record<string, unknown>]
  remove: [id: string]
}>()

const titleInput = ref<HTMLInputElement | null>(null)
const errors = reactive({ title: '', range: '' })
const projectStore = useProjectStore()

const form = reactive({
  title: '',
  description: '',
  statusId: 'todo',
  importance: '中' as Importance,
  urgency: '中' as Importance,
  workload: '中' as Workload,
  range: { start: null as string | null, end: null as string | null },
  phase: '',
  process: '',
  order: 0,
  owner: '',
  participants: '',
  projectId: '' as string | '',
  priorityOverride: '' as Priority | '',
})

const PRESET_REMINDERS = [
  { minutes: 1440, label: '1 天前' },
  { minutes: 60, label: '1 小时前' },
  { minutes: 15, label: '15 分钟前' },
  { minutes: 0, label: '到点提醒' },
] as const
interface ReminderOption {
  minutes: number
  label: string
  checked: boolean
  removable: boolean
}
const reminderOptions = ref<ReminderOption[]>([])
const customMinutes = ref(5)
const customUnit = ref<'分钟' | '小时' | '天'>('分钟')

function unitToMinutes(n: number, unit: '分钟' | '小时' | '天'): number {
  if (unit === '分钟') return n
  if (unit === '小时') return n * 60
  return n * 1440
}

function minutesLabel(minutes: number): string {
  if (minutes === 0) return '到点提醒'
  const map: Record<number, string> = { 1440: '1 天前', 60: '1 小时前', 15: '15 分钟前' }
  if (map[minutes]) return map[minutes]
  if (minutes % 1440 === 0) return `${minutes / 1440} 天前`
  if (minutes % 60 === 0) return `${minutes / 60} 小时前`
  return `${minutes} 分钟前`
}

function rebuildReminderOptions(offsets?: number[]) {
  const defaults = offsets?.length ? offsets : [1440, 60, 15]
  const set = new Set(defaults)
  reminderOptions.value = PRESET_REMINDERS.map((p) => ({
    minutes: p.minutes,
    label: p.label,
    checked: set.has(p.minutes),
    removable: false,
  }))
  for (const extra of defaults) {
    if (PRESET_REMINDERS.some((p) => p.minutes === extra)) continue
    reminderOptions.value.push({ minutes: extra, label: minutesLabel(extra), checked: true, removable: true })
  }
}

function addCustomReminder() {
  const n = Number(customMinutes.value)
  if (!Number.isFinite(n) || n <= 0) return
  const minutes = unitToMinutes(Math.round(n), customUnit.value)
  reminderOptions.value.push({ minutes, label: minutesLabel(minutes), checked: true, removable: true })
}

function removeReminderOption(target: ReminderOption) {
  reminderOptions.value = reminderOptions.value.filter((o) => o !== target)
}

const isEdit = computed(() => Boolean(props.task))
const title = computed(() => (isEdit.value ? '任务详情' : '新建任务'))

const selectedProject = computed(() => projectStore.byId(form.projectId || undefined))
const showPhaseSelect = computed(() => selectedProject.value != null)
const phaseOptions = computed(() => {
  const phases = selectedProject.value?.phases ?? []
  const current = form.phase.trim()
  const list = phases.map((p) => ({ value: p, label: p }))
  if (current && !phases.includes(current)) {
    list.push({ value: current, label: `${current}（项目外）` })
  }
  return list
})

watch(
  () => [props.open, props.task] as const,
  ([open, task]) => {
    if (!open) return
    form.title = task?.title ?? ''
    form.description = task?.description ?? ''
    form.statusId = task?.statusId ?? 'todo'
    form.importance = task?.importance ?? '中'
    form.urgency = task?.urgency ?? '中'
    form.workload = task?.workload ?? '中'
    form.order = task?.order ?? 0
    form.range = { start: task?.dueStart ?? null, end: task?.dueEnd ?? null }
    const strip = (s: string | null | undefined) => {
      const v = (s ?? '').trim()
      return v === 'null' || v === 'undefined' ? '' : v
    }
    form.phase = strip(task?.phase)
    form.process = strip(task?.process)
    form.owner = strip(task?.owner)
    form.participants = (task?.participants ?? []).map(strip).filter(Boolean).join(', ')
    form.projectId = task?.projectId ?? ''
    rebuildReminderOptions(task?.reminderOffsets)
    form.priorityOverride = task?.priorityOverride?.value ?? ''
  },
  { immediate: true },
)

function save() {
  errors.title = ''
  errors.range = ''
  if (!form.title.trim()) {
    errors.title = '请输入任务名称'
    titleInput.value?.focus()
    return
  }
  if (form.range.start && form.range.end && form.range.end < form.range.start) {
    errors.range = '结束日期不能早于开始日期'
    return
  }
  const offsets = reminderOptions.value.filter((o) => o.checked).map((o) => o.minutes)

  emit('save', {
    title: form.title.trim(),
    description: form.description,
    statusId: form.statusId,
    importance: form.importance,
    urgency: form.urgency,
    workload: form.workload,
    dueStart: form.range.start,
    dueEnd: form.range.end,
    phase: form.phase || null,
    process: form.process || null,
    order: Number(form.order) || 0,
    owner: form.owner || null,
    participants: form.participants
      .split(/[,，/、]/)
      .map((x) => x.trim())
      .filter(Boolean),
    projectId: form.projectId || null,
    reminderOffsets: offsets.length ? offsets : [1440],
    priorityOverride: form.priorityOverride
      ? { value: form.priorityOverride, at: new Date().toISOString() }
      : null,
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-mask" @click.self="emit('close')">
      <aside class="drawer" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <h3>{{ title }}</h3>
          <button class="btn-ghost" aria-label="关闭" @click="emit('close')">✕</button>
        </header>

        <div class="drawer-body">
          <label class="block">
            <span>任务名称</span>
            <input ref="titleInput" v-model="form.title" class="field" :class="{ 'field-error': errors.title }" placeholder="例如：完成晋升名单梳理" />
            <p v-if="errors.title" class="field-error-text">{{ errors.title }}</p>
          </label>

          <label class="block">
            <span>说明</span>
            <textarea v-model="form.description" class="field" rows="3" placeholder="补充背景、验收标准…" />
          </label>

          <div class="grid-3">
            <label class="block">
              <span>状态</span>
              <select v-model="form.statusId" class="field">
                <option v-for="item in statuses" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </label>
            <label class="block">
              <span>重要程度</span>
              <select v-model="form.importance" class="field">
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </label>
            <label class="block">
              <span>紧急程度</span>
              <select v-model="form.urgency" class="field">
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </label>
          </div>

          <div class="grid-2 project-row">
            <label class="block">
              <span>所属项目</span>
              <select v-model="form.projectId" class="field">
                <option value=""><span class="muted">未分配项目</span></option>
                <option v-for="p in projectStore.active" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
          </div>

          <div class="grid-2">
            <label class="block">
              <span>工作量</span>
              <select v-model="form.workload" class="field">
                <option value="大">大</option>
                <option value="中">中</option>
                <option value="小">小</option>
              </select>
            </label>
            <label class="block">
              <span>手动优先级（默认自动）</span>
              <select v-model="form.priorityOverride" class="field">
                <option value="">自动计算</option>
                <option v-for="item in PRIORITY_ORDER" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>

          <div class="block">
            <span>截止日期</span>
            <DateRangePicker v-model="form.range" />
          </div>

          <div class="grid-2">
            <label class="block">
              <span>阶段</span>
              <select v-if="showPhaseSelect" v-model="form.phase" class="field">
                <option value="">（未填写）</option>
                <option v-for="p in phaseOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
              <input v-else v-model="form.phase" class="field" placeholder="例如：确定名单" />
            </label>
            <label class="block">
              <span>流程</span>
              <input v-model="form.process" class="field" placeholder="例如：通知提名" />
            </label>
          </div>

          <div class="grid-3">
            <label class="block">
              <span>WBS 序号</span>
              <input v-model.number="form.order" type="number" min="0" class="field" />
            </label>
            <label class="block">
              <span>主责人</span>
              <input v-model="form.owner" class="field" placeholder="姓名" />
            </label>
            <label class="block">
              <span>参与人（逗号分隔）</span>
              <input v-model="form.participants" class="field" placeholder="张三, 李四" />
            </label>
          </div>

          <div class="block">
            <span>提醒提前量</span>
            <div class="reminder-grid">
              <label v-for="opt in reminderOptions" :key="opt.minutes" class="reminder-check" :class="{ 'custom-chip': opt.removable }">
                <input type="checkbox" v-model="opt.checked" />
                <span>{{ opt.label }}</span>
                <button v-if="opt.removable" class="chip-del" type="button" aria-label="移除提醒" @click="removeReminderOption(opt)">✕</button>
              </label>
            </div>
            <div class="reminder-add">
              <input v-model.number="customMinutes" type="number" min="1" class="field slim-num" placeholder="5" aria-label="自定义分钟数" />
              <select v-model="customUnit" class="field slim-select" aria-label="自定义单位">
                <option value="分钟">分钟前</option>
                <option value="小时">小时前</option>
                <option value="天">天前</option>
              </select>
              <button type="button" class="btn-outline slim-add" @click="addCustomReminder">+ 添加</button>
            </div>
          </div>
        </div>

        <footer class="drawer-foot">
          <button v-if="isEdit" class="btn-ghost danger-text" @click="task && emit('remove', task.id)">
            删除
          </button>
          <div class="spacer" />
          <button class="btn-outline" @click="emit('close')">取消</button>
          <button class="btn-primary" @click="save">{{ isEdit ? '保存' : '创建任务' }}</button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 70;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(560px, 96vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.16);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.drawer-head h3 {
  margin: 0;
  font-size: 16px;
}
.drawer-body {
  padding: 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.drawer-foot {
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  align-items: center;
  background: var(--surface-2);
}
.spacer {
  flex: 1;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.danger-text {
  color: var(--danger);
}
.field-error {
  border-color: var(--danger) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 18%, transparent);
}
.field-error-text {
  margin: 0;
  color: var(--danger);
  font-size: 11.5px;
}
.reminder-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.reminder-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12.5px;
  cursor: pointer;
  user-select: none;
}
.reminder-check:has(input:checked) {
  background: var(--brand-bg);
  border-color: var(--brand);
  color: var(--brand);
}
.reminder-check input {
  accent-color: var(--brand);
  width: 13px;
  height: 13px;
  cursor: pointer;
}
.reminder-check .chip-del {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
}
.reminder-add {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}
.slim-num {
  width: 70px;
  padding: 7px 9px;
  font-size: 12.5px;
}
.slim-select {
  width: 96px;
  padding: 7px 9px;
  font-size: 12.5px;
}
.slim-add {
  padding: 7px 12px;
  font-size: 12.5px;
}
@media (max-width: 640px) {
  .grid-2,
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
</style>
