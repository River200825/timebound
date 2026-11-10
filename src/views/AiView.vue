<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAiStore, type MessageView } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/toast'
import TaskDraftCard from '@/components/TaskDraftCard.vue'
import IconAi from '@/components/icons/IconAi.vue'

const aiStore = useAiStore()
const settingsStore = useSettingsStore()
const toast = useToast()
const router = useRouter()

const text = ref('')
const images = ref<Array<{ name: string; dataUrl: string }>>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const editingId = ref<string | null>(null)
const editingTitle = ref('')

onMounted(() => {
  void aiStore.loadSessions()
})

function startRename(session: { id: string; title: string }) {
  editingId.value = session.id
  editingTitle.value = session.title
  void nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.history-input')
    el?.focus()
    el?.select()
  })
}

function saveRename() {
  const id = editingId.value
  if (!id) return
  const title = editingTitle.value.trim()
  if (title) void aiStore.renameSession(id, title)
  editingId.value = null
  editingTitle.value = ''
}

function cancelRename() {
  editingId.value = null
  editingTitle.value = ''
}

async function confirmDelete(session: { id: string; title: string }) {
  if (!confirm(`删除对话「${session.title}」？`)) return
  await aiStore.removeSession(session.id)
  toast.push('对话已删除', 'info')
}

const hasKey = computed(() => settingsStore.hasApiKey)
const sending = computed(() => aiStore.sending)

function pickFiles() {
  fileInput.value?.click()
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function handleFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (file.size > 10 * 1024 * 1024) {
      toast.push(`${file.name} 超过 10MB，已跳过`, 'error')
      continue
    }
    if (file.type.startsWith('image/')) {
      const dataUrl = await readAsDataURL(file)
      images.value.push({ name: file.name || '剪贴板图片', dataUrl })
      continue
    }
    if (/\.(txt|md|csv|json|log)$/i.test(file.name) || file.type.startsWith('text/')) {
      const content = await file.text()
      text.value = `${text.value}\n\n${content}`.trim()
      toast.push(`已读取 ${file.name}`, 'success')
      continue
    }
    if (/\.(mp4|mov|avi|mkv)$/i.test(file.name)) {
      toast.push('暂不支持视频解析，可上传截图或文字', 'error')
      continue
    }
    if (/\.(pdf|docx?|xlsx?)$/i.test(file.name)) {
      toast.push('当前版本请粘贴文本或截图，PDF/Office 解析将在后续版本支持', 'error')
      continue
    }
    toast.push(`不支持的文件类型：${file.name}`, 'error')
  }
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) await handleFiles(input.files)
  input.value = ''
}

async function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length) {
    event.preventDefault()
    await handleFiles(files)
  }
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

async function send() {
  if (sending.value) return
  const currentText = text.value
  const currentImages = images.value.map((image) => image.dataUrl)
  if (!currentText.trim() && !currentImages.length) return
  text.value = ''
  images.value = []
  try {
    await aiStore.send(currentText, currentImages)
  } catch (error) {
    if ((error as { code?: string }).code === 'no-key') {
      toast.push('请先在设置中配置 API Key', 'error')
    } else {
      toast.push(error instanceof Error ? error.message : '发送失败', 'error')
    }
  }
}

