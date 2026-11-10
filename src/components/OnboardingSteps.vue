<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/toast'
import IconTasks from '@/components/icons/IconTasks.vue'
import IconAi from '@/components/icons/IconAi.vue'
import IconBell from '@/components/icons/IconBell.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ finish: [] }>()

const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

const step = ref(1)

const steps = [
  { title: '第一步：建立第一条任务', body: '在任务表中新建一条工作，设置截止日期、重要/紧急/工作量，系统会自动算出优先级 S/A/B+/B/B-/C。' },
  { title: '第二步：连接 AI 助手', body: '前往「AI 助手」页，用自然语言、截图或文件录入任务，AI 会自动识别并补齐字段，优先级由系统统一计算。' },
  { title: '第三步：设置提醒', body: '前往「设置」页配置提醒通道（应用内/浏览器/企业微信）与免打扰时段，截止前 1 天 / 1 小时 / 15 分钟自动提醒。' },
]

function nextStep() {
  if (step.value < 3) {
    step.value++
  } else {
    finish()
  }
}

function finish() {
  settingsStore.update({ onboardingDone: true })
  emit('finish')
  toast.push('引导完成，随时可在设置中重新播放', 'info')
}

function skip() {
  finish()
}

function go(path: string) {
  skip()
  void router.push(path)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="onboard-mask" @click.self="skip">
      <div class="onboard" role="dialog" aria-modal="true">
        <header class="onboard-head">
          <div class="brand">
            <span class="mark">✓</span>
            <div class="name">timebound</div>
          </div>
          <button class="btn-ghost skip" aria-label="跳过引导" @click="skip">跳过</button>
        </header>

        <div class="onboard-body">
          <div class="progress">
            <span v-for="i in 3" :key="i" :class="`dot ${i <= step ? 'on' : 'off'}`"></span>
          </div>
          <h2 class="step-title">{{ steps[step - 1].title }}</h2>
          <p class="step-body">{{ steps[step - 1].body }}</p>

          <div class="step-visual" :class="`step-${step}`">
            <span class="num">{{ step }}</span>
            <IconTasks v-if="step === 1" :size="26" />
            <IconAi v-else-if="step === 2" :size="26" />
            <IconBell v-else :size="26" />
          </div>
        </div>

        <footer class="onboard-foot">
          <button class="btn-ghost" v-if="step < 3" @click="nextStep">下一步</button>
          <button class="btn-outline" v-if="step > 1" @click="step--">上一步</button>
          <button v-if="step === 1" class="btn-primary" @click="go('/tasks?new=1')">去新建任务</button>
          <button v-if="step === 2" class="btn-primary" @click="go('/ai')">去连接 AI</button>
          <button v-if="step === 3" class="btn-primary" @click="go('/settings')">去设置提醒</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.onboard-mask {
  position: fixed;
  inset: 0;
  background: rgba(31, 35, 40, 0.32);
  display: grid;
  place-items: center;
  z-index: 120;
  padding: 24px;
}
.onboard {
  width: 100%;
  max-width: 560px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.onboard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  gap: 10px;
  align-items: center;
}
.mark {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-weight: 800;
}
.name {
  font-weight: 700;
  font-size: 15px;
}
.skip {
  font-size: 12.5px;
  color: var(--text-muted);
  padding: 4px 10px;
}
.onboard-body {
  padding: 26px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.progress {
  display: flex;
  gap: 6px;
  align-items: center;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}
.dot.on {
  background: var(--brand);
}
.step-title {
  margin: 6px 0 4px;
  font-size: 16px;
  color: var(--text);
}
.step-body {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.6;
}
.step-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--brand) 40%, transparent);
}
.num {
  font-size: 13px;
  font-weight: 700;
  color: var(--brand);
}
.icon {
  font-size: 24px;
}
.onboard-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
</style>
