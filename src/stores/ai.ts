import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AiError, extractTasks, type TaskDraft } from '@/services/ai'
import {
  buildOkrSummary,
  buildTaskSummary,
  routeSkill,
  runSkill,
  skillDisplayName,
  type SkillResult,
} from '@/services/ai-skills'
import { uid } from '@/domain/task'
import { sessionRepo, type MessageRecord } from '@/data/db'
import { useSettingsStore } from './settings'
import { useTaskStore } from './tasks'
import { useOkrStore } from './okr'

export interface MessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  drafts?: TaskDraft[]
  pending?: boolean
  failed?: boolean
  committed?: boolean
  skillId?: string
  skillName?: string
}

export interface SessionView {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

function toPlainMessage(message: MessageView, sessionId: string): MessageRecord {
  return {
    id: message.id,
    sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    drafts: message.drafts ? (JSON.parse(JSON.stringify(message.drafts)) as TaskDraft[]) : undefined,
    skillId: message.skillId,
    skillName: message.skillName,
    failed: message.failed,
    committed: message.committed,
  }
}

function toViewMessage(record: MessageRecord): MessageView {
  const drafts = record.drafts?.map((d) => ({ ...d, selected: d.selected ?? true }))
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt,
    drafts,
    skillId: record.skillId,
    skillName: record.skillName,
    failed: record.failed,
    committed: record.committed,
  }
}

function titleOf(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.slice(0, 30) || '新对话'
}

