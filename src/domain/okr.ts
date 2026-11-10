import type { Task } from './task'
import { DEFAULT_STATUSES, statusOf, type StatusDefinition } from './task'

export interface Objective {
  id: string
  quarter: string
  title: string
  description: string
  owner: string | null
  confidence: number
  status: 'active' | 'archived'
  createdAt: string
}

export type ProgressMode = 'hybrid' | 'tasks' | 'manual'

export interface KeyResult {
  id: string
  objectiveId: string
  quarter: string
  title: string
  metric: string
  baseline: number
  target: number
  current: number
  unit: string
  dueDate: string | null
  manualProgress: number
  mode: ProgressMode
  createdAt: string
}

export const WORKLOAD_WEIGHT = { 大: 5, 中: 3, 小: 1 } as const

export function currentQuarter(date = new Date()): string {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`
}

export function quarterRange(quarter: string): { start: string; end: string } {
  const [yearStr, qStr] = quarter.split('-Q')
  const year = Number(yearStr)
  const q = Number(qStr)
  const startMonth = (q - 1) * 3
  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const endDate = new Date(year, startMonth + 3, 0)
  const end = `${year}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  return { start, end }
}

export function isTaskDone(task: Task, statuses: StatusDefinition[] = DEFAULT_STATUSES): boolean {
  return statusOf(task.statusId, statuses).category === 'done'
}

/**
 * KR 进度 = 任务完成度（工作量加权）* 70% + 手动进度 * 30%。
 * mode='tasks' 时只看任务；mode='manual' 时只看手动值。
 */
export function computeKrProgress(
  kr: KeyResult,
  tasks: Task[],
  statuses: StatusDefinition[] = DEFAULT_STATUSES,
): number {
  const manual = clamp(kr.manualProgress)
  if (kr.mode === 'manual') return manual

  const linked = tasks.filter((t) => t.okrLinks.some((l) => l.keyResultId === kr.id))
  const totalWeight = linked.reduce((sum, t) => sum + WORKLOAD_WEIGHT[t.workload], 0)
  const taskScore =
    totalWeight === 0
      ? 0
      : linked
          .filter((t) => isTaskDone(t, statuses))
          .reduce((sum, t) => sum + WORKLOAD_WEIGHT[t.workload], 0) / totalWeight

  if (kr.mode === 'tasks') return clamp(taskScore * 100)
  if (totalWeight === 0) return manual
  return clamp(taskScore * 100 * 0.7 + manual * 0.3)
}

export function computeObjectiveProgress(
  krs: KeyResult[],
  tasks: Task[],
  statuses: StatusDefinition[] = DEFAULT_STATUSES,
): number {
  if (!krs.length) return 0
  return clamp(krs.reduce((sum, kr) => sum + computeKrProgress(kr, tasks, statuses), 0) / krs.length)
}

export function objectiveTaskStats(
  krs: KeyResult[],
  tasks: Task[],
): { total: number; done: number } {
  const ids = new Set(krs.map((k) => k.id))
  const linked = tasks.filter((t) => t.okrLinks.some((l) => l.keyResultId && ids.has(l.keyResultId)))
  return { total: linked.length, done: linked.filter((t) => isTaskDone(t)).length }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}
