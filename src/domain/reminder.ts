import type { Task } from './task'
import { parseLocalDate, formatISO } from './date'

export interface ReminderOccurrence {
  id: string
  taskId: string
  offsetMinutes: number
  fireAt: number
  dueAt: number
  dueEndVersion: string
  label: string
}

export interface QuietConfig {
  enabled: boolean
  start: string
  end: string
}

export function dueDateTime(task: Task, dueTime = '18:00'): Date | null {
  if (!task.dueEnd) return null
  const [h, m] = dueTime.split(':').map(Number)
  const d = parseLocalDate(task.dueEnd)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

export function dueEndVersion(task: Task, dueTime = '18:00'): string {
  return `${task.dueEnd ?? ''}@${dueTime}`
}

export function offsetLabel(offsetMinutes: number): string {
  if (offsetMinutes % 1440 === 0) return `${offsetMinutes / 1440} 天前`
  if (offsetMinutes % 60 === 0) return `${offsetMinutes / 60} 小时前`
  return `${offsetMinutes} 分钟前`
}

export function computeOccurrences(
  task: Task,
  defaultOffsets: number[] = [1440, 60, 15],
  dueTime = '18:00',
): ReminderOccurrence[] {
  const due = dueDateTime(task, dueTime)
  if (!due) return []
  const offsets = task.reminderOffsets?.length ? task.reminderOffsets : defaultOffsets
  const version = dueEndVersion(task, dueTime)
  return offsets
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((offset) => ({
      id: `${task.id}:${offset}:${version}`,
      taskId: task.id,
      offsetMinutes: offset,
      dueAt: due.getTime(),
      fireAt: due.getTime() - offset * 60_000,
      dueEndVersion: version,
      label: offsetLabel(offset),
    }))
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function isQuietHour(at: Date, quiet: QuietConfig): boolean {
  if (!quiet.enabled) return false
  const cur = minutesOfDay(at)
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  if (start === end) return false
  if (start < end) return cur >= start && cur < end
  return cur >= start || cur < end
}

export function nextQuietEnd(at: Date, quiet: QuietConfig): Date {
  if (!isQuietHour(at, quiet)) return at
  const end = toMinutes(quiet.end)
  const result = new Date(at)
  result.setHours(Math.floor(end / 60), end % 60, 0, 0)
  if (result.getTime() <= at.getTime()) result.setDate(result.getDate() + 1)
  return result
}

export function formatRemaining(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.floor(abs / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${mins} 分钟`
  return `${mins} 分钟`
}

export function todayWeekKey(date = new Date()): string {
  return formatISO(date)
}