export const useAiStore = defineStore('ai', () => {
  const settingsStore = useSettingsStore()
  const taskStore = useTaskStore()
  const okrStore = useOkrStore()

  const messages = ref<MessageView[]>([])
  const sessions = ref<SessionView[]>([])
  const currentId = ref<string | null>(null)
  const sending = ref(false)
  const error = ref('')

  // 草稿卡输入是 @input 高频事件，IndexedDB 写入做 250ms 防抖
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function persistMessage(message: MessageView, sessionId: string, debounce = false) {
    const flush = () => {
      sessionRepo.addMessage(toPlainMessage(message, sessionId)).catch((err) => console.error('保存消息失败', err))
    }
    if (!debounce) {
      flush()
      return
    }
    const key = `${sessionId}:${message.id}`
    const timer = persistTimers.get(key)
    if (timer) clearTimeout(timer)
    persistTimers.set(
      key,
      setTimeout(() => {
        persistTimers.delete(key)
        flush()
      }, 250),
    )
  }

  async function touchSession() {
    const id = currentId.value
    if (!id) return
    const index = sessions.value.findIndex((s) => s.id === id)
    if (index < 0) return
    const next = { ...sessions.value[index], updatedAt: new Date().toISOString() }
    sessions.value.splice(index, 1)
    sessions.value.unshift(next)
    try {
      await sessionRepo.save(next)
    } catch (err) {
      console.error('保存会话失败', err)
    }
  }

  async function loadSessions() {
    try {
      const rows = await sessionRepo.all()
      sessions.value = rows
      currentId.value = rows[0]?.id ?? null
      messages.value = currentId.value
        ? (await sessionRepo.messages(currentId.value)).map(toViewMessage)
        : []
    } catch (err) {
      console.error('加载历史会话失败', err)
    }
  }

  function newSession() {
    currentId.value = null
    messages.value = []
    error.value = ''
  }

  async function switchSession(id: string) {
    if (currentId.value === id) return
    currentId.value = id
    error.value = ''
    try {
      messages.value = (await sessionRepo.messages(id)).map(toViewMessage)
    } catch (err) {
      console.error('加载会话失败', err)
      messages.value = []
    }
  }

  async function renameSession(id: string, title: string) {
    const nextTitle = title.trim().slice(0, 40)
    if (!nextTitle) return
    const index = sessions.value.findIndex((s) => s.id === id)
    if (index < 0) return
    const next = { ...sessions.value[index], title: nextTitle }
    sessions.value.splice(index, 1, next)
    try {
      await sessionRepo.save(next)
    } catch (err) {
      console.error('重命名失败', err)
    }
  }

  async function removeSession(id: string) {
    try {
      await sessionRepo.removeMessages(id)
      await sessionRepo.remove(id)
    } catch (err) {
      console.error('删除会话失败', err)
    }
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentId.value === id) {
      currentId.value = sessions.value[0]?.id ?? null
      messages.value = currentId.value
        ? (await sessionRepo.messages(currentId.value)).map(toViewMessage)
        : []
    }
  }

  function clear() {
    // 兼容旧调用：等价于新建空白会话
    newSession()
  }

  function updateDraft(messageId: string, draftId: string, patch: Partial<TaskDraft>) {
    const message = messages.value.find((m) => m.id === messageId)
    if (!message?.drafts) return
    const draft = message.drafts.find((d) => d.id === draftId)
    if (!draft) return
    Object.assign(draft, patch)
    const sessionId = currentId.value
    if (sessionId) persistMessage(message, sessionId, true)
  }

  function removeDraft(messageId: string, draftId: string) {
    const message = messages.value.find((m) => m.id === messageId)
    if (!message?.drafts) return
    message.drafts = message.drafts.filter((d) => d.id !== draftId)
    const sessionId = currentId.value
    if (sessionId) persistMessage(message, sessionId)
  }

  async function send(text: string, images: string[] = []) {
    const content = text.trim()
    if (!content && !images.length) return
    if (!settingsStore.hasApiKey) {
      error.value = '尚未配置 API Key，请先到设置中填写'
      throw new AiError(error.value, 'no-key')
    }

    error.value = ''
    sending.value = true
    // 断点续聊：没有当前会话时自动建会话（标题取首句）
    if (!currentId.value) {
      const now = new Date().toISOString()
      const sessionId = uid()
      const title = titleOf(content || `（上传了 ${images.length} 张图片）`)
      const session: SessionView = { id: sessionId, title, createdAt: now, updatedAt: now }
      currentId.value = sessionId
      sessions.value.unshift(session)
      sessionRepo.save(session).catch((err) => console.error('保存会话失败', err))
    }
    const sessionId = currentId.value!
    const userMessage: MessageView = {
      id: uid(),
      role: 'user',
      content: content || `（上传了 ${images.length} 张图片）`,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(userMessage)
    persistMessage(userMessage, sessionId)

    const assistant: MessageView = {
      id: uid(),
      role: 'assistant',
      content: '正在识别任务…',
      createdAt: new Date().toISOString(),
      pending: true,
    }
    messages.value.push(assistant)

    const finishAssistant = () => {
      persistMessage(assistant, sessionId)
      void touchSession()
    }

    try {
      if (images.length) {
        const drafts = await extractTasks(settingsStore.settings.ai, content, images)
        assistant.pending = false
        assistant.content = `识别到 ${drafts.length} 条任务，请确认后加入任务表。`
        assistant.drafts = drafts
        assistant.skillId = 'image'
        assistant.skillName = '图片提取'
        finishAssistant()
        return
      }

      const history = messages.value
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => !m.pending && !m.failed)
        .slice(-8)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      // 确保 OKR 上下文是最新的（OKR 页之前没打开过时 store 为空）
      if (!okrStore.objectives.length) await okrStore.load()
      const snapshot = buildTaskSummary(taskStore.tasks, settingsStore.statuses)
      const okrSnapshot = buildOkrSummary(okrStore.objectives, okrStore.keyResults)
      const skillId = await routeSkill(settingsStore.settings.ai, content, settingsStore.settings.skills)
      // 提前写入 chip：即使技能执行失败，用户也能看到是哪个技能被调用了
      assistant.skillId = skillId
      assistant.skillName = skillDisplayName(settingsStore.settings.skills, skillId)
      const result: SkillResult = await runSkill({
        skillId,
        text: content,
        config: settingsStore.settings.ai,
        history,
        skills: settingsStore.settings.skills,
        tasksSummary: snapshot,
        activeOkr: okrSnapshot,
      })
      assistant.pending = false
      if (result.kind === 'question' || result.kind === 'reply') {
        assistant.content = result.content
        finishAssistant()
        return
      }
      assistant.content = `「${assistant.skillName}」为你准备了 ${result.tasks.length} 条任务，请确认后加入任务表。`
      assistant.drafts = result.tasks
      finishAssistant()
    } catch (err) {
      assistant.pending = false
      assistant.failed = true
      assistant.content = err instanceof Error ? err.message : '识别失败，请重试'
      error.value = assistant.content
      finishAssistant()
    } finally {
      sending.value = false
    }
  }

  async function commit(messageId: string): Promise<number> {
    const message = messages.value.find((m) => m.id === messageId)
    if (!message?.drafts) return 0
    let count = 0
    for (const draft of message.drafts.filter((d) => d.selected)) {
      const status =
        settingsStore.statuses.find((s) => s.name === draft.statusName)?.id ?? 'todo'
      await taskStore.create({
        title: draft.title,
        description: draft.description,
        statusId: status,
        importance: draft.importance,
        urgency: draft.urgency,
        workload: draft.workload,
        dueStart: draft.dueStart,
        dueEnd: draft.dueEnd,
        phase: draft.phase,
        process: draft.process,
        owner: draft.owner,
        participants: draft.participants,
        projectId: draft.projectId,
        okrLinks: draft.okrLinks,
        source: 'ai-chat',
      })
      count++
    }
    if (count > 0) {
      message.committed = true
      message.drafts = message.drafts.filter((d) => !d.selected)
      if (!message.drafts.length) message.drafts = undefined
      const sessionId = currentId.value
      if (sessionId) persistMessage(message, sessionId)
      void touchSession()
    }
    return count
  }

  return {
    messages,
    sessions,
    currentId,
    sending,
    error,
    clear,
    loadSessions,
    newSession,
    switchSession,
    renameSession,
    removeSession,
    updateDraft,
    removeDraft,
    send,
    commit,
  }
})
