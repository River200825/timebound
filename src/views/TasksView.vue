<script setup lang="ts">
import { computed, onMounted, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/tasks'
import { useSettingsStore } from '@/stores/settings'
import { useProjectStore } from '@/stores/projects'
import { useToast } from '@/composables/toast'
import TaskRow from '@/components/TaskRow.vue'
import TaskDetailDrawer from '@/components/TaskDetailDrawer.vue'
import IconEmpty from '@/components/icons/IconEmpty.vue'
import type { Task, TaskInput, StatusDefinition } from '@/domain/task'
import { statusOf } from '@/domain/task'
import { tasksToCsv, downloadText } from '@/services/export'

const route = useRoute()
const router = useRouter()
const searchInput = ref<HTMLInputElement | null>(null)

interface UiGroup {
  key: string
  label: string
  sub: string
  tasks: Task[]
  end: string | null
  unscheduled?: boolean
}

const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const projectStore = useProjectStore()
const toast = useToast()

const drawerOpen = ref(false)
const editing = ref<Task | null>(null)
const groupMode = ref<'week' | 'status'>('week')
const quickView = ref<'all' | 's' | 'high' | 'done' | 'week'>('all')
const collapsed = ref<Set<string>>(new Set())
const quickTitles = ref<Record<string, string>>({})

const statuses = computed(() => settingsStore.statuses)

function weekRangeISO(): { from: string; to: string } {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(monday), to: fmt(sunday) }
}

function applyQuickView(view: typeof quickView.value) {
  quickView.value = view
  taskStore.resetFilters()
  if (view === 's') taskStore.filters.priority = 'S'
  if (view === 'high') taskStore.filters.importance = '高'
  if (view === 'done') taskStore.filters.statusId = 'done'
  if (view === 'week') {
    const { from, to } = weekRangeISO()
    taskStore.filters.dueFrom = from
    taskStore.filters.dueTo = to
  }
}

function applyProject(projectId: string) {
  projectStore.selectedId = projectId
  taskStore.filters.projectId = projectId
}

const quickViewCounts = computed(() => ({
  total: taskStore.tasks.length,
  done: taskStore.tasks.filter(
    (task) => statusOf(task.statusId, statuses.value).category === 'done',
  ).length,
  sCount: taskStore.tasks.filter((task) => task.priority === 'S').length,
  highCount: taskStore.tasks.filter((task) => task.importance === '高').length,
}))

const stats = computed(() => {
  const total = taskStore.tasks.length
  const done = taskStore.tasks.filter(
    (task) => statusOf(task.statusId, statuses.value).category === 'done',
  ).length
  const sCount = taskStore.tasks.filter((task) => task.priority === 'S').length
  return {
    total,
    done,
    overdue: taskStore.overdue.length,
    sCount,
    rate: total ? Math.round((done / total) * 100) : 0,
  }
})

const groups = computed<UiGroup[]>(() => {
  if (groupMode.value === 'week') {
    return taskStore.weekGroups.map((group) => ({
      key: group.key,
      label: group.label,
      sub: `${group.tasks.length} 条 · 完成 ${group.tasks.filter((t) => statusOf(t.statusId, statuses.value).category === 'done').length}`,
      tasks: group.tasks,
      end: group.unscheduled ? null : group.end,
      unscheduled: group.unscheduled,
    }))
  }

  const map = new Map<string, Task[]>()
  for (const status of statuses.value) map.set(status.id, [])
  for (const task of taskStore.filtered) {
    const list = map.get(task.statusId) ?? []
    list.push(task)
    map.set(task.statusId, list)
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([statusId, list]) => ({
      key: statusId,
      label: statusOf(statusId, statuses.value).name,
      sub: `${list.length} 条`,
      tasks: list,
      end: null,
    }))
})

