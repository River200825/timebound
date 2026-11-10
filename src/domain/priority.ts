import type { Importance, Priority } from './task'

export const PRIORITY_MATRIX: Record<string, Priority> = {
  '高|高': 'S',
  '高|中': 'A',
  '高|低': 'B',
  '中|高': 'B+',
  '中|中': 'B',
  '中|低': 'B-',
  '低|高': 'B+',
  '低|中': 'B',
  '低|低': 'C',
}

export const PRIORITY_ORDER: Priority[] = ['S', 'A', 'B+', 'B', 'B-', 'C']

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; bg: string; className: string; rank: number }
> = {
  S: { label: '最高', color: 'var(--p-s)', bg: 'var(--p-s-bg)', className: 'priority-s', rank: 0 },
  A: { label: '很高', color: 'var(--p-a)', bg: 'var(--p-a-bg)', className: 'priority-a', rank: 1 },
  'B+': {
    label: '较高',
    color: 'var(--p-bp)',
    bg: 'var(--p-bp-bg)',
    className: 'priority-bp',
    rank: 2,
  },
  B: { label: '中等', color: 'var(--p-b)', bg: 'var(--p-b-bg)', className: 'priority-b', rank: 3 },
  'B-': {
    label: '较低',
    color: 'var(--p-bm)',
    bg: 'var(--p-bm-bg)',
    className: 'priority-bm',
    rank: 4,
  },
  C: { label: '低', color: 'var(--p-c)', bg: 'var(--p-c-bg)', className: 'priority-c', rank: 5 },
}

/** 严格复刻用户 Notion 公式，不做“优化”。 */
export function computePriority(importance: Importance, urgency: Importance): Priority {
  return PRIORITY_MATRIX[`${importance}|${urgency}`] ?? 'B'
}

export function resolvePriority(task: {
  importance: Importance
  urgency: Importance
  priorityOverride?: { value: Priority } | null
}): { value: Priority; isOverride: boolean } {
  if (task.priorityOverride) return { value: task.priorityOverride.value, isOverride: true }
  return { value: computePriority(task.importance, task.urgency), isOverride: false }
}

export function priorityRank(priority: Priority): number {
  return PRIORITY_META[priority]?.rank ?? 99
}

export function sortByPriority<T extends { priority: Priority; dueEnd: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const rank = priorityRank(a.priority) - priorityRank(b.priority)
    if (rank !== 0) return rank
    if (a.dueEnd && b.dueEnd) return a.dueEnd.localeCompare(b.dueEnd)
    if (a.dueEnd) return -1
    if (b.dueEnd) return 1
    return 0
  })
}
