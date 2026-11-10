<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useReminderStore } from '@/stores/reminders'
import { useToast } from '@/composables/toast'
import OnboardingSteps from '@/components/OnboardingSteps.vue'
import IconTasks from '@/components/icons/IconTasks.vue'
import IconWbs from '@/components/icons/IconWbs.vue'
import IconOkr from '@/components/icons/IconOkr.vue'
import IconAi from '@/components/icons/IconAi.vue'
import IconBell from '@/components/icons/IconBell.vue'
import IconSettings from '@/components/icons/IconSettings.vue'
import IconProjects from '@/components/icons/IconProjects.vue'
import { useProjectStore } from '@/stores/projects'
import type { Component } from 'vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const reminderStore = useReminderStore()
const toast = useToast()

const online = ref(navigator.onLine)
const mobileNav = ref(false)
const onboardingOpen = ref(!settingsStore.settings.onboardingDone)
const projectStore = useProjectStore()

interface NavItem {
  to: string
  label: string
  icon: Component
  badge?: { value: number }
}
const navs: NavItem[] = [
  { to: '/tasks', label: '任务表', icon: IconTasks },
  { to: '/projects', label: '项目', icon: IconProjects },
  { to: '/wbs', label: 'WBS 时间轴', icon: IconWbs },
  { to: '/okr', label: 'OKR', icon: IconOkr },
  { to: '/ai', label: 'AI 助手', icon: IconAi },
  { to: '/reminders', label: '提醒', icon: IconBell, badge: computed(() => reminderStore.missedCount) },
  { to: '/settings', label: '设置', icon: IconSettings },
]

function onOnline() {
  online.value = navigator.onLine
}

watch(
  () => settingsStore.settings.onboardingDone,
  (done) => {
    onboardingOpen.value = !done
  },
)

function onKeydown(event: KeyboardEvent) {
  // 忽略在输入框/选择框中按键
  const target = event.target as HTMLElement
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  const isSelect = target.tagName === 'SELECT'
  if (isInput || isSelect) return

  const key = event.key.toLowerCase()
  if (key === 'n') {
    event.preventDefault()
    void router.push('/tasks?new=1')
  } else if (key === '/') {
    event.preventDefault()
    void router.push('/tasks?search=1')
  } else if (key === 'escape') {
    mobileNav.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOnline)
  window.addEventListener('keydown', onKeydown)
  void reminderStore.start()
  void projectStore.load()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOnline)
  window.removeEventListener('keydown', onKeydown)
  reminderStore.stop()
})
</script>

<template>
  <div class="app-shell">
    <aside class="rail" :class="{ open: mobileNav }">
      <div class="rail-brand" title="timebound"><span class="rail-check">✓</span></div>

      <nav class="rail-nav">
        <RouterLink
          v-for="nav in navs"
          :key="nav.to"
          :to="nav.to"
          class="rail-item"
          :class="{ active: route.path === nav.to }"
          @click="mobileNav = false"
        >
          <span class="rail-icon"><component :is="nav.icon" /></span>
          <span class="rail-label">{{ nav.label }}</span>
          <span v-if="nav.badge && nav.badge.value > 0" class="nav-badge">{{ nav.badge.value }}</span>
        </RouterLink>
      </nav>

      <div class="rail-foot">
        <button class="rail-theme-btn" @click="settingsStore.toggleTheme()" :title="settingsStore.settings.theme === 'dark' ? '切换浅色模式' : '切换深色模式'">
          {{ settingsStore.settings.theme === 'dark' ? '☀' : '☾' }}
        </button>
        <div class="rail-note">本地存储</div>
      </div>
    </aside>

    <div v-if="mobileNav" class="nav-mask" @click="mobileNav = false" />

    <main class="main">
      <header class="topbar">
        <button class="btn-ghost menu-btn" aria-label="打开导航" @click="mobileNav = !mobileNav">
          <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M4 7h14M4 12h14M4 17h14" />
          </svg>
        </button>
        <div class="topbar-title">{{ navs.find((n) => n.to === route.path)?.label ?? 'timebound' }}</div>
        <div class="topbar-right">
          <span v-if="!online" class="offline-chip">离线模式</span>
          <RouterLink to="/tasks" class="btn-primary">+ 新建</RouterLink>
        </div>
      </header>

      <div v-if="!online" class="offline-banner">当前离线：任务仍会保存在本地，AI 与企业微信提醒暂不可用。</div>

      <section class="content">
        <RouterView />
      </section>
    </main>

    <div class="toasts" aria-live="polite">
      <div v-for="item in toast.items.value" :key="item.id" class="toast" :class="`toast-${item.type}`">
        {{ item.message }}
      </div>
    </div>

    <OnboardingSteps
      v-if="settingsStore.loaded"
      :open="onboardingOpen"
      @finish="onboardingOpen = false"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.rail {
  width: 60px;
  flex: 0 0 60px;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  padding: 10px 0 10px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 30;
}
.rail-brand {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px auto 8px;
}
.rail-check {
  color: #fff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}
.rail-nav {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1px;
  width: 100%;
  padding: 0;
}
.rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0 7px;
  border-radius: 0;
  color: var(--text-muted);
  font-size: 10px;
  text-decoration: none;
  border-left: 3px solid transparent;
  position: relative;
}
.rail-item:hover {
  background: rgba(36, 134, 255, 0.08);
  color: var(--brand);
}
.rail-item.active {
  background: var(--brand-bg);
  color: var(--brand);
  font-weight: 600;
  border-left-color: var(--brand);
}
.rail-icon {
  display: inline-flex;
}
.rail-icon :deep svg {
  width: 22px;
  height: 22px;
}
.rail-label {
  line-height: 1.1;
  white-space: nowrap;
  letter-spacing: -0.02em;
}
.rail-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
}
.rail-theme-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
}
.rail-theme-btn:hover {
  background: var(--brand-bg);
  color: var(--brand);
}
.rail-note {
  font-size: 10px;
  color: var(--text-muted);
  writing-mode: vertical-lr;
  letter-spacing: 1px;
}
.nav-badge {
  position: absolute;
  right: 3px;
  top: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 10px;
  display: grid;
  place-items: center;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: 44px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 20;
}
.topbar-title {
  font-weight: 600;
}
.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.menu-btn {
  display: none;
}
.offline-chip {
  font-size: 12px;
  color: var(--p-a);
  background: var(--p-a-bg);
  padding: 3px 8px;
  border-radius: 999px;
}
.offline-banner {
  background: var(--p-a-bg);
  color: var(--p-a);
  padding: 7px 20px;
  font-size: 12.5px;
}

.content {
  padding: 18px 20px 60px;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
}

.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
}
.toast {
  min-width: 220px;
  max-width: 380px;
  padding: 10px 14px;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px;
}
.toast-success {
  border-left: 3px solid var(--p-b);
}
.toast-error {
  border-left: 3px solid var(--danger);
}
.toast-info {
  border-left: 3px solid var(--brand);
}

.nav-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 39;
}

.small {
  font-size: 11.5px;
}
.muted {
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .rail {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 0.18s ease;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  }
  .rail.open {
    transform: translateX(0);
  }
  .menu-btn {
    display: inline-flex;
  }
  .content {
    padding: 12px 12px 50px;
  }
}
</style>
