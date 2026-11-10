<script setup lang="ts">
import { computed } from 'vue'
import type { Task, StatusDefinition, Importance, Workload, Priority } from '@/domain/task'
import { dateRangeLabel } from '@/domain/date'
import { isOverdue, statusOf } from '@/domain/task'
import { PRIORITY_ORDER } from '@/domain/priority'
import PriorityBadge from './PriorityBadge.vue'
import { useProjectStore } from '@/stores/projects'

const props = defineProps<{
  task: Task
  statuses: StatusDefinition[]
  selected?: boolean
}>()

const emit = defineEmits<{
  update: [patch: Partial<Task>]
  open: []
  remove: []
  select: []
  'toggle-done': []
}>()

const status = computed(() => statusOf(props.task.statusId, props.statuses))
const overdue = computed(() => isOverdue(props.task, props.statuses))
const done = computed(() => status.value.category === 'done')
const projectStore = useProjectStore()
const project = computed(() => projectStore.byId(props.task.projectId))

const statusIcon = computed(() => {
  if (status.value.category === 'done') return '✓'
  if (status.value.category === 'cancelled') return '×'
  if (status.value.category === 'postponed') return '»'
  return '○'
})

const importanceOptions: Importance[] = ['高', '中', '低']
const workloadOptions: Workload[] = ['大', '中', '小']

function onPriority(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Priority | ''
  emit('update', {
    priorityOverride: value
      ? { value, at: new Date().toISOString() }
      : null,
  })
}
</script>

<template>
  <tr class="task-row" :class="{ done, overdue }">
    <td class="check-cell">
      <input type="checkbox" :checked="selected" aria-label="选择任务" @change="emit('select')" />
    </td>
    <td class="title-cell">
      <button class="title-btn" @click="emit('open')">
        <span class="status-dot" :style="{ color: status.color }">{{ statusIcon }}</span>
        <span :class="{ strike: done }">{{ task.title }}</span>
      </button>
      <div class="sub">
        <span v-if="project" class="project-tag" :style="{ background: `${project.color}22`, color: project.color, borderColor: `${project.color}55` }">{{ project.name }}</span>
        <span v-if="task.phase || task.process" class="muted">{{ [task.phase, task.process].filter(Boolean).join(' / ') }}</span>
      </div>
    </td>
    <td>
      <span class="due" :class="{ late: overdue }">{{ dateRangeLabel(task.dueStart, task.dueEnd) }}</span>
      <span v-if="overdue" class="late-tag">逾期</span>
    </td>
    <td>
      <select class="mini" :value="task.statusId" @change="emit('update', { statusId: ($event.target as HTMLSelectElement).value })">
        <option v-for="item in statuses" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </td>
    <td>
      <select class="mini" :value="task.importance" @change="emit('update', { importance: ($event.target as HTMLSelectElement).value as Importance })">
        <option v-for="item in importanceOptions" :key="item" :value="item">{{ item }}</option>
      </select>
    </td>
    <td>
      <select class="mini" :value="task.urgency" @change="emit('update', { urgency: ($event.target as HTMLSelectElement).value as Importance })">
        <option v-for="item in importanceOptions" :key="item" :value="item">{{ item }}</option>
      </select>
    </td>
    <td>
      <select class="mini" :value="task.workload" @change="emit('update', { workload: ($event.target as HTMLSelectElement).value as Workload })">
        <option v-for="item in workloadOptions" :key="item" :value="item">{{ item }}</option>
      </select>
    </td>
    <td class="priority-cell">
      <PriorityBadge :priority="task.priority" :is-override="Boolean(task.priorityOverride)" />
      <select class="mini priority-select" :value="task.priorityOverride?.value ?? ''" title="手动调整优先级" @change="onPriority">
        <option value="">自动</option>
        <option v-for="item in PRIORITY_ORDER" :key="item" :value="item">{{ item }}</option>
      </select>
    </td>
    <td class="owner muted">{{ task.owner || '—' }}</td>
    <td class="actions">
      <button class="btn-ghost icon-btn" title="完成/恢复" @click="emit('toggle-done')">✓</button>
      <button class="btn-ghost icon-btn" title="查看详情" @click="emit('open')">⋯</button>
      <button class="btn-ghost icon-btn danger" title="删除" @click="emit('remove')">✕</button>
    </td>
  </tr>
</template>

<style scoped>
.task-row td {
  border-bottom: 1px solid var(--border);
  padding: 7px 8px;
  vertical-align: middle;
  font-size: 12.5px;
}
.task-row:hover {
  background: color-mix(in srgb, var(--text) 3%, transparent);
}
.check-cell {
  width: 28px;
}
.title-cell {
  min-width: 200px;
}
.title-btn {
  border: 0;
  background: transparent;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font-weight: 500;
}
.status-dot {
  font-size: 13px;
}
.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}
.sub {
  font-size: 11px;
  margin-top: 1px;
}
.due {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.due.late {
  color: var(--danger);
  font-weight: 600;
}
.late-tag {
  margin-left: 5px;
  font-size: 10px;
  color: var(--danger);
  background: var(--p-s-bg);
  padding: 1px 5px;
  border-radius: 999px;
}
.mini {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 5px;
  padding: 3px 4px;
  font-size: 11.5px;
  cursor: pointer;
  max-width: 84px;
}
.mini:hover,
.mini:focus {
  border-color: var(--border);
  background: var(--surface);
}
.priority-cell {
  white-space: nowrap;
}
.priority-select {
  width: 58px;
  margin-left: 2px;
  color: var(--text-muted);
}
.owner {
  white-space: nowrap;
}
.actions {
  white-space: nowrap;
  text-align: right;
}
.icon-btn {
  padding: 3px 6px;
  font-size: 12px;
}
.icon-btn.danger:hover {
  color: var(--danger);
}
@media (max-width: 900px) {
  .owner,
  .priority-select {
    display: none;
  }
}
</style>
