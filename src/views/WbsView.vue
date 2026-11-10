<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useSettingsStore } from '@/stores/settings'
import { useProjectStore } from '@/stores/projects'
import { useToast } from '@/composables/toast'
import { buildWbs, type WbsGroup, type WbsProcess } from '@/domain/wbs'
import { groupTasksByWeek, type WeekGroup } from '@/domain/date'
import { PRIORITY_META } from '@/domain/priority'
import { parseLocalDate, todayISO } from '@/domain/date'
import type { Task } from '@/domain/task'
import { statusOf } from '@/domain/task'
import { downloadText, exportPng, wbsToCsv } from '@/services/export'

const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const projectStore = useProjectStore()
const toast = useToast()

const view = ref<'table' | 'gantt'>('table')
const includeCancelled = ref(false)
const activePhase = ref<string | null>(null)
const dayWidth = ref(26)
const ganttRef = ref<HTMLElement | null>(null)
const collapsed = ref<Set<string>>(new Set())

const statuses = computed(() => settingsStore.statuses)

interface PhaseVm {
  group: WbsGroup
  /** 阶段内的周期切分：周（升序）→ 流程 → 任务 */
  weeks: Array<{ week: WeekGroup; procs: Array<{ proc: WbsProcess; tasks: Task[] }> }>
  rowspan: number
}
interface ProjectBlockVm {
  key: string               // project id 或 '__unassigned__'
  id: string | null
  name: string
  color: string
  archived: boolean
  phases: PhaseVm[]
  allTasks: Task[]
  total: number
  done: number
}

function phaseVmsOf(tasks: Task[]): PhaseVm[] {
  const scoped = activePhase.value ? tasks.filter((t) => t.phase === activePhase.value) : tasks
  const groups = buildWbs(scoped, statuses.value, { includeCancelled: includeCancelled.value })
  return groups.map((group) => {
    const groupTasks = group.processes.flatMap((proc) => proc.tasks)
    const weeks = groupTasksByWeek(groupTasks, {
      repeatSpanning: settingsStore.settings.repeatSpanning,
      weekStartsOn: settingsStore.settings.weekStartsOn,
    })
      .slice()
      .reverse()
      .map((week) => {
        const procs = group.processes
          .map((proc) => ({ proc, tasks: proc.tasks.filter((t) => week.tasks.some((w) => w.id === t.id)) }))
          .filter((entry) => entry.tasks.length)
        return { week, procs }
      })
    return { group, weeks, rowspan: groupTasks.length }
  })
}

const blocks = computed<ProjectBlockVm[]>(() => {
  const byProject = new Map<string | null, Task[]>()
  for (const task of taskStore.filtered) {
    const key = task.projectId ?? null
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key)!.push(task)
  }
  const result: ProjectBlockVm[] = []
  const pushBlock = (
    key: string,
    id: string | null,
    name: string,
    color: string,
    archived: boolean,
    tasks: Task[],
  ) => {
    const phases = phaseVmsOf(tasks)
    if (!phases.length) return
    const allTasks = phases.flatMap((p) => p.group.processes.flatMap((proc) => proc.tasks))
    const done = phases.reduce(
      (sum, p) => sum + p.group.stats.done,
      0,
    )
    result.push({ key, id, name, color, archived, phases, allTasks, total: allTasks.length, done })
  }
  for (const project of [...projectStore.active, ...projectStore.archived]) {
    if (taskStore.filters.projectId && project.id !== taskStore.filters.projectId) continue
    const tasks = byProject.get(project.id) ?? []
    if (!tasks.length) continue
    pushBlock(project.id, project.id, project.name, project.color, project.status === 'archived', tasks)
  }
  if (!taskStore.filters.projectId) {
    const unassigned = byProject.get(null) ?? []
    if (unassigned.length) pushBlock('__unassigned__', null, '未分配项目', '#9aa0a6', false, unassigned)
  }
  return result
})

