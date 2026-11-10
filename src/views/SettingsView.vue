<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useReminderStore } from '@/stores/reminders'
import { useToast } from '@/composables/toast'
import type { AiSettings, CustomSkill } from '@/domain/settings'
import { AI_PRESETS } from '@/domain/settings'
import { BUILTIN_SKILLS, builtinSkillName } from '@/services/ai-skills'

const settingsStore = useSettingsStore()
const reminderStore = useReminderStore()
const toast = useToast()

const presets = AI_PRESETS
const activeSection = ref<'ai' | 'skills' | 'reminder' | 'general' | 'data' | 'about'>('ai')
const currentPreset = computed(() => presets.find((p) => p.id === presetSelect.value))

const presetSelect = ref<string>(settingsStore.settings.ai.preset)
const baseURL = ref(settingsStore.settings.ai.baseURL)
const apiKey = ref(settingsStore.settings.ai.apiKey)
const model = ref(settingsStore.settings.ai.model)
const temperature = ref(settingsStore.settings.ai.temperature)

const wecomWebhook = ref(settingsStore.settings.reminder.wecomWebhook)

function syncPreset() {
  const found = presets.find((p) => p.id === presetSelect.value)
  if (!found) return
  baseURL.value = found.baseURL
  model.value = found.model
  settingsStore.updateAi({ preset: found.id, baseURL: found.baseURL, model: found.model })
}

async function saveAi() {
  await settingsStore.updateAi({
    baseURL: baseURL.value,
    apiKey: apiKey.value,
    model: model.value,
    temperature: temperature.value,
  })
  toast.push('AI 配置已保存', 'success')
}

async function testAi() {
  try {
    const reply = await settingsStore.testAi()
    toast.push(`连接正常（${reply}）`, 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '连接失败', 'error')
  }
}

async function toggleBuiltinSkill(id: string, checked: boolean) {
  const skills = settingsStore.settings.skills
  await settingsStore.update({
    skills: { ...skills, builtin: { ...skills.builtin, [id]: checked } },
  })
  toast.push(checked ? `已启用「${builtinSkillName(id)}」` : `已关闭「${builtinSkillName(id)}」`, 'info')
}

const skillModal = ref<{ id: string | null; name: string; prompt: string } | null>(null)
const skillModalError = ref('')

function openSkillModal(skill?: CustomSkill) {
  skillModalError.value = ''
  skillModal.value = skill
    ? { id: skill.id, name: skill.name, prompt: skill.prompt }
    : { id: null, name: '', prompt: '' }
}

function closeSkillModal() {
  skillModal.value = null
  skillModalError.value = ''
}