const allVisibleIds = computed(() => groups.value.flatMap((g) => g.tasks.map((t) => t.id)))
const allSelected = computed(
  () => allVisibleIds.value.length > 0 && allVisibleIds.value.every((id) => taskStore.selectedIds.includes(id)),
)

onMounted(() => {
  if (route.query.new === '1') {
    openNew()
    void router.replace({ query: {} })
  }
  if (route.query.search === '1') {
    nextTick(() => searchInput.value?.focus())
    void router.replace({ query: {} })
  }
})

function toggleCollapse(key: string) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

function openNew() {
  editing.value = null
  drawerOpen.value = true
}

function openTask(task: Task) {
  editing.value = task
  drawerOpen.value = true
}

async function saveTask(payload: Record<string, unknown>) {
  try {
    if (editing.value) {
      await taskStore.update(editing.value.id, payload as Partial<Task>)
      toast.push('任务已保存', 'success')
    } else {
      await taskStore.create(payload as TaskInput)
      toast.push('任务已创建', 'success')
    }
    drawerOpen.value = false
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '保存失败', 'error')
  }
}

async function removeTask(id: string) {
  if (!confirm('确定删除这条任务？')) return
  await taskStore.remove(id)
  drawerOpen.value = false
  toast.push('任务已删除', 'info')
}

async function updateTask(task: Task, patch: Partial<Task>) {
  try {
    await taskStore.update(task.id, patch)
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '更新失败', 'error')
  }
}

async function quickAdd(group: UiGroup) {
  const title = (quickTitles.value[group.key] ?? '').trim()
  if (!title) return
  try {
    const status = statuses.value[0] ?? { id: 'todo' } as StatusDefinition
    await taskStore.create({
      title,
      dueStart: group.end,
      dueEnd: group.end,
      statusId: status.id,
      importance: '中',
      urgency: '中',
      workload: '中',
    })
    quickTitles.value[group.key] = ''
    toast.push('已添加任务', 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '添加失败', 'error')
  }
}

async function bulkDone() {
  await taskStore.bulkUpdate(taskStore.selectedIds, { statusId: 'done' })
  taskStore.clearSelection()
  toast.push('已标记完成', 'success')
}

async function bulkRemove() {
  if (!confirm(`确定删除选中的 ${taskStore.selectedIds.length} 条任务？`)) return
  for (const id of [...taskStore.selectedIds]) await taskStore.remove(id)
  toast.push('已删除', 'info')
}

function toggleAll() {
  if (allSelected.value) taskStore.clearSelection()
  else taskStore.selectAll(allVisibleIds.value)
}