const phaseOptions = computed(() =>
  // 阶段切换器始终基于完整 filtered 集合，避免选中后只剩一个选项
  buildWbs(taskStore.filtered, statuses.value, { includeCancelled: includeCancelled.value }).map(
    (group) => ({
      name: group.phase,
      count: group.processes.reduce((sum, proc) => sum + proc.tasks.length, 0),
    }),
  ),
)

const allTasks = computed(() => blocks.value.flatMap((block) => block.allTasks))

const stats = computed(() => {
  const total = allTasks.value.length
  const done = allTasks.value.filter(
    (task) => statusOf(task.statusId, statuses.value).category === 'done',
  ).length
  const overdue = blocks.value.reduce((sum, block) =>
    sum + block.phases.reduce((s, p) => s + p.group.stats.overdue, 0), 0)
  return { total, done, overdue, rate: total ? Math.round((done / total) * 100) : 0 }
})

function toggleBlock(key: string) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

const dateBounds = computed(() => {
  const dates = allTasks.value
    .flatMap((task) => [task.dueStart, task.dueEnd])
    .filter(Boolean) as string[]
  if (!dates.length) {
    const today = todayISO()
    return { start: today, end: today, days: 14 }
  }
  const sorted = [...dates].sort()
  const start = sorted[0]
  const end = sorted[sorted.length - 1]
  return { start, end, days: Math.max(14, diffDays(start, end) + 1) }
})

function diffDays(a: string, b: string): number {
  const start = parseLocalDate(a).getTime()
  const end = parseLocalDate(b).getTime()
  return Math.round((end - start) / 86_400_000)
}

const timelineDays = computed(() => {
  const start = parseLocalDate(dateBounds.value.start)
  const list: Array<{ iso: string; day: number; month: number; isToday: boolean }> = []
  for (let i = 0; i < dateBounds.value.days; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    list.push({ iso, day: date.getDate(), month: date.getMonth() + 1, isToday: iso === todayISO() })
  }
  return list
})

const todayOffset = computed(() => {
  const index = timelineDays.value.findIndex((day) => day.isToday)
  return index < 0 ? -1 : index * dayWidth.value + dayWidth.value / 2
})

function barStyle(task: Task) {
  const start = task.dueStart ?? task.dueEnd ?? dateBounds.value.start
  const end = task.dueEnd ?? task.dueStart ?? start
  const offset = Math.max(0, diffDays(dateBounds.value.start, start))
  const duration = Math.max(1, diffDays(start, end) + 1)
  return {
    left: `${offset * dayWidth.value}px`,
    width: `${duration * dayWidth.value}px`,
    background: PRIORITY_META[task.priority].color,
  }
}

const rowNumbers = computed(() => {
  const map = new Map<string, number>()
  let n = 1
  for (const block of blocks.value) {
    if (collapsed.value.has(block.key)) continue
    for (const phase of block.phases) {
      for (const { procs } of phase.weeks) {
        for (const { tasks } of procs) {
          for (const task of tasks) map.set(task.id, n++)
        }
      }
    }
  }
  return map
})

function exportCsv() {
  // 合并所有块的阶段为一个扁平的阶段数组，保持与屏幕顺序一致
  const merged = blocks.value.flatMap((block) => block.phases.map((phase) => phase.group))
  downloadText(`timebound-wbs-${todayISO()}.csv`, wbsToCsv(merged, statuses.value))
  toast.push('WBS 已导出为 CSV', 'success')
}

async function exportImage() {
  if (!ganttRef.value) return
  try {
    await exportPng(ganttRef.value, `timebound-wbs-${todayISO()}.png`)
    toast.push('已导出 PNG', 'success')
  } catch {
    toast.push('导出图片失败，请改用 CSV', 'error')
  }
}

function print() {
  window.print()
}

function taskStatusName(task: Task): string {
  return statusOf(task.statusId, statuses.value).name
}

