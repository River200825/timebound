import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { reminderRepo, type ReminderLogRecord } from '@/data/db'
import {
  buildUpcoming,
  dueUpcoming,
  reminderText,
  requestNotificationPermission,
  sendBrowserNotification,
  sendWecom,
  testWecom,
  type UpcomingItem,
} from '@/services/reminder'
import { useToast } from '@/composables/toast'
import { useSettingsStore } from './settings'
import { useTaskStore } from './tasks'

export const useReminderStore = defineStore('reminders', () => {
  const settingsStore = useSettingsStore()
  const taskStore = useTaskStore()
  const toast = useToast()

  const logs = ref<ReminderLogRecord[]>([])
  const upcoming = ref<UpcomingItem[]>([])
  const missed = ref<UpcomingItem[]>([])
  const permission = ref<NotificationPermission>('default')
  const snoozed = ref<Record<string, number>>({})
  const ticking = ref(false)

  let timer: number | undefined

  const upcomingCount = computed(() => upcoming.value.length)
  const missedCount = computed(() => missed.value.length)

  async function loadLogs() {
    logs.value = await reminderRepo.recent(50)
  }

  function refresh() {
    const now = new Date()
    const all = buildUpcoming(
      taskStore.tasks,
      settingsStore.statuses,
      settingsStore.settings,
      now,
    )
    const logged = new Set(logs.value.map((log) => log.id))
    upcoming.value = all.filter((item) => {
      const occ = item.occurrence
      if (logged.has(occ.id)) return false
      if (item.quietUntil && item.quietUntil.getTime() > now.getTime()) return false
      const snoozeAt = snoozed.value[occ.id]
      if (snoozeAt && snoozeAt > now.getTime()) return false
      return true
    })
    missed.value = all.filter(
      (item) => item.occurrence.fireAt < now.getTime() && !logged.has(item.occurrence.id),
    )
  }

  async function tick() {
    if (ticking.value) return
    ticking.value = true
    try {
      refresh()
      const due = dueUpcoming(
        upcoming.value.filter((item) => {
          const snoozeAt = snoozed.value[item.occurrence.id]
          return !snoozeAt || snoozeAt <= Date.now()
        }),
        new Date(),
      )
      for (const item of due) {
        const occ = item.occurrence
        if (await reminderRepo.has(occ.id)) continue
        const text = reminderText(item.task, occ, settingsStore.statuses)
        const channels: string[] = []

        if (settingsStore.settings.reminder.inApp) {
          toast.push(`${occ.label}｜${item.task.title}`, 'info', 6000)
          channels.push('in-app')
        }
        if (settingsStore.settings.reminder.browser) {
          const sent = await sendBrowserNotification(`截止提醒 · ${item.task.title}`, text)
          channels.push(sent ? 'browser' : 'browser-denied')
        }
        if (settingsStore.settings.reminder.wecom && settingsStore.settings.reminder.wecomWebhook) {
          const result = await sendWecom(settingsStore.settings.reminder.wecomWebhook, text)
          channels.push(`wecom-${result}`)
        }

        await reminderRepo.log({
          id: occ.id,
          taskId: item.task.id,
          offsetMinutes: occ.offsetMinutes,
          dueEndVersion: occ.dueEndVersion,
          sentAt: Date.now(),
          channel: channels.join(',') || 'none',
          result: channels.some((c) => c.includes('failed')) ? 'failed' : 'sent',
        })
        delete snoozed.value[occ.id]
      }
      await loadLogs()
      refresh()
    } finally {
      ticking.value = false
    }
  }

  async function start() {
    if (timer) return
    await loadLogs()
    if ('Notification' in window) permission.value = Notification.permission
    refresh()
    timer = window.setInterval(() => void tick(), 30_000)
    await tick()
  }

  function stop() {
    if (timer) window.clearInterval(timer)
    timer = undefined
  }

  async function askPermission() {
    permission.value = await requestNotificationPermission()
    return permission.value
  }

  function snooze(item: UpcomingItem, minutes: number) {
    snoozed.value[item.occurrence.id] = Date.now() + minutes * 60_000
    upcoming.value = upcoming.value.filter((x) => x.occurrence.id !== item.occurrence.id)
    toast.push(`已稍后 ${minutes >= 60 ? `${minutes / 60} 小时` : `${minutes} 分钟`}提醒`, 'info')
  }

  async function markDone(item: UpcomingItem) {
    await taskStore.update(item.task.id, { statusId: 'done' })
    upcoming.value = upcoming.value.filter((x) => x.task.id !== item.task.id)
    missed.value = missed.value.filter((x) => x.task.id !== item.task.id)
    toast.push('任务已完成，后续提醒已停止', 'success')
  }

  async function testWecomConfig() {
    return testWecom(settingsStore.settings.reminder.wecomWebhook)
  }

  return {
    logs,
    upcoming,
    missed,
    permission,
    upcomingCount,
    missedCount,
    refresh,
    tick,
    start,
    stop,
    askPermission,
    snooze,
    markDone,
    testWecomConfig,
  }
})