async function saveCustomSkill() {
  const form = skillModal.value
  if (!form) return
  const name = form.name.trim()
  const prompt = form.prompt.trim()
  if (!name || !prompt) {
    skillModalError.value = '请填写技能名称和提示词'
    return
  }
  const skills = settingsStore.settings.skills
  const custom = [...skills.custom]
  if (form.id) {
    const index = custom.findIndex((s) => s.id === form.id)
    if (index >= 0) custom.splice(index, 1, { ...custom[index], name, prompt })
  } else {
    custom.push({ id: `cs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, prompt, createdAt: new Date().toISOString() })
  }
  await settingsStore.update({ skills: { ...skills, custom } })
  toast.push(form.id ? '技能已更新' : '技能已创建', 'success')
  closeSkillModal()
}

async function removeCustomSkill(id: string) {
  if (!confirm('删除这个自定义技能？只影响 AI 路由，不会删除历史任务。')) return
  const skills = settingsStore.settings.skills
  await settingsStore.update({ skills: { ...skills, custom: skills.custom.filter((s) => s.id !== id) } })
  toast.push('技能已删除', 'info')
}

async function clearKey() {
  apiKey.value = ''
  await settingsStore.updateAi({ apiKey: '' })
  toast.push('API Key 已清除', 'info')
}

async function saveReminder() {
  await settingsStore.updateReminder({
    defaultDueTime: settingsStore.settings.reminder.defaultDueTime,
    wecomWebhook: wecomWebhook.value,
  })
  toast.push('提醒设置已保存', 'success')
}

async function toggleChannel(key: 'browser' | 'inApp' | 'wecom', event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  await settingsStore.updateReminder({ [key]: checked } as never)
}

async function setQuiet(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  await settingsStore.updateReminder({ quietEnabled: checked })
}

async function setWeekStart(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  await settingsStore.update({ weekStartsOn: value as 0 | 1 })
}

async function setTheme(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  await settingsStore.update({ theme: value as 'light' | 'dark' })
}

async function replayOnboarding() {
  await settingsStore.update({ onboardingDone: false })
  toast.push('已重置，引导将重新弹出', 'info')
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

async function exportData() {
  await settingsStore.exportAll()
  toast.push('已导出备份 JSON', 'success')
}

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  try {
    await settingsStore.importAll(input.files[0], 'merge')
    toast.push('导入成功，数据已覆盖', 'success')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '导入失败', 'error')
  }
  input.value = ''
}

async function clearData() {
  if (!confirm('确定清空全部数据？此操作不可恢复，建议先导出备份。')) return
  await settingsStore.resetAll()
  toast.push('已清空全部数据', 'info')
}

function copyWebhook() {
  navigator.clipboard.writeText(wecomWebhook.value)
  toast.push('Webhook 地址已复制', 'success')
}
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading">设置</div>
          <button class="subcol-item" :class="{ active: activeSection === 'ai' }" @click="activeSection = 'ai'">AI 配置</button>
          <button class="subcol-item" :class="{ active: activeSection === 'skills' }" @click="activeSection = 'skills'">AI 技能</button>
          <button class="subcol-item" :class="{ active: activeSection === 'reminder' }" @click="activeSection = 'reminder'">提醒设置</button>
          <button class="subcol-item" :class="{ active: activeSection === 'general' }" @click="activeSection = 'general'">周起始与主题</button>
          <button class="subcol-item" :class="{ active: activeSection === 'data' }" @click="activeSection = 'data'">数据管理</button>
          <button class="subcol-item" :class="{ active: activeSection === 'about' }" @click="activeSection = 'about'">关于</button>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>设置</h1>
        <p class="muted">配置 AI 服务商、提醒通道、周起始与主题；管理本地数据。</p>
      </div>
    </header>


    <!-- AI -->
    <section v-if="activeSection === 'ai'" class="settings-section card">
      <div class="section-head">
        <h2>AI 服务配置</h2>
        <p class="muted">仅本地存储，不上传到任何服务器。AI 只负责提取任务字段，优先级由系统统一计算。</p>
      </div>
      <div class="form-grid">
        <label class="block">
          <span>服务商预设</span>
          <select v-model="presetSelect" class="field" @change="syncPreset">
            <option v-for="p in presets" :key="p.id" :value="p.id">
              {{ p.name }}{{ p.browserDirect ? ' · 直连可用' : ' · 需同源代理' }}
            </option>
          </select>
          <p v-if="currentPreset?.note" class="muted hint">{{ currentPreset.note }}</p>
        </label>
        <label class="block">
          <span>接口地址 (Base URL)</span>
          <input v-model="baseURL" class="field" placeholder="https://api.deepseek.com/v1" />
        </label>
        <label class="block">
          <span>模型名称</span>
          <input v-model="model" class="field" placeholder="deepseek-chat" />
        </label>
        <label class="block">
          <span>API Key</span>
          <input v-model="apiKey" type="password" class="field" placeholder="sk-..." />
          <button class="btn-ghost clear-key" @click="clearKey">清除</button>
        </label>
        <label class="block">
          <span>Temperature</span>
          <input v-model.number="temperature" type="number" min="0" max="2" step="0.1" class="field" />
        </label>
      </div>
      <div class="form-actions">
        <button class="btn-outline" @click="saveAi">保存 AI 配置</button>
        <button class="btn-primary" @click="testAi" :disabled="!settingsStore.hasApiKey">测试连接</button>
        <span v-if="!settingsStore.hasApiKey" class="hint">未配置 API Key，AI 对话不可用</span>
      </div>
    </section>

    <!-- AI 技能 -->
    <section v-if="activeSection === 'skills'" class="settings-section card">
      <div class="section-head">
        <h2>AI 技能</h2>
        <p class="muted">技能 = 识别意图后自动选用的工作流。任务类技能产出的草稿仍需你确认后入库；风险检查只读不改任务。</p>
      </div>

      <div class="subsection-head">内置技能</div>
      <div class="skill-list">
        <div v-for="skill in BUILTIN_SKILLS" :key="skill.id" class="skill-row">
          <div class="skill-info">
            <div class="skill-name">{{ skill.name }}<span v-if="skill.output === 'reply'" class="skill-badge">只读</span></div>
            <p class="muted hint">{{ skill.description }}</p>
          </div>
          <div class="skill-control">
            <span v-if="skill.id === 'decompose'" class="skill-always">始终启用</span>
            <label v-else class="switch">
              <input
                type="checkbox"
                :checked="settingsStore.settings.skills.builtin[skill.id] !== false"
                @change="toggleBuiltinSkill(skill.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="track" />
            </label>
          </div>
        </div>
      </div>

      <div class="subsection-head">
        自定义技能
        <button class="btn-outline small" @click="openSkillModal()">+ 新增技能</button>
      </div>
      <p v-if="!settingsStore.settings.skills.custom.length" class="muted hint">还没有自定义技能。自定义技能输出形态固定为「追问或任务草稿」，可复用对话流确认入库。</p>
      <div class="skill-list">
        <div v-for="skill in settingsStore.settings.skills.custom" :key="skill.id" class="skill-row">
          <div class="skill-info">
            <div class="skill-name">{{ skill.name }}</div>
            <p class="muted hint prompt-preview">{{ skill.prompt }}</p>
          </div>
          <div class="skill-control">
            <button class="btn-ghost small" @click="openSkillModal(skill)">编辑</button>
            <button class="btn-ghost small danger-text" @click="removeCustomSkill(skill.id)">删除</button>
          </div>
        </div>
      </div>

      <div v-if="skillModal" class="modal-mask" @click.self="closeSkillModal">
        <div class="modal" role="dialog" aria-modal="true">
          <header class="modal-head">
            <h3>{{ skillModal.id ? '编辑技能' : '新增自定义技能' }}</h3>
            <button class="btn-ghost" aria-label="关闭" @click="closeSkillModal">✕</button>
          </header>
          <div class="modal-body">
            <div class="form-grid">
              <label class="block">
                <span>技能名称 <i class="muted">*</i></span>
                <input v-model="skillModal.name" class="field" placeholder="例如：周报草稿" />
              </label>
              <label class="block">
                <span>技能提示词 <i class="muted">*</i></span>
                <textarea v-model="skillModal.prompt" class="field skill-prompt" rows="5" placeholder="你是一位周报助手。用户会提供本周工作记录，请按 目标-动作-成果-下周计划 的结构整理成可发送的周报草稿。" />
                <p class="muted hint">输出形态固定为「追问或任务草稿」；如只需纯文本答复，提示词里写明「直接输出文本」。</p>
              </label>
              <p v-if="skillModalError" class="field-error-text">{{ skillModalError }}</p>
            </div>
          </div>
          <footer class="modal-foot">
            <button class="btn-outline" @click="closeSkillModal">取消</button>
            <button class="btn-primary" @click="saveCustomSkill">保存</button>
          </footer>
        </div>
      </div>
    </section>

    <!-- Reminder -->
    <section v-if="activeSection === 'reminder'" class="settings-section card">
      <div class="section-head">
        <h2>提醒设置</h2>
        <p class="muted">截止前 1 天 / 1 小时 / 15 分钟自动提醒；支持应用内、浏览器通知与企业微信群机器人。</p>
      </div>
      <div class="form-rows">
        <div class="field-row">
          <div class="field-label">
            默认截止时刻
            <p class="muted hint">仅设置截止日期的任务，按此时刻（默认 18:00）计算提醒。</p>
          </div>
          <div class="field-control">
            <input v-model="settingsStore.settings.reminder.defaultDueTime" type="time" class="field slim-field" />
          </div>
        </div>

        <div class="field-row">
          <div class="field-label">提醒通道</div>
          <div class="field-control channel-grid">
            <label class="check-row">
              <input type="checkbox" :checked="settingsStore.settings.reminder.browser" @change="toggleChannel('browser', $event)" />
              <span>浏览器通知</span>
            </label>
            <label class="check-row">
              <input type="checkbox" :checked="settingsStore.settings.reminder.inApp" @change="toggleChannel('inApp', $event)" />
              <span>应用内提醒</span>
            </label>
            <label class="check-row">
              <input type="checkbox" :checked="settingsStore.settings.reminder.wecom" @change="toggleChannel('wecom', $event)" />
              <span>企业微信群机器人</span>
            </label>
          </div>
        </div>

        <div class="field-row">
          <div class="field-label">
            企微 Webhook
            <p class="muted hint">企业微信群机器人发送提醒；提醒前 1 天 / 1 小时 / 15 分钟。</p>
          </div>
          <div class="field-control">
            <div class="input-with-btn">
              <input v-model="wecomWebhook" class="field" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
              <button class="btn-outline copy-btn" @click="copyWebhook">复制</button>
            </div>
          </div>
        </div>

        <div class="field-row">
          <div class="field-label">免打扰时段</div>
          <div class="field-control">
            <label class="check-row">
              <input type="checkbox" :checked="settingsStore.settings.reminder.quietEnabled" @change="setQuiet($event)" />
              <span>启用免打扰（这段时间内不发送提醒，统一顺延到时段结束）</span>
            </label>
            <div class="quiet-range" :class="{ on: settingsStore.settings.reminder.quietEnabled }">
              <label class="block">
                <span>开始</span>
                <input v-model="settingsStore.settings.reminder.quietStart" type="time" class="field slim-field" :disabled="!settingsStore.settings.reminder.quietEnabled" />
              </label>
              <label class="block">
                <span>结束</span>
                <input v-model="settingsStore.settings.reminder.quietEnd" type="time" class="field slim-field" :disabled="!settingsStore.settings.reminder.quietEnabled" />
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-outline" @click="saveReminder">保存提醒设置</button>
        <button class="btn-outline" @click="testWecom" :disabled="!wecomWebhook.trim()">测试企微发送</button>
      </div>
    </section>

    <!-- General -->
    <section v-if="activeSection === 'general'" class="settings-section card">
      <div class="section-head">
        <h2>周起始与主题</h2>
      </div>
      <div class="form-grid">
        <label class="block">
          <span>周起始日</span>
          <select v-model="settingsStore.settings.weekStartsOn" class="field" @change="setWeekStart($event)">
            <option value="1">周一（默认）</option>
            <option value="0">周日</option>
          </select>
          <p class="muted hint">影响按周归类的分组边界。</p>
        </label>
        <label class="block">
          <span>界面主题</span>
          <select v-model="settingsStore.settings.theme" class="field" @change="setTheme($event)">
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn-outline" @click="settingsStore.toggleTheme">切换主题</button>
        <button class="btn-ghost" @click="replayOnboarding">重新播放引导</button>
      </div>
    </section>

    <!-- Data -->
    <section v-if="activeSection === 'data'" class="settings-section card">
      <div class="section-head">
        <h2>数据管理</h2>
        <p class="muted">全部数据仅保存在本地浏览器 IndexedDB 中，不做云同步。</p>
      </div>
      <div class="form-grid">
        <div class="block">
          <span>备份导出</span>
          <button class="btn-outline" @click="exportData">导出 JSON 备份</button>
          <p class="muted hint">导出文件不含 API Key，可安全备份。</p>
        </div>
        <div class="block">
          <span>备份导入</span>
          <input type="file" accept=".json" @change="onImport" class="field" />
          <p class="muted hint">选择 JSON 备份文件，合并或替换当前数据。</p>
        </div>
        <div class="block danger">
          <span>清空全部数据</span>
          <button class="btn-outline danger-text" @click="clearData">清空并重置</button>
          <p class="muted hint">清空后任务、OKR、设置全部丢失，不可恢复。</p>
        </div>
      </div>
    </section>

    <!-- About -->
    <section v-if="activeSection === 'about'" class="settings-section card">
      <div class="section-head">
        <h2>关于 timebound</h2>
      </div>
      <div class="about-card card" style="padding:0;border:none;box-shadow:none;background:transparent">
        <div class="about-body">
          <div class="brand">
            <span class="mark">✓</span>
            <div>
              <div class="name">timebound</div>
              <div class="ver">轻重缓急工作表 · v0.1.0</div>
            </div>
          </div>
          <p class="muted">基于浏览器本地 IndexedDB 的时间管理工具，支持 AI 对话录入、OKR 拆解、到期三档提醒。</p>
          <h3 class="about-sub">隐私说明</h3>
          <ul class="about-list">
            <li>无自有后端，所有数据仅存在你的本地浏览器。</li>
            <li>AI 服务商的 API Key 仅本地存储，不进入导出文件与日志。</li>
            <li>企业微信提醒通过浏览器直连 Webhook，如遇 CORS 限制会尝试无凭证发送并标记“结果未知”。</li>
            <li>如需迁移设备，请使用「数据管理」中的备份导出/导入。</li>
          </ul>
          <h3 class="about-sub">技术栈</h3>
          <ul class="about-list">
            <li>Vue 3 + TypeScript + Vite + Pinia + Vue Router</li>
            <li>Dexie（IndexedDB）本地存储，PWA 可离线安装</li>
            <li>OpenAI 兼容接口（DeepSeek / OpenAI / 通义千问 / Kimi 等）</li>
          </ul>
        </div>
      </div>
    </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-section {
  margin-bottom: 16px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.section-head h2 {
  margin: 0 0 3px;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.section-head p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.form-rows {
  display: flex;
  flex-direction: column;
}
.field-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--border);
  align-items: start;
}
.field-row:first-child {
  padding-top: 0;
  border-top: 0;
}
.field-label {
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
  line-height: 1.5;
}
.field-label .muted {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 11.5px;
}
.field-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.slim-field {
  width: 160px;
}
.channel-grid {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 14px;
}
.channel-grid .check-row {
  flex: 0 0 auto;
}
.quiet-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  max-width: 320px;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}
.quiet-range.on {
  opacity: 1;
}
@media (max-width: 860px) {
  .field-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.check-row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}
.check-row input {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.hint {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 4px;
}
.input-with-btn {
  display: flex;
  gap: 6px;
}
.input-with-btn .field {
  flex: 1;
}
.copy-btn {
  padding: 0 10px;
  font-size: 12px;
}
.clear-key {
  font-size: 12px;
  padding: 0 10px;
  color: var(--text-muted);
}
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.about-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.brand {
  display: flex;
  gap: 10px;
  align-items: center;
}
.mark {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  background: var(--brand);
  color: #fff;
  font-weight: 800;
}
.name {
  font-weight: 700;
  font-size: 15px;
}
.ver {
  font-size: 12px;
  color: var(--text-muted);
}
.about-sub {
  margin: 14px 0 6px;
  font-size: 13px;
  color: var(--text);
}
.about-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.8;
}
.about-list li {
  margin-bottom: 4px;
}
.danger-text {
  color: var(--danger);
}
.subsection-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.skill-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 2px;
  border-bottom: 1px solid var(--border);
}
.skill-info {
  min-width: 0;
}
.skill-name {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.skill-badge {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 7px;
  font-weight: 500;
}
.skill-always {
  font-size: 11px;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 999px;
  padding: 2px 10px;
}
.skill-control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.prompt-preview {
  margin: 2px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.small {
  padding: 3px 10px !important;
  font-size: 11.5px !important;
}
.switch {
  position: relative;
  display: inline-flex;
  cursor: pointer;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.switch .track {
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.15s ease;
  position: relative;
}
.switch .track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}
.switch input:checked + .track {
  background: var(--brand);
}
.switch input:checked + .track::after {
  transform: translateX(14px);
}
.skill-prompt {
  resize: vertical;
  min-height: 80px;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: grid;
  place-items: center;
  z-index: 60;
}
.modal {
  width: min(480px, 94vw);
  max-height: 88vh;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  margin: 0;
  font-size: 15px;
}
.modal-body {
  padding: 16px;
}
.modal-foot {
  padding: 12px 16px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.field-error-text {
  margin: 0;
  color: var(--danger);
  font-size: 11.5px;
}
</style>
