import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Importance, Priority, Task, TaskInput, Workload } from '@/domain/task'
import { createTask, isOverdue, statusOf, validateTask } from '@/domain/task'
import { computePriority, resolvePriority, sortByPriority } from '@/domain/priority'
import { groupTasksByWeek } from '@/domain/date'
import { taskRepo } from '@/data/db'
import { useSettingsStore } from './settings'

export interface TaskFilters {
  keyword: string
  statusId: string
  importance: string
  urgency: string
  workload: string
  priority: string
  phase: string
  projectId: string
  dueFrom: string
  dueTo: string
}

function emptyFilters(): TaskFilters {
  return {
    keyword: '',
    statusId: '',
    importance: '',
    urgency: '',
    workload: '',
    priority: '',
    phase: '',
    projectId: '',
    dueFrom: '',
    dueTo: '',
  }
}

export const useTaskStore = defineStore('tasks', () => {
  const settingsStore = useSettingsStore()
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const filters = ref<TaskFilters>(emptyFilters())
  const selectedIds = ref<string[]>([])
  const readonly = ref(false)

  const statuses = computed(() => settingsStore.statuses)

  const filtered = computed(() => {
    const f = filters.value
    const keyword = f.keyword.trim().toLowerCase()
    return tasks.value.filter((task) => {
      if (keyword && !`${task.title} ${task.description}`.toLowerCase().includes(keyword)) return false
      if (f.statusId && task.statusId !== f.statusId) return false
      if (f.importance && task.importance !== f.importance) return false
      if (f.urgency && task.urgency !== f.urgency) return false
      if (f.workload && task.workload !== f.workload) return false
      if (f.priority && task.priority !== f.priority) return false
      if (f.phase && task.phase !== f.phase) return false
      if (f.projectId && task.projectId !== f.projectId) return false
      if (f.dueFrom && (task.dueEnd ?? '') < f.dueFrom) return false
      if (f.dueTo && (task.dueStart ?? task.dueEnd ?? '9999') > f.dueTo) return false
      return true
    })
  })

  const weekGroups = computed(() =>
    groupTasksByWeek(sortByPriority(filtered.value), {
      repeatSpanning: settingsStore.settings.repeatSpanning,
      weekStartsOn: settingsStore.settings.weekStartsOn,
    }),
  )

  const overdue = computed(() =>
    tasks.value.filter((task) => isOverdue(task, statuses.value)),
  )

  const phases = computed(() =>
    [...new Set(tasks.value.map((task) => task.phase).filter(Boolean) as string[])].sort(),
  )

  const activeFilterCount = computed(
    () => Object.values(filters.value).filter((value) => String(value).trim()).length,
  )

  const selectedCount = computed(() => selectedIds.value.length)

  async function load() {
    loading.value = true
    try {
      tasks.value = await taskRepo.all()
    } finally {
      loading.value = false
    }
  }

  function derive(task: Task, patch: Partial<Task> = {}): Task {
    const next: Task = { ...task, ...patch, updatedAt: new Date().toISOString() }
    const resolved = resolvePriority(next)
    next.priority = resolved.value
    const category = statusOf(next.statusId, statuses.value).category
    if (category === 'done' && !next.completedAt) next.completedAt = next.updatedAt
    if (category !== 'done') next.completedAt = null
    return next
  }

  async function create(input: TaskInput): Promise<Task> {
    const priority = computePriority(input.importance ?? '中', input.urgency ?? '中')
    const task = createTask({ ...input, priority })
    const errors = validateTask(task)
    if (errors.length) throw new Error(errors[0])
    task.priority = resolvePriority(task).value
    await taskRepo.save(task)
    tasks.value = [task, ...tasks.value]
    return task
  }

  async function update(id: string, patch: Partial<Task>): Promise<Task> {
    const index = tasks.value.findIndex((task) => task.id === id)
    if (index < 0) throw new Error('任务不存在')
    const next = derive(tasks.value[index], patch)
    const errors = validateTask(next)
    if (errors.length) throw new Error(errors[0])
    // 先更新本地状态，避免连续调用时后一次覆盖前一次（丢失更新）
    tasks.value.splice(index, 1, next)
    await taskRepo.save(next)
    return next
  }

  async function remove(id: string) {
    await taskRepo.remove(id)
    tasks.value = tasks.value.filter((task) => task.id !== id)
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  }

  async function bulkUpdate(ids: string[], patch: Partial<Task>) {
    const updated: Task[] = []
    for (const id of ids) {
      const index = tasks.value.findIndex((task) => task.id === id)
      if (index < 0) continue
      const next = derive(tasks.value[index], patch)
      updated.push(next)
      tasks.value.splice(index, 1, next)
    }
    if (updated.length) await taskRepo.bulkSave(updated)
  }

  async function setOverride(id: string, priority: Priority) {
    return update(id, {
      priorityOverride: { value: priority, at: new Date().toISOString() },
    })
  }

  async function resetOverride(id: string) {
    return update(id, { priorityOverride: null })
  }

  async function toggleDone(id: string) {
    const task = tasks.value.find((t) => t.id === id)
    if (!task) return
    const done = statusOf(task.statusId, statuses.value).category === 'done'
    return update(id, { statusId: done ? 'todo' : 'done' })
  }

  function toggleSelect(id: string) {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  function selectAll(ids: string[]) {
    selectedIds.value = ids
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function resetFilters() {
    filters.value = emptyFilters()
  }

  return {
    tasks,
    loading,
    filters,
    selectedIds,
    readonly,
    statuses,
    filtered,
    weekGroups,
    overdue,
    phases,
    activeFilterCount,
    selectedCount,
    load,
    create,
    update,
    remove,
    bulkUpdate,
    setOverride,
    resetOverride,
    toggleDone,
    toggleSelect,
    selectAll,
    clearSelection,
    resetFilters,
  }
})
