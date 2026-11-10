<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useReminderStore } from '@/stores/reminders'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/tasks'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/toast'
import { formatRemaining } from '@/domain/reminder'
import IconEmpty from '@/components/icons/IconEmpty.vue'
import IconBell from '@/components/icons/IconBell.vue'
import IconTasks from '@/components/icons/IconTasks.vue'

const reminderStore = useReminderStore()
const settingsStore = useSettingsStore()
const taskStore = useTaskStore()
const router = useRouter()
const toast = useToast()

const activeTab = ref<'upcoming' | 'missed' | 'logs'>('upcoming')
const showPermissionBanner = ref(false)

const hasUnread = computed(() => reminderStore.upcomingCount > 0 || reminderStore.missedCount > 0)

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })
}

async function onMount() {
  await reminderStore.start()
  if (reminderStore.permission === 'default') showPermissionBanner.value = true
}

async function askPermission() {
  const p = await reminderStore.askPermission()
  showPermissionBanner.value = p !== 'granted'
}

async function openSettings() {
  await router.push('/settings')
}

async function viewTask(item: Parameters<(typeof reminderStore)['markDone']>[0]) {
  await router.push('/tasks')
  toast.push(`查看任务：${item.task.title}`, 'info')
}

async function snooze10(item: Parameters<(typeof reminderStore)['snooze']>[0]) {
  reminderStore.snooze(item, 10)
}

async function snooze60(item: Parameters<(typeof reminderStore)['snooze']>[0]) {
  reminderStore.snooze(item, 60)
}

async function done(item: Parameters<(typeof reminderStore)['markDone']>[0]) {
  await reminderStore.markDone(item)
  toast.push('已完成，后续提醒停止', 'success')
}

async function testWecom() {
  try {
    const result = await reminderStore.testWecomConfig()
    const map: Record<string, string> = { sent: '发送成功', unknown: '已发送（结果未知，可能因 CORS 受限）', failed: '发送失败' }
    toast.push(`企微测试：${map[result] ?? result}`, result === 'failed' ? 'error' : 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '测试失败', 'error')
  }
}