async function commit(message: MessageView) {
  try {
    const count = await aiStore.commit(message.id)
    if (count > 0) {
      toast.push(`已创建 ${count} 条任务`, 'success')
      router.push('/tasks')
    }
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

function selectedCount(message: MessageView) {
  return message.drafts?.filter((d) => d.selected).length ?? 0
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void send()
  }
}
</script>

<template>
  <div class="page">
    <div class="page-with-subcol">
      <aside class="page-subcol">
        <section class="subcol-card">
          <div class="subcol-heading history-head">
            <span>历史对话</span>
            <button class="btn-ghost small" @click="aiStore.newSession()">+ 新对话</button>
          </div>
          <p v-if="!aiStore.sessions.length" class="muted hint">还没有历史对话，发一条消息后会出现在这里。</p>
          <div v-else class="history-list">
            <div
              v-for="session in aiStore.sessions"
              :key="session.id"
              class="history-item"
              :class="{ active: session.id === aiStore.currentId }"
            >
              <input
                v-if="editingId === session.id"
                v-model="editingTitle"
                class="field history-input"
                @keydown.enter.prevent="saveRename"
                @keydown.escape="cancelRename"
                @blur="saveRename"
              />
              <button v-else class="history-title" :title="session.title" @click="aiStore.switchSession(session.id)">
                {{ session.title }}
              </button>
              <div class="history-actions">
                <button class="icon-x" title="重命名" @click="startRename(session)">&#9998;</button>
                <button class="icon-x" title="删除对话" @click="confirmDelete(session)">✕</button>
              </div>
            </div>
          </div>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">示例输入</div>
          <button class="subcol-item example-btn" @click="text = '下周三前完成晋升名单梳理，重要且紧急，工作量中等，需要和张三对齐'">下周三前完成晋升名单梳理…</button>
          <button class="subcol-item example-btn" @click="text = '本周要完成三件事：1）整理 Q4 招聘计划，周五前；2）组织一次管理者培训，下周二；3）输出员工满意度报告，月底前。其中招聘计划最重要，培训最紧急。'">本周三件事：招聘计划、培训…</button>
          <button class="subcol-item example-btn" @click="text = '下周一之前给王总准备一页纸 PPT 汇报晋升方案，重要且紧急。'">给王总准备一页纸 PPT 汇报…</button>
        </section>
        <section class="subcol-card">
          <div class="subcol-heading">能力</div>
          <div class="subcol-feature"><strong>文本 → 任务</strong><span>识别任务、补齐字段、排优先级</span></div>
          <div class="subcol-feature"><strong>截图 → 任务</strong><span>粘贴图片或拖入，自动识别</span></div>
          <div class="subcol-feature"><strong>手动修正</strong><span>重要/紧急可随时手动调整优先级</span></div>
        </section>
      </aside>

      <main class="main-col">
    <header class="page-head">
      <div>
        <h1>AI 助手</h1>
        <p class="muted">发文字、截图或文件，自动识别任务、补齐字段并计算优先级。</p>
      </div>
      <button class="btn-ghost" @click="aiStore.newSession()">+ 新对话</button>
    </header>

    <div v-if="!hasKey" class="guide card">
      <h3>先连接一个 AI 模型</h3>
      <p class="muted">
        timebound 不提供中转服务。你填写的 API Key 只保存在本浏览器，不会上传到我们的服务器。
        支持 DeepSeek、OpenAI、通义千问、Kimi 等 OpenAI 兼容接口。
      </p>
      <div class="steps">
        <span>1. 选择服务商</span>
        <span>2. 填入 API Key</span>
        <span>3. 测试连接</span>
      </div>
      <div class="guide-actions">
        <RouterLink to="/settings" class="btn-primary">去设置 API Key</RouterLink>
        <RouterLink to="/tasks" class="btn-outline">先手动创建任务</RouterLink>
      </div>
    </div>

    <div v-else class="chat card">
      <div v-if="!aiStore.messages.length" class="chat-empty">
        <div class="spark"><IconAi :size="34" /></div>
        <h3>把杂乱的信息交给 AI</h3>
        <p class="muted">例如：</p>
        <div class="samples">
          <button
            class="sample"
            @click="text = '下周三前完成晋升名单梳理，重要且紧急，工作量中等，需要和张三对齐'"
          >
            下周三前完成晋升名单梳理，重要且紧急…
          </button>
          <button
            class="sample"
            @click="text = '本周要完成三件事：1）整理 Q4 招聘计划，周五前；2）组织一次管理者培训，下周二；3）输出员工满意度报告，月底前。其中招聘计划最重要，培训最紧急。'"
          >
            本周要完成三件事：招聘计划、管理者培训、满意度报告…
          </button>
        </div>
        <p class="muted tip">也可以直接粘贴截图，或拖入图片 / 文本文件。</p>
      </div>

      <div v-else class="messages">
        <div v-for="message in aiStore.messages" :key="message.id" class="message" :class="message.role">
          <div class="avatar" :class="{ 'avatar-ai': message.role === 'assistant' }"><IconAi v-if="message.role === 'assistant'" :size="16" /><span v-else>我</span></div>
          <div class="bubble-wrap">
            <div v-if="message.role === 'assistant' && message.skillName" class="skill-chip">已调用技能 · {{ message.skillName }}</div>
            <div class="bubble" :class="{ failed: message.failed }">
              <p v-if="message.pending" class="pending">正在识别任务…</p>
              <p v-else>{{ message.content }}</p>
            </div>

            <div v-if="message.drafts?.length" class="drafts">
              <TaskDraftCard
                v-for="draft in message.drafts"
                :key="draft.id"
                :draft="draft"
                @update="(patch) => aiStore.updateDraft(message.id, draft.id, patch)"
                @remove="aiStore.removeDraft(message.id, draft.id)"
              />
              <div class="commit-bar">
                <span class="muted">已选 {{ selectedCount(message) }} / {{ message.drafts.length }} 条</span>
                <button class="btn-primary" :disabled="selectedCount(message) === 0" @click="commit(message)">
                  加入任务表
                </button>
              </div>
            </div>

            <div v-if="message.failed" class="retry">
              <button class="btn-outline" @click="toast.push('请重新发送一次，或检查 API Key / 模型配置', 'info')">
                如何排查？
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="composer"
        :class="{ dragging: dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="dragOver = false; handleFiles($event.dataTransfer?.files ?? [])"
      >
        <div v-if="images.length" class="thumbs">
          <div v-for="(image, index) in images" :key="image.name + index" class="thumb">
            <img :src="image.dataUrl" :alt="image.name" />
            <button class="thumb-del" aria-label="移除图片" @click="removeImage(index)">✕</button>
          </div>
        </div>
        <textarea
          v-model="text"
          class="composer-input"
          rows="3"
          placeholder="描述任务，或粘贴截图 / 拖入文件…（Ctrl/⌘ + Enter 发送）"
          @paste="onPaste"
          @keydown="onKeydown"
        />
        <div class="composer-foot">
          <button class="btn-ghost" :disabled="sending" @click="pickFiles">＋ 附件</button>
          <input ref="fileInput" type="file" multiple class="hidden-input" @change="onFileChange" />
          <span class="muted hint">支持图片、txt、md、csv、json</span>
          <button class="btn-primary" :disabled="sending || (!text.trim() && !images.length)" @click="send">
            {{ sending ? '识别中…' : '发送' }}
          </button>
        </div>
      </div>
    </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.example-btn {
  text-align: left;
  font-size: 12px;
  color: var(--text);
}
.example-btn:hover {
  color: var(--brand);
}
.subcol-feature {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 12px;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
}
.history-item:hover {
  background: var(--surface-2);
}
.history-item.active {
  background: color-mix(in srgb, var(--brand) 9%, var(--surface));
  border-color: color-mix(in srgb, var(--brand) 25%, var(--border));
}
.history-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 12.5px;
  color: var(--text);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item.active .history-title {
  color: var(--brand);
  font-weight: 600;
}
.history-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.history-item:hover .history-actions {
  opacity: 1;
}
.icon-x {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  width: 18px;
  height: 18px;
  font-size: 11px;
  line-height: 1;
}
.icon-x:hover {
  background: var(--border);
  color: var(--danger);
}
.history-input {
  flex: 1;
  min-width: 0;
  padding: 3px 7px;
  font-size: 12px;
}
.small {
  padding: 2px 8px !important;
  font-size: 11px !important;
}
.subcol-feature strong {
  color: var(--text);
  font-size: 12px;
}
.subcol-feature span {
  color: var(--text-muted);
  font-size: 11px;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.page-head h1 {
  margin: 0 0 3px;
  font-size: 22px;
}
.page-head p {
  margin: 0;
  font-size: 12.5px;
}
.guide {
  padding: 22px;
  max-width: 700px;
}
.guide h3 {
  margin: 0 0 6px;
}
.guide p {
  margin: 0 0 12px;
  font-size: 13px;
}
.steps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.steps span {
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
}
.guide-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chat {
  display: flex;
  flex-direction: column;
  min-height: 60vh;
  overflow: hidden;
}
.chat-empty {
  padding: 40px 24px 20px;
  text-align: center;
}
.spark {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin: 0 auto 10px;
  background: var(--brand-bg);
  color: var(--brand);
}
.chat-empty h3 {
  margin: 0 0 4px;
}
.samples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 640px;
  margin: 8px auto;
}
.sample {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 12.5px;
  color: var(--text-muted);
  cursor: pointer;
}
.sample:hover {
  border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
  color: var(--text);
}
.tip {
  font-size: 11.5px;
  margin-top: 10px;
}
.messages {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  max-height: 58vh;
}
.message {
  display: flex;
  gap: 9px;
}
.message.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}
.avatar-ai {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
.message.user .avatar {
  background: var(--brand);
  color: #fff;
  border-color: transparent;
}
.bubble-wrap {
  max-width: min(760px, 88%);
  min-width: 0;
  flex: 1;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand);
  background: var(--brand-bg);
  border-radius: 999px;
  padding: 1px 8px;
  margin: 0 0 4px 2px;
}
.bubble {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
}
.message.user .bubble {
  background: color-mix(in srgb, var(--brand) 9%, var(--surface));
  border-color: color-mix(in srgb, var(--brand) 22%, var(--border));
  margin-left: auto;
  width: fit-content;
  max-width: 100%;
}
.bubble p {
  margin: 0;
  white-space: pre-wrap;
}
.bubble.failed {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  color: var(--danger);
}
.pending {
  color: var(--text-muted);
}
.drafts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.commit-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 2px;
}
.retry {
  margin-top: 6px;
}
.composer {
  border-top: 1px solid var(--border);
  padding: 12px 14px 14px;
  background: var(--surface-2);
}
.composer.dragging {
  outline: 2px dashed var(--brand);
  outline-offset: -6px;
}
.composer-input {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 9px;
  padding: 9px 11px;
  resize: vertical;
  font-size: 13px;
  outline: none;
}
.composer-input:focus {
  border-color: var(--brand);
}
.composer-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.hidden-input {
  display: none;
}
.hint {
  font-size: 11px;
  margin-right: auto;
}
.thumbs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.thumb {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
}
@media (max-width: 720px) {
  .messages {
    max-height: none;
  }
  .bubble-wrap {
    max-width: 92%;
  }
}
</style>
