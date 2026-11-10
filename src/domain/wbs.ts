import type { Task, StatusDefinition, Workload } from './task'
import { DEFAULT_STATUSES, isOverdue, statusOf } from './task'

export interface WbsStats {
  total: number
  done: number
  overdue: number
  workload: Record<Workload, number>
}

export interface WbsProcess {
  name: string
  tasks: Task[]
  start: string | null
  end: string | null
  stats: WbsStats
}

export interface WbsGroup {
  phase: string
  processes: WbsProcess[]
  start: string | null
  end: string | null
  stats: WbsStats
}

function emptyStats(): WbsStats {
  return { total: 0, done: 0, overdue: 0, workload: { 大: 0, 中: 0, 小: 0 } }
}

function addStats(target: WbsStats, task: Task, statuses: StatusDefinition[]): void {
  target.total++
  if (statusOf(task.statusId, statuses).category === 'done') target.done++
  if (isOverdue(task, statuses)) target.overdue++
  target.workload[task.workload]++
}

function taskStart(task: Task): string | null {
  return task.dueStart ?? task.dueEnd ?? null
}

function taskEnd(task: Task): string | null {
  return task.dueEnd ?? task.dueStart ?? null
}

function rangeOf(tasks: Task[]): { start: string | null; end: string | null } {
  const starts = tasks.map(taskStart).filter(Boolean) as string[]
  const ends = tasks.map(taskEnd).filter(Boolean) as string[]
  return {
    start: starts.length ? starts.sort()[0] : null,
    end: ends.length ? ends.sort()[ends.length - 1] : null,
  }
}

export function buildWbs(
  tasks: Task[],
  statuses: StatusDefinition[] = DEFAULT_STATUSES,
  opts: { includeCancelled?: boolean; today?: string } = {},
): WbsGroup[] {
  const visible = tasks.filter((t) => {
    if (opts.includeCancelled) return true
    return statusOf(t.statusId, statuses).category !== 'cancelled'
  })

  const phaseMap = new Map<string, Map<string, Task[]>>()
  for (const task of visible) {
    const phase = task.phase?.trim() || '未分组阶段'
    const process = task.process?.trim() || '未分组流程'
    if (!phaseMap.has(phase)) phaseMap.set(phase, new Map())
    const processMap = phaseMap.get(phase)!
    if (!processMap.has(process)) processMap.set(process, [])
    processMap.get(process)!.push(task)
  }

  const groups: WbsGroup[] = []
  for (const [phase, processMap] of phaseMap) {
    const processes: WbsProcess[] = []
    const all: Task[] = []
    for (const [name, list] of processMap) {
      const sorted = [...list].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        const sa = taskStart(a) ?? '9999-12-31'
        const sb = taskStart(b) ?? '9999-12-31'
        if (sa !== sb) return sa.localeCompare(sb)
        return a.createdAt.localeCompare(b.createdAt)
      })
      const stats = emptyStats()
      sorted.forEach((t) => addStats(stats, t, statuses))
      const range = rangeOf(sorted)
      processes.push({ name, tasks: sorted, start: range.start, end: range.end, stats })
      all.push(...sorted)
    }
    processes.sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'))
    const stats = emptyStats()
    all.forEach((t) => addStats(stats, t, statuses))
    const range = rangeOf(all)
    groups.push({ phase, processes, start: range.start, end: range.end, stats })
  }

  return groups.sort((a, b) => {
    const sa = a.start ?? '9999-12-31'
    const sb = b.start ?? '9999-12-31'
    if (sa !== sb) return sa.localeCompare(sb)
    return a.phase.localeCompare(b.phase)
  })
}

export function wbsRows(groups: WbsGroup[]): Array<{
  phase: string
  process: string
  task: Task
  processStart: number
}> {
  const rows: Array<{ phase: string; process: string; task: Task; processStart: number }> = []
  for (const group of groups) {
    for (const proc of group.processes) {
      proc.tasks.forEach((task, index) => {
        rows.push({
          phase: group.phase,
          process: proc.name,
          task,
          processStart: index === 0 ? 1 : 0,
        })
      })
    }
  }
  return rows
}