onMounted(onMount)
onBeforeUnmount(() => reminderStore.stop())
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading">提醒</div>
          <button class="subcol-item" :class="{ active: activeTab === 'upcoming' }" @click="activeTab = 'upcoming'">
            即将提醒<span class="count">{{ reminderStore.upcomingCount }}</span>
          </button>
          <button class="subcol-item" :class="{ active: activeTab === 'missed' }" @click="activeTab = 'missed'">
            已错过<span class="count">{{ reminderStore.missedCount }}</span>
          </button>
          <button class="subcol-item" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">
            发送日志<span class="count">{{ reminderStore.logs.length }}</span>
          </button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">通道</div>
          <div class="subcol-item disabled"><span>应用内提醒</span></div>
          <div class="subcol-item disabled"><span>浏览器通知</span></div>
          <div class="subcol-item disabled"><span>企业微信</span></div>
          <button class="subcol-item" @click="openSettings">修改通道设置</button>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>提醒中心</h1>
        <p class="muted">查看即将到期、已错过的提醒，并管理发送日志与通知权限。</p>
      </div>
      <div class="head-actions">
        <button class="btn-outline" @click="askPermission" :disabled="reminderStore.permission === 'granted'">
          {{ reminderStore.permission === 'granted' ? '通知已开启' : '开启系统通知' }}
        </button>
        <button class="btn-primary" @click="openSettings">提醒设置</button>
      </div>
    </header>

    <div v-if="showPermissionBanner && reminderStore.permission !== 'granted'" class="perm-banner card">
      <span class="muted banner-icon"><IconBell :size="16" /></span>
      <span>为收到截止前 1 天 / 1 小时 / 15 分钟提醒，请开启浏览器通知。免打扰时段内提醒会顺延。</span>
      <button class="btn-primary" style="margin-left:auto" @click="askPermission">立即开启</button>
    </div>

    <!-- 即将提醒 -->
    <section v-if="activeTab === 'upcoming'">
      <div v-if="!reminderStore.upcoming.length" class="empty card">
        <div class="empty-icon"><IconBell :size="22" /></div>
        <h3>暂无即将到期的提醒</h3>
        <p class="muted">设置截止日期的任务会在此自动出现提醒。</p>
      </div>
      <div v-else class="item-list">
        <div v-for="item in reminderStore.upcoming" :key="item.occurrence.id" class="item-card card">
          <div class="item-head">
            <div class="item-title">
              <strong>{{ item.task.title }}</strong>
              <span v-if="item.quietUntil" class="quiet-tag">免打扰顺延</span>
            </div>
            <div class="item-time">
              <div class="time-big">{{ formatTime(item.occurrence.fireAt) }}</div>
              <div class="time-small">{{ formatDate(item.occurrence.fireAt) }} · 剩余 {{ formatRemaining(item.occurrence.dueAt - Date.now()) }}</div>
            </div>
          </div>
          <div class="item-meta muted">
            截止 {{ item.task.dueEnd ?? item.task.dueStart ?? '未设置' }} · 优先级 {{ item.task.priority }}
          </div>
          <div class="item-actions">
            <button class="btn-ghost" @click="done(item)">完成</button>
            <button class="btn-ghost" @click="snooze10(item)">稍后 10 分钟</button>
            <button class="btn-ghost" @click="snooze60(item)">稍后 1 小时</button>
            <button class="btn-ghost" @click="viewTask(item)">查看任务</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 已错过 -->
    <section v-if="activeTab === 'missed'">
      <div v-if="!reminderStore.missed.length" class="empty card">
        <div class="empty-icon"><IconTasks :size="22" /></div>
        <h3>暂无已错过的提醒</h3>
        <p class="muted">错过的提醒会在此保留，供你查看与补办。</p>
      </div>
      <div v-else class="item-list">
        <div v-for="item in reminderStore.missed" :key="item.occurrence.id" class="item-card card missed">
          <div class="item-head">
            <div class="item-title">
              <strong>{{ item.task.title }}</strong>
              <span class="missed-tag">已错过</span>
            </div>
            <div class="item-time">
              <div class="time-big" style="color: var(--danger)">{{ formatTime(item.occurrence.fireAt) }}</div>
              <div class="time-small">{{ formatDate(item.occurrence.fireAt) }} · 已过 {{ formatRemaining(Date.now() - item.occurrence.fireAt) }}</div>
            </div>
          </div>
          <div class="item-meta muted">
            截止 {{ item.task.dueEnd ?? item.task.dueStart ?? '未设置' }} · 优先级 {{ item.task.priority }}
          </div>
          <div class="item-actions">
            <button class="btn-ghost" @click="done(item)">标记完成</button>
            <button class="btn-ghost" @click="viewTask(item)">查看任务</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 发送日志 -->
    <section v-if="activeTab === 'logs'">
      <div v-if="!reminderStore.logs.length" class="empty card">
        <div class="empty-icon"><IconEmpty :size="22" /></div>
        <h3>暂无发送日志</h3>
        <p class="muted">提醒发送后会在此记录时间、任务、通道与结果。</p>
      </div>
      <div v-else class="log-table card">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>任务</th>
              <th>提前量</th>
              <th>通道</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in reminderStore.logs" :key="log.id">
              <td>{{ new Date(log.sentAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</td>
              <td class="log-task">{{ log.taskId }}</td>
              <td class="muted">{{ log.offsetMinutes }} 分钟前</td>
              <td class="muted">{{ log.channel || '—' }}</td>
              <td>
                <span :class="`badge badge-${log.result}`">{{ log.result === 'sent' ? '已送达' : log.result === 'failed' ? '发送失败' : '结果未知' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.banner-icon {
  display: inline-flex;
  flex: 0 0 auto;
}
.perm-banner {
  display: flex;
  gap: 10px;
  align-items: center;
  background: color-mix(in srgb, var(--p-a) 12%, transparent);
  border: 1px solid var(--p-a);
  color: var(--p-a);
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 14px;
  font-size: 12.5px;
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.item-card.missed {
  border-left: 3px solid var(--danger);
  background: color-mix(in srgb, var(--danger) 6%, var(--surface));
}
.item-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.item-title {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.item-title strong {
  font-size: 14px;
  color: var(--text);
}
.item-title .missed-tag,
.item-title .quiet-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
  white-space: nowrap;
}
.item-title .missed-tag {
  background: var(--p-s-bg);
  color: var(--p-s);
}
.item-title .quiet-tag {
  background: var(--p-c-bg);
  color: var(--p-c);
}
.item-time {
  text-align: right;
  flex: 0 0 auto;
}
.item-time .time-big {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.item-time .time-small {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 2px;
}
.item-meta {
  font-size: 12px;
}
.item-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.log-table {
  overflow-x: auto;
}
.log-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.log-table th {
  text-align: left;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  white-space: nowrap;
}
.log-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.log-table tr:hover {
  background: color-mix(in srgb, var(--text) 3%, transparent);
}
.log-task {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.badge {
  display: inline-block;
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: 600;
}
.badge-sent { background: var(--p-b-bg); color: var(--p-b); }
.badge-failed { background: var(--p-s-bg); color: var(--p-s); }
.badge-unknown { background: var(--p-c-bg); color: var(--p-c); }
@media (max-width: 720px) {
  .item-actions {
    flex-direction: column;
  }
  .item-actions button {
    width: 100%;
    text-align: left;
  }
  .item-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .item-time {
    text-align: left;
    margin-top: 6px;
  }
}
</style>
