import type { Task } from './task'

export type WeekStartsOn = 0 | 1

export interface WeekGroup {
  key: string
  label: string
  start: string
  end: string
  tasks: Task[]
  unscheduled?: boolean
}

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function formatISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return formatISO(new Date())
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + days)
  return formatISO(d)
}

export function startOfWeek(iso: string, weekStartsOn: WeekStartsOn = 1): string {
  const d = parseLocalDate(iso)
  const diff = weekStartsOn === 1 ? (d.getDay() + 6) % 7 : d.getDay()
  d.setDate(d.getDate() - diff)
  return formatISO(d)
}

function formatWeekLabel(startISO: string, endISO: string): string {
  const s = parseLocalDate(startISO)
  const e = parseLocalDate(endISO)
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  if (sameMonth) {
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 - ${e.getDate()}日`
  }
  if (sameYear) {
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`
  }
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 - ${e.getFullYear()}年${e.getMonth() + 1}月${e.getDate()}日`
}

export function getWeekRange(
  iso: string,
  weekStartsOn: WeekStartsOn = 1,
): { key: string; start: string; end: string; label: string } {
  const start = startOfWeek(iso, weekStartsOn)
  const end = addDaysISO(start, 6)
  return { key: start, start, end, label: formatWeekLabel(start, end) }
}

export function isoWeekKey(iso: string): string {
  const target = parseLocalDate(iso)
  const dayNr = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const weekYear = target.getFullYear()
  const firstThursday = new Date(weekYear, 0, 4)
  const firstDayNr = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000)
  return `${weekYear}-W${String(week).padStart(2, '0')}`
}

export function groupTasksByWeek(
  tasks: Task[],
  opts: { repeatSpanning: boolean; weekStartsOn: WeekStartsOn } = {
    repeatSpanning: true,
    weekStartsOn: 1,
  },
): WeekGroup[] {
  const map = new Map<string, WeekGroup>()
  const unscheduled: Task[] = []

  const push = (iso: string, task: Task) => {
    const range = getWeekRange(iso, opts.weekStartsOn)
    const group =
      map.get(range.key) ??
      ({
        key: range.key,
        label: range.label,
        start: range.start,
        end: range.end,
        tasks: [],
      } satisfies WeekGroup)
    if (!group.tasks.some((t) => t.id === task.id)) group.tasks.push(task)
    map.set(range.key, group)
  }

  for (const task of tasks) {
    const start = task.dueStart ?? task.dueEnd
    const end = task.dueEnd ?? task.dueStart
    if (!start || !end) {
      unscheduled.push(task)
      continue
    }
    if (opts.repeatSpanning) {
      let cursor = startOfWeek(start, opts.weekStartsOn)
      const last = startOfWeek(end, opts.weekStartsOn)
      let guard = 0
      while (cursor <= last && guard < 520) {
        push(cursor, task)
        cursor = addDaysISO(cursor, 7)
        guard++
      }
    } else {
      push(end, task)
    }
  }

  const groups = [...map.values()].sort((a, b) => b.start.localeCompare(a.start))
  if (unscheduled.length) {
    groups.push({
      key: 'unscheduled',
      label: '未排期',
      start: '9999-12-31',
      end: '9999-12-31',
      tasks: unscheduled,
      unscheduled: true,
    })
  }
  return groups
}

export function dateRangeLabel(start: string | null, end: string | null): string {
  if (!start && !end) return '未排期'
  if (start && end && start !== end) return `${start} → ${end}`
  return end ?? start ?? '未排期'
}
