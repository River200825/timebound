<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_STATUSES, type Importance, type Workload } from '@/domain/task'
import type { TaskDraft } from '@/services/ai'
import PriorityBadge from './PriorityBadge.vue'
import DateRangePicker from './DateRangePicker.vue'
import { useProjectStore } from '@/stores/projects'

const props = defineProps<{ draft: TaskDraft }>()
const emit = defineEmits<{
  update: [patch: Partial<TaskDraft>]
  remove: []
}>()
const projectStore = useProjectStore()

const range = computed(() => ({ start: props.draft.dueStart, end: props.draft.dueEnd }))
const lowConfidence = computed(() => props.draft.confidence < 0.6)
const selectedPhases = computed(
  () => projectStore.byId(props.draft.projectId)?.phases ?? [],
)
const draftPhaseOptions = computed(() => {
  const list = selectedPhases.value.map((p) => ({ value: p, label: p }))
  const current = props.draft.phase?.trim()
  if (current && !selectedPhases.value.includes(current)) {
    list.push({ value: current, label: `${current}（项目外）` })
  }
  return list
})
const statusOptions = computed(() => {
  const names = new Set<string>(DEFAULT_STATUSES.map((s) => s.name))
  // 保留 AI 返回的自定义状态，避免下拉里“消失”
  const extra = props.draft.statusName?.trim()
  if (extra && !names.has(extra)) names.add(extra)
  return [...names]
})

function setRange(value: { start: string | null; end: string | null }) {
  emit('update', { dueStart: value.start, dueEnd: value.end })
}
</script>

<template>
  <article class="draft" :class="{ low: lowConfidence }">
    <header class="draft-head">
      <label class="select-box">
        <input
          type="checkbox"
          :checked="draft.selected"
          @change="emit('update', { selected: ($event.target as HTMLInputElement).checked })"
        />
        <span class="muted">加入任务表</span>
      </label>
      <PriorityBadge :priority="draft.priority" />
      <span v-if="lowConfidence" class="warn">低置信度，请确认</span>
      <button class="btn-ghost del" title="移除草稿" @click="emit('remove')">✕</button>
    </header>

    <input
      class="draft-title"
      :value="draft.title"
      placeholder="任务名称"
      @input="emit('update', { title: ($event.target as HTMLInputElement).value })"
    />

    <textarea
      class="field desc"
      rows="2"
      :value="draft.description"
      placeholder="说明"
      @input="emit('update', { description: ($event.target as HTMLTextAreaElement).value })"
    />

    <div class="draft-grid">
      <div class="cell wide">
        <span class="muted label">截止日期</span>
        <DateRangePicker :model-value="range" @update:model-value="setRange" />
      </div>
      <label class="cell">
        <span class="muted label">重要</span>
        <select
          class="field"
          :value="draft.importance"
          @change="emit('update', { importance: ($event.target as HTMLSelectElement).value as Importance })"
        >
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
      </label>
      <label class="cell">
        <span class="muted label">紧急</span>
        <select
          class="field"
          :value="draft.urgency"
          @change="emit('update', { urgency: ($event.target as HTMLSelectElement).value as Importance })"
        >
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
      </label>
      <label class="cell">
        <span class="muted label">工作量</span>
        <select
          class="field"
          :value="draft.workload"
          @change="emit('update', { workload: ($event.target as HTMLSelectElement).value as Workload })"
        >
          <option value="大">大</option>
          <option value="中">中</option>
          <option value="小">小</option>
        </select>
      </label>
      <label class="cell">
        <span class="muted label">状态</span>
        <select
          class="field"
          :value="draft.statusName"
          @change="emit('update', { statusName: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="name in statusOptions" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="cell">
        <span class="muted label">阶段</span>
        <select
          v-if="draft.projectId && selectedPhases.length"
          class="field"
          :value="draft.phase ?? ''"
          @change="emit('update', { phase: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">（未填写）</option>
          <option v-for="p in draftPhaseOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <input
          v-else
          class="field"
          :value="draft.phase ?? ''"
          @input="emit('update', { phase: ($event.target as HTMLInputElement).value || null })"
        />
      </label>
      <label class="cell">
        <span class="muted label">流程</span>
        <input
          class="field"
          :value="draft.process ?? ''"
          @input="emit('update', { process: ($event.target as HTMLInputElement).value || null })"
        />
      </label>
      <label class="cell">
        <span class="muted label">主责人</span>
        <input
          class="field"
          :value="draft.owner ?? ''"
          @input="emit('update', { owner: ($event.target as HTMLInputElement).value || null })"
        />
      </label>
      <label class="cell wide">
        <span class="muted label">所属项目</span>
        <select
          class="field"
          :value="draft.projectId ?? ''"
          @change="emit('update', { projectId: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value=""><span class="muted">未分配项目</span></option>
          <option v-for="p in projectStore.active" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
    </div>

    <p v-if="draft.evidence" class="evidence">依据：{{ draft.evidence }}</p>
  </article>
</template>

<style scoped>
.draft {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.draft.low {
  border-color: color-mix(in srgb, var(--p-a) 45%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--p-a) 18%, transparent);
}
.draft-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.select-box {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
}
.warn {
  font-size: 10.5px;
  color: var(--p-a);
  background: var(--p-a-bg);
  padding: 1px 6px;
  border-radius: 999px;
}
.del {
  margin-left: auto;
  padding: 2px 6px;
}
.draft-title {
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  padding: 3px 5px;
  border-radius: 5px;
  color: var(--text);
}
.draft-title:hover,
.draft-title:focus {
  border-color: var(--border);
}
.desc {
  resize: vertical;
}
.draft-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cell.wide {
  grid-column: span 2;
}
.label {
  font-size: 10.5px;
}
.evidence {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  border-left: 2px solid var(--border);
  padding-left: 7px;
}
@media (max-width: 720px) {
  .draft-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .cell.wide {
    grid-column: span 2;
  }
}
</style>