function exportCsv() {
  downloadText(
    `timebound-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
    tasksToCsv(taskStore.filtered, statuses.value),
  )
  toast.push('已导出 CSV', 'success')
}
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading">项目</div>
          <RouterLink to="/projects" class="subcol-item">
            <span>管理项目</span>
          </RouterLink>
          <button class="subcol-item" :class="{ active: projectStore.selectedId === '' }" @click="applyProject('')">
            全部<span class="count">{{ taskStore.tasks.length }}</span>
          </button>
          <button
            v-for="p in projectStore.active"
            :key="p.id"
            class="subcol-item"
            :class="{ active: projectStore.selectedId === p.id }"
            @click="applyProject(p.id)"
          >
            <span class="subcol-project">
              <span class="dot" :style="{ background: p.color }" />{{ p.name }}
            </span>
          </button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">快捷视图</div>
          <button class="subcol-item" :class="{ active: quickView === 'all' }" @click="applyQuickView('all')">
            全部<span class="count">{{ quickViewCounts.total }}</span>
          </button>
          <button class="subcol-item" :class="{ active: quickView === 's' }" @click="applyQuickView('s')">
            仅 S 级<span class="count">{{ quickViewCounts.sCount }}</span>
          </button>
          <button class="subcol-item" :class="{ active: quickView === 'high' }" @click="applyQuickView('high')">
            高重要<span class="count">{{ quickViewCounts.highCount }}</span>
          </button>
          <button class="subcol-item" :class="{ active: quickView === 'done' }" @click="applyQuickView('done')">
            已完成<span class="count">{{ quickViewCounts.done }}</span>
          </button>
          <button class="subcol-item" :class="{ active: quickView === 'week' }" @click="applyQuickView('week')">
            本周到期
          </button>
          <RouterLink to="/wbs" class="subcol-item">时间轴 →</RouterLink>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">视图</div>
          <button class="subcol-item" :class="{ active: groupMode === 'week' }" @click="groupMode = 'week'">
            按周
          </button>
          <button class="subcol-item" :class="{ active: groupMode === 'status' }" @click="groupMode = 'status'">
            按状态
          </button>
          <RouterLink to="/wbs" class="subcol-item">时间轴 →</RouterLink>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>轻重缓急工作表</h1>
        <p class="muted">根据重要/紧急程度划分优先级，按周安排工作，做好时间管理。</p>
      </div>
      <div class="head-actions">
        <button class="btn-outline" @click="exportCsv">导出 CSV</button>
        <button class="btn-primary" @click="openNew">+ 新建任务</button>
      </div>
    </header>

    <div class="stats">
      <span class="stat"><strong>{{ stats.total }}</strong> 全部任务</span>
      <span class="stat"><strong>{{ stats.done }}</strong> 已完成</span>
      <span class="stat"><strong>{{ stats.rate }}%</strong> 完成率</span>
      <span class="stat danger"><strong>{{ stats.overdue }}</strong> 逾期</span>
      <span class="stat"><strong>{{ stats.sCount }}</strong> 个 S 级</span>
    </div>

    <div class="toolbar">
      <div class="filters">
        <input
          ref="searchInput"
          v-model="taskStore.filters.keyword"
          class="field search"
          placeholder="搜索任务…"
          aria-label="搜索任务"
        />
        <select v-model="taskStore.filters.statusId" class="field">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status.id" :value="status.id">{{ status.name }}</option>
        </select>
        <select v-model="taskStore.filters.priority" class="field">
          <option value="">全部优先级</option>
          <option v-for="p in ['S', 'A', 'B+', 'B', 'B-', 'C']" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="taskStore.filters.importance" class="field">
          <option value="">重要程度</option>
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
        <select v-model="taskStore.filters.urgency" class="field">
          <option value="">紧急程度</option>
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
        <select v-model="taskStore.filters.workload" class="field">
          <option value="">工作量</option>
          <option value="大">大</option>
          <option value="中">中</option>
          <option value="小">小</option>
        </select>
        <input v-model="taskStore.filters.dueFrom" type="date" class="field date" aria-label="起始日期" />
        <input v-model="taskStore.filters.dueTo" type="date" class="field date" aria-label="结束日期" />
        <button v-if="taskStore.activeFilterCount" class="btn-ghost" @click="taskStore.resetFilters()">
          清除筛选 ({{ taskStore.activeFilterCount }})
        </button>
      </div>
    </div>

    <div v-if="taskStore.selectedCount" class="bulkbar">
      <span>已选 {{ taskStore.selectedCount }} 条</span>
      <button class="btn-outline" @click="bulkDone">标记完成</button>
      <button class="btn-outline danger-text" @click="bulkRemove">删除</button>
      <button class="btn-ghost" @click="taskStore.clearSelection()">取消选择</button>
    </div>

    <div v-if="!taskStore.tasks.length" class="empty card">
      <div class="empty-icon"><IconEmpty :size="36" /></div>
      <h3>从第一条任务开始</h3>
      <p class="muted">你可以手动新建，也可以让 AI 从文字或截图中识别任务。</p>
      <div class="empty-actions">
        <button class="btn-primary" @click="openNew">手动新建</button>
        <RouterLink to="/ai" class="btn-outline">用 AI 创建</RouterLink>
        <RouterLink to="/settings" class="btn-ghost">导入数据</RouterLink>
      </div>
    </div>

    <div v-for="group in groups" :key="group.key" class="group">
      <button class="group-head" @click="toggleCollapse(group.key)">
        <span class="caret">{{ collapsed.has(group.key) ? '▸' : '▾' }}</span>
        <span class="group-title">{{ group.label }}</span>
        <span class="muted group-sub">{{ group.sub }}</span>
      </button>

      <div v-if="!collapsed.has(group.key)" class="table-wrap card">
        <table class="task-table">
          <thead>
            <tr>
              <th class="check-cell">
                <input type="checkbox" :checked="allSelected" aria-label="全选" @change="toggleAll" />
              </th>
              <th>任务名称</th>
              <th>截止日期</th>
              <th>状态</th>
              <th>重要</th>
              <th>紧急</th>
              <th>工作量</th>
              <th>优先级</th>
              <th>主责人</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <TaskRow
              v-for="task in group.tasks"
              :key="task.id"
              :task="task"
              :statuses="statuses"
              :selected="taskStore.selectedIds.includes(task.id)"
              @open="openTask(task)"
              @update="(patch) => updateTask(task, patch)"
              @remove="removeTask(task.id)"
              @select="taskStore.toggleSelect(task.id)"
              @toggle-done="taskStore.toggleDone(task.id)"
            />
            <tr class="quick-row">
              <td />
              <td colspan="9">
                <input
                  v-model="quickTitles[group.key]"
                  class="quick-input"
                  :placeholder="group.unscheduled ? '+ 新建未排期任务，回车保存' : `+ 在 ${group.label} 新建任务，回车保存`"
                  @keydown.enter.prevent="quickAdd(group)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="taskStore.tasks.length && !groups.length" class="empty card">
      <h3>没有符合条件的任务</h3>
      <button class="btn-outline" @click="taskStore.resetFilters()">清除筛选</button>
    </div>

    <TaskDetailDrawer
      :open="drawerOpen"
      :task="editing"
      :statuses="statuses"
      @close="drawerOpen = false"
      @save="saveTask"
      @remove="removeTask"
    />
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 14px;
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
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.subcol-project {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.subcol-project .dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 8px;
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
  margin-right: 2px;
}
.stat.danger strong {
  color: var(--danger);
}
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 16px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.filters .field {
  width: auto;
  min-width: 96px;
  font-size: 12px;
  padding: 5px 7px;
}
.filters .search {
  min-width: 180px;
}
.filters .date {
  min-width: 128px;
}
.bulkbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--border));
  background: color-mix(in srgb, var(--brand) 7%, var(--surface));
  border-radius: 9px;
  margin-bottom: 12px;
  font-size: 12.5px;
}
.group {
  margin-bottom: 16px;
}
.group-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 7px 3px;
  cursor: pointer;
  color: var(--text);
}
.caret {
  width: 14px;
  color: var(--text-muted);
}
.group-title {
  font-weight: 650;
  font-size: 13.5px;
}
.group-sub {
  font-size: 11.5px;
}
.table-wrap {
  overflow-x: auto;
}
.task-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}
.task-table th {
  text-align: left;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  white-space: nowrap;
}
.task-table th.actions {
  text-align: right;
}
.check-cell {
  width: 28px;
}
.quick-row td {
  border-bottom: 0;
  padding: 5px 8px;
}
.quick-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 5px 4px;
  font-size: 12.5px;
  color: var(--text);
  outline: none;
}
.quick-input::placeholder {
  color: color-mix(in srgb, var(--text-muted) 75%, transparent);
}
.empty {
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
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
  margin: 4px 0 0;
  font-size: 15px;
}
.empty p {
  margin: 0;
  max-width: 430px;
}
.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.danger-text {
  color: var(--danger);
}
@media (max-width: 720px) {
  .page-head {
    flex-direction: column;
  }
  .filters .search {
    min-width: 100%;
  }
}
</style>
