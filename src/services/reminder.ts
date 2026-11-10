import type { AppSettings } from '@/domain/settings'
import type { StatusDefinition, Task } from '@/domain/task'
import { statusOf, stopsReminder } from '@/domain/task'
import {
  computeOccurrences,
  formatRemaining,
  isQuietHour,
  nextQuietEnd,
  type ReminderOccurrence,
} from '@/domain/reminder'

export interface UpcomingItem {
  occurrence: ReminderOccurrence
  task: Task
  quietUntil?: Date
}

export function activeTasks(
  tasks: Task[],
  statuses: StatusDefinition[],
): Task[] {
  return tasks.filter((task) => !stopsReminder(task, statuses))
}

export function buildUpcoming(
  tasks: Task[],
  statuses: StatusDefinition[],
  settings: AppSettings,
  now = new Date(),
  horizonMs = 7 * 24 * 60 * 60 * 1000,
): UpcomingItem[] {
  const items: UpcomingItem[] = []
  for (const task of activeTasks(tasks, statuses)) {
    for (const occurrence of computeOccurrences(
      task,
      settings.reminder.offsets,
      settings.reminder.defaultDueTime,
    )) {
      if (occurrence.fireAt > now.getTime() + horizonMs) continue
      if (occurrence.fireAt < now.getTime() - 7 * 24 * 60 * 60 * 1000) continue
      const quiet =
        settings.reminder.quietEnabled && isQuietHour(new Date(occurrence.fireAt), {
          enabled: settings.reminder.quietEnabled,
          start: settings.reminder.quietStart,
          end: settings.reminder.quietEnd,
        })
          ? nextQuietEnd(new Date(occurrence.fireAt), {
              enabled: settings.reminder.quietEnabled,
              start: settings.reminder.quietStart,
              end: settings.reminder.quietEnd,
            })
          : undefined
      items.push({ occurrence, task, quietUntil: quiet })
    }
  }
  return items.sort((a, b) => a.occurrence.fireAt - b.occurrence.fireAt)
}

export function dueUpcoming(items: UpcomingItem[], now = new Date()): UpcomingItem[] {
  return items.filter((item) => {
    const target = item.quietUntil ? item.quietUntil.getTime() : item.occurrence.fireAt
    return target <= now.getTime()
  })
}

export function reminderText(task: Task, occurrence: ReminderOccurrence, statuses?: StatusDefinition[]): string {
  const status = statuses ? statusOf(task.statusId, statuses).name : ''
  const due = task.dueEnd ?? task.dueStart ?? '未设置'
  const remaining = formatRemaining(occurrence.dueAt - Date.now())
  return [
    `【timebound 提醒】${occurrence.label}`,
    `任务：${task.title}`,
    `截止：${due}`,
    `优先级：${task.priority}${status ? ` · ${status}` : ''}`,
    `剩余：${remaining}`,
  ].join('\n')
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export async function sendBrowserNotification(title: string, body: string): Promise<boolean> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { body, tag: title, icon: '/icons/icon-192.svg' })
    } else {
      new Notification(title, { body, icon: '/icons/icon-192.svg' })
    }
    return true
  } catch {
    return false
  }
}

export async function sendWecom(
  webhook: string,
  text: string,
): Promise<'sent' | 'unknown' | 'failed'> {
  if (!webhook.trim()) return 'failed'
  const body = JSON.stringify({ msgtype: 'text', text: { content: text } })
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!response.ok) return 'failed'
    const json = (await response.json().catch(() => null)) as { errcode?: number } | null
    if (json && typeof json.errcode === 'number' && json.errcode !== 0) return 'failed'
    return 'sent'
  } catch {
    try {
      await fetch(webhook, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body,
      })
      return 'unknown'
    } catch {
      return 'failed'
    }
  }
}

export async function testWecom(webhook: string): Promise<'sent' | 'unknown' | 'failed'> {
  return sendWecom(webhook, '【timebound】企业微信提醒配置测试成功。')
}
