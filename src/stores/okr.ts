import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { KeyResult, Objective } from '@/domain/okr'
import {
  computeObjectiveProgress,
  currentQuarter,
  objectiveTaskStats,
} from '@/domain/okr'
import { uid, type TaskInput } from '@/domain/task'
import { decomposeOkr, type TaskDraft } from '@/services/ai'
import { okrRepo } from '@/data/db'
import { useSettingsStore } from './settings'
import { useTaskStore } from './tasks'

export interface WbsFormRow {
  title: string
  description: string
  phase: string
  process: string
  dueStart: string
  dueEnd: string
  owner: string
  participants: string
  statusId: string
  importance: '高' | '中' | '低'
  urgency: '高' | '中' | '低'
  workload: '大' | '中' | '小'
}

export const useOkrStore = defineStore('okr', () => {
  const settingsStore = useSettingsStore()
  const taskStore = useTaskStore()

  const objectives = ref<Objective[]>([])
  const keyResults = ref<KeyResult[]>([])
  const quarter = ref(currentQuarter())
  const loading = ref(false)

  const quarterObjectives = computed(() =>
    objectives.value
      .filter((o) => o.quarter === quarter.value)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  )

  const availableQuarters = computed(() => {
    const set = new Set<string>(objectives.value.map((o) => o.quarter))
    set.add(currentQuarter())
    set.add(quarter.value)
    return [...set].sort().reverse()
  })

  function krsOf(objectiveId: string): KeyResult[] {
    return keyResults.value.filter((kr) => kr.objectiveId === objectiveId)
  }

  function progressOf(objectiveId: string): number {
    return computeObjectiveProgress(
      krsOf(objectiveId),
      taskStore.tasks,
      settingsStore.statuses,
    )
  }

  function statsOf(objectiveId: string) {
    return objectiveTaskStats(krsOf(objectiveId), taskStore.tasks)
  }

  async function load() {
    loading.value = true
    try {
      objectives.value = await okrRepo.allObjectives()
      keyResults.value = await okrRepo.allKeyResults()
    } finally {
      loading.value = false
    }
  }

  async function createObjective(input: {
    title: string
    description?: string
    owner?: string
    confidence?: number
  }) {
    const objective: Objective = {
      id: uid(),
      quarter: quarter.value,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      owner: input.owner?.trim() || null,
      confidence: input.confidence ?? 0.7,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    if (!objective.title) throw new Error('请输入 O 标题')
    await okrRepo.saveObjective(objective)
    objectives.value.push(objective)
    return objective
  }

  async function updateObjective(id: string, patch: Partial<Objective>) {
    const index = objectives.value.findIndex((o) => o.id === id)
    if (index < 0) throw new Error('OKR 不存在')
    const next = { ...objectives.value[index], ...patch }
    await okrRepo.saveObjective(next)
    objectives.value.splice(index, 1, next)
    return next
  }

  async function removeObjective(id: string) {
    const krs = krsOf(id)
    for (const kr of krs) await okrRepo.removeKeyResult(kr.id)
    await okrRepo.removeObjective(id)
    objectives.value = objectives.value.filter((o) => o.id !== id)
    keyResults.value = keyResults.value.filter((kr) => kr.objectiveId !== id)
  }

  async function createKeyResult(objectiveId: string, input: Partial<KeyResult> & { title: string }) {
    const kr: KeyResult = {
      id: uid(),
      objectiveId,
      quarter: quarter.value,
      title: input.title.trim(),
      metric: input.metric ?? '',
      baseline: input.baseline ?? 0,
      target: input.target ?? 100,
      current: input.current ?? 0,
      unit: input.unit ?? '',
      dueDate: input.dueDate ?? null,
      manualProgress: input.manualProgress ?? 0,
      mode: input.mode ?? 'hybrid',
      createdAt: new Date().toISOString(),
    }
    if (!kr.title) throw new Error('请输入 KR 标题')
    await okrRepo.saveKeyResult(kr)
    keyResults.value.push(kr)
    return kr
  }

  async function updateKeyResult(id: string, patch: Partial<KeyResult>) {
    const index = keyResults.value.findIndex((kr) => kr.id === id)
    if (index < 0) throw new Error('KR 不存在')
    const next = { ...keyResults.value[index], ...patch }
    await okrRepo.saveKeyResult(next)
    keyResults.value.splice(index, 1, next)
    return next
  }

  async function removeKeyResult(id: string) {
    await okrRepo.removeKeyResult(id)
    keyResults.value = keyResults.value.filter((kr) => kr.id !== id)
  }

  async function decompose(objectiveId: string): Promise<TaskDraft[]> {
    const objective = objectives.value.find((o) => o.id === objectiveId)
    if (!objective) throw new Error('OKR 不存在')
    return decomposeOkr(settingsStore.settings.ai, objective, krsOf(objectiveId))
  }

  async function commitDrafts(drafts: TaskDraft[], source: 'okr-ai' | 'ai-chat' = 'okr-ai') {
    let count = 0
    for (const draft of drafts.filter((d) => d.selected)) {
      const status =
        settingsStore.statuses.find((s) => s.name === draft.statusName)?.id ?? 'todo'
      const input: TaskInput = {
        title: draft.title,
        description: draft.description,
        statusId: status,
        importance: draft.importance,
        urgency: draft.urgency,
        workload: draft.workload,
        dueStart: draft.dueStart,
        dueEnd: draft.dueEnd,
        phase: draft.phase,
        process: draft.process,
        owner: draft.owner,
        participants: draft.participants,
        okrLinks: draft.okrLinks,
        source,
      }
      await taskStore.create(input)
      count++
    }
    return count
  }

  async function createFromWbs(
    objectiveId: string,
    rows: WbsFormRow[],
    keyResultId?: string,
  ): Promise<number> {
    let count = 0
    for (const [index, row] of rows.entries()) {
      if (!row.title.trim()) continue
      const links = [{ objectiveId, ...(keyResultId ? { keyResultId } : {}) }]
      await taskStore.create({
        title: row.title,
        description: row.description,
        phase: row.phase || null,
        process: row.process || null,
        order: index + 1,
        dueStart: row.dueStart || null,
        dueEnd: row.dueEnd || null,
        owner: row.owner || null,
        participants: row.participants
          ? row.participants.split(/[,，/、]/).map((x) => x.trim()).filter(Boolean)
          : [],
        statusId: row.statusId,
        importance: row.importance,
        urgency: row.urgency,
        workload: row.workload,
        okrLinks: links,
        source: 'okr-manual',
      })
      count++
    }
    return count
  }

  return {
    objectives,
    keyResults,
    quarter,
    loading,
    quarterObjectives,
    availableQuarters,
    krsOf,
    progressOf,
    statsOf,
    load,
    createObjective,
    updateObjective,
    removeObjective,
    createKeyResult,
    updateKeyResult,
    removeKeyResult,
    decompose,
    commitDrafts,
    createFromWbs,
  }
})