function applyProject(projectId: string) {
  projectStore.selectedId = projectId
  taskStore.filters.projectId = projectId
}
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading">项目</div>
          <button class="subcol-item" :class="{ active: !taskStore.filters.projectId }" @click="applyProject('')">
            全部
          </button>
          <button
            v-for="p in projectStore.active"
            :key="p.id"
            class="subcol-item"
            :class="{ active: taskStore.filters.projectId === p.id }"
            @click="applyProject(p.id)"
          >
            <span class="subcol-project">
              <span class="dot" :style="{ background: p.color }" />{{ p.name }}
            </span>
          </button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">阶段</div>
          <button class="subcol-item" :class="{ active: activePhase === null }" @click="activePhase = null">
            全部<span class="count">{{ stats.total }}</span>
          </button>
          <button
            v-for="phase in phaseOptions"
            :key="phase.name"
            class="subcol-item"
            :class="{ active: activePhase === phase.name }"
            @click="activePhase = phase.name"
          >
            {{ phase.name }}<span class="count">{{ phase.count }}</span>
          </button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">视图</div>
          <button class="subcol-item" :class="{ active: view === 'table' }" @click="view = 'table'">WBS 表格</button>
          <button class="subcol-item" :class="{ active: view === 'gantt' }" @click="view = 'gantt'">甘特图</button>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>WBS 时间轴</h1>
        <p class="muted">阶段 → 流程 → 任务，自动生成工作计划表与甘特时间条。</p>
      </div>
      <div class="head-actions">
        <button class="btn-outline" @click="exportCsv">导出 CSV</button>
        <button class="btn-outline" @click="exportImage">导出 PNG</button>
        <button class="btn-ghost" @click="print">打印</button>
      </div>
    </header>

    <div class="stats">
      <span class="stat"><strong>{{ stats.total }}</strong> 任务</span>
      <span class="stat"><strong>{{ stats.done }}</strong> 已完成</span>
      <span class="stat"><strong>{{ stats.rate }}%</strong> 完成率</span>
      <span class="stat danger"><strong>{{ stats.overdue }}</strong> 逾期</span>
    </div>

    <div class="toolbar">
      <label class="muted check">
        <input v-model="includeCancelled" type="checkbox" />
        显示已取消
      </label>
      <div v-if="view === 'gantt'" class="zoom">
        <span class="muted">缩放</span>
        <button class="btn-ghost" @click="dayWidth = Math.max(14, dayWidth - 6)">−</button>
        <button class="btn-ghost" @click="dayWidth = Math.min(60, dayWidth + 6)">＋</button>
      </div>
    </div>

    <div v-if="!blocks.length" class="empty card">
      <h3>还没有可展示的任务</h3>
      <p class="muted">任务需要填写阶段/流程（可选）并设置起止日期，才会出现在 WBS 时间轴。</p>
      <RouterLink to="/tasks" class="btn-primary">去任务表创建</RouterLink>
    </div>

    <div v-else ref="ganttRef" class="wbs-export-root">
      <section v-for="block in blocks" :key="block.key" class="wbs-block">
        <button class="block-head" @click="toggleBlock(block.key)">
          <span class="block-dot" :style="{ background: block.color }" />
          <span class="block-name">{{ block.name }}</span>
          <span v-if="block.archived" class="block-badge">已归档</span>
          <span class="block-meta">{{ block.total }} 任务 · {{ block.done }} 完成</span>
          <span class="block-chevron" :class="{ open: !collapsed.has(block.key) }">▾</span>
        </button>

        <div v-if="!collapsed.has(block.key)" class="block-body">
      <div v-if="view === 'table'" class="table-wrap card">
        <table class="wbs-table">
          <thead>
            <tr>
              <th>流程</th>
              <th>NO</th>
              <th>任务项</th>
              <th>说明</th>
              <th>启动时间</th>
              <th>完成时间</th>
              <th>主责人</th>
              <th>参与人</th>
              <th>完成情况</th>
            </tr>
          </thead>
          <tbody v-for="phase in block.phases" :key="phase.group.phase">
            <tr class="phase-band">
              <td colspan="9"><strong>阶段 · {{ phase.group.phase }}</strong><span class="band-meta"> · {{ phase.rowspan }} 条</span></td>
            </tr>
            <template v-for="{ week, procs } in phase.weeks" :key="week.key">
              <tr class="week-band">
                <td colspan="9">周期 · {{ week.label }}<span class="band-meta"> · {{ week.tasks.length }} 条</span></td>
              </tr>
              <template v-for="{ proc, tasks } in procs" :key="`${phase.group.phase}-${week.key}-${proc.name}`">
                <tr v-for="(task, ti) in tasks" :key="task.id">
                  <td v-if="ti === 0" :rowspan="tasks.length" class="process-cell">
                    {{ proc.name }}
                  </td>
                  <td class="no">{{ rowNumbers.get(task.id) }}</td>
                  <td>
                    <RouterLink to="/tasks" class="task-link">{{ task.title }}</RouterLink>
                  </td>
                  <td class="desc">{{ task.description || '—' }}</td>
                  <td>{{ task.dueStart || '—' }}</td>
                  <td>{{ task.dueEnd || '—' }}</td>
                  <td>{{ task.owner || '—' }}</td>
                  <td>{{ task.participants.join(' / ') || '—' }}</td>
                  <td>
                    <span class="status-pill" :style="{ color: statusOf(task.statusId, statuses).color }">
                      {{ taskStatusName(task) }}
                    </span>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <div v-else class="gantt card">
        <div class="gantt-scroll">
          <div class="gantt-grid" :style="{ width: `${280 + timelineDays.length * dayWidth}px` }">
            <div class="gantt-header">
              <div class="label-head">项目 / 阶段 / 流程 / 任务</div>
              <div class="timeline-head" :style="{ width: `${timelineDays.length * dayWidth}px` }">
                <div
                  v-for="day in timelineDays"
                  :key="day.iso"
                  class="day-head"
                  :class="{ today: day.isToday }"
                  :style="{ width: `${dayWidth}px` }"
                >
                  <span v-if="day.day === 1 || day.iso === timelineDays[0].iso" class="month">
                    {{ day.month }}月
                  </span>
                  <span class="day-num">{{ day.day }}</span>
                </div>
              </div>
            </div>

            <div v-for="phase in block.phases" :key="phase.group.phase" class="gantt-group">
              <div class="gantt-phase">
                <div class="phase-label">▾ {{ phase.group.phase }}</div>
                <div class="phase-track" :style="{ width: `${timelineDays.length * dayWidth}px` }">
                  <div
                    v-if="phase.group.start && phase.group.end"
                    class="phase-bar"
                    :style="{
                      left: `${Math.max(0, diffDays(dateBounds.start, phase.group.start)) * dayWidth}px`,
                      width: `${Math.max(1, diffDays(phase.group.start, phase.group.end) + 1) * dayWidth}px`,
                    }"
                  />
                </div>
              </div>

              <div v-for="proc in phase.group.processes" :key="proc.name" class="gantt-process">
                <div class="process-row">
                  <div class="process-label">{{ proc.name }}</div>
                  <div class="track" :style="{ width: `${timelineDays.length * dayWidth}px` }">
                    <div v-if="todayOffset >= 0" class="today-line" :style="{ left: `${todayOffset}px` }" />
                  </div>
                </div>
                <div v-for="task in proc.tasks" :key="task.id" class="task-g-row">
                  <div class="task-g-label">
                    <span class="dot" :style="{ background: PRIORITY_META[task.priority].color }" />
                    <span class="ellipsis">{{ task.title }}</span>
                    <span class="muted mini-p">{{ task.priority }}</span>
                  </div>
                  <div class="track" :style="{ width: `${timelineDays.length * dayWidth}px` }">
                    <div v-if="todayOffset >= 0" class="today-line" :style="{ left: `${todayOffset}px` }" />
                    <div class="g-bar" :style="barStyle(task)">
                      <span v-if="dayWidth >= 22">{{ task.priority }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      </section>
    </div>

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
  margin-bottom: 12px;
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
  gap: 6px;
  flex-wrap: wrap;
}
.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.stat {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
}
.stat strong {
  color: var(--text);
}
.stat.danger strong {
  color: var(--danger);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  font-size: 12px;
}
.zoom button {
  padding: 2px 7px;
}
.table-wrap {
  overflow-x: auto;
}
.wbs-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1080px;
}
.wbs-table th {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-align: left;
  padding: 8px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.wbs-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
  vertical-align: top;
}
.wbs-export-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wbs-block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  background: var(--surface-2);
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 13px;
}
.block-head:hover {
  background: color-mix(in srgb, var(--brand) 6%, var(--surface-2));
}
.block-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex: 0 0 12px;
}
.block-name {
  font-weight: 650;
  color: var(--text);
}
.block-badge {
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 7px;
}
.block-meta {
  color: var(--text-muted);
  font-size: 11.5px;
}
.block-chevron {
  margin-left: auto;
  color: var(--text-muted);
  transition: transform 0.15s ease;
  font-size: 12px;
}
.block-chevron.open {
  transform: rotate(180deg);
}
.block-body {
  display: flex;
  flex-direction: column;
}
.phase-band td {
  background: color-mix(in srgb, var(--brand) 7%, var(--surface)) !important;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
  padding: 6px 8px !important;
}
.week-band td {
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 8px 4px 20px !important;
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.02em;
}
.band-meta {
  font-weight: 400;
  color: var(--text-muted);
}
.process-cell {
  background: var(--surface-2);
  width: 100px;
}
.no {
  color: var(--text-muted);
  width: 36px;
}
.task-link {
  color: var(--text);
  font-weight: 500;
}
.task-link:hover {
  color: var(--brand);
}
.desc {
  color: var(--text-muted);
  max-width: 240px;
}
.status-pill {
  font-size: 11px;
  white-space: nowrap;
}
.gantt {
  overflow: hidden;
}
.gantt-scroll {
  overflow: auto;
  max-height: 68vh;
}
.gantt-grid {
  min-width: 100%;
}
.gantt-header {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 6;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.label-head {
  width: 280px;
  flex: 0 0 280px;
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  z-index: 7;
  background: var(--surface);
}
.timeline-head {
  display: flex;
}
.day-head {
  flex: 0 0 auto;
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  padding: 3px 0;
  border-right: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  position: relative;
  min-height: 38px;
}
.day-head.today {
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  color: var(--brand);
  font-weight: 700;
}
.month {
  display: block;
  font-size: 9px;
  color: var(--text-muted);
}
.day-num {
  display: block;
  font-size: 10px;
}
.gantt-phase {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--brand) 4%, var(--surface));
}
.phase-label {
  width: 280px;
  flex: 0 0 280px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  background: inherit;
  z-index: 3;
}
.phase-track {
  position: relative;
  min-height: 30px;
}
.phase-bar {
  position: absolute;
  top: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--brand-bg);
  border: 1px solid color-mix(in srgb, var(--brand) 45%, transparent);
}
.process-row,
.task-g-row {
  display: flex;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.process-row {
  background: var(--surface-2);
}
.process-label {
  width: 280px;
  flex: 0 0 280px;
  padding: 6px 10px 6px 22px;
  font-size: 11.5px;
  color: var(--text-muted);
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  background: inherit;
  z-index: 3;
}
.task-g-label {
  width: 280px;
  flex: 0 0 280px;
  padding: 6px 10px 6px 34px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 3;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: 0 0 6px;
}
.subcol-project {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-p {
  margin-left: auto;
  font-size: 10px;
}
.track {
  position: relative;
  min-height: 30px;
  flex: 0 0 auto;
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, var(--border) 45%, transparent) 1px,
    transparent 1px
  );
  background-size: var(--day-width, 26px) 100%;
}
.g-bar {
  position: absolute;
  top: 7px;
  height: 16px;
  border-radius: 5px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  min-width: 14px;
  overflow: hidden;
}
.today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--brand);
  z-index: 2;
}
.empty {
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty h3 {
  margin: 0;
}
@media (max-width: 720px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
