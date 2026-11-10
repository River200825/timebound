import Dexie, { type Table } from 'dexie'
import { DEFAULT_STATUSES, type StatusDefinition, type Task } from '@/domain/task'
import type { KeyResult, Objective } from '@/domain/okr'
import type { Project } from '@/domain/project'
import type { TaskDraft } from '@/services/ai'

export interface SessionRecord {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MessageRecord {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  drafts?: TaskDraft[]
  skillId?: string
  skillName?: string
  failed?: boolean
  committed?: boolean
}

export interface ReminderLogRecord {
  id: string
  taskId: string
  offsetMinutes: number
  dueEndVersion: string
  sentAt: number
  channel: string
  result: 'sent' | 'failed' | 'unknown'
  detail?: string
}

export interface SettingRecord {
  key: string
  value: unknown
}

class TimeboundDB extends Dexie {
  tasks!: Table<Task, string>
  statusDefs!: Table<StatusDefinition, string>
  okrs!: Table<Objective, string>
  keyResults!: Table<KeyResult, string>
  sessions!: Table<SessionRecord, string>
  messages!: Table<MessageRecord, string>
  reminderLogs!: Table<ReminderLogRecord, string>
  settings!: Table<SettingRecord, string>
  projects!: Table<Project, string>

  constructor() {
    super('timebound')
    this.version(2)
      .stores({
        tasks:
          'id, statusId, importance, urgency, workload, priority, dueStart, dueEnd, phase, process, projectId, createdAt, updatedAt',
        statusDefs: 'id, category',
        okrs: 'id, quarter, status, createdAt',
        keyResults: 'id, objectiveId, quarter, dueDate',
        sessions: 'id, createdAt, updatedAt',
        messages: 'id, sessionId, createdAt',
        reminderLogs: 'id, taskId, offsetMinutes, dueEndVersion, sentAt, channel',
        settings: 'key',
        projects: 'id, status, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('tasks')
          .toCollection()
          .modify((task: Task) => {
            if (task.projectId === undefined) task.projectId = null
          }),
      )
    this.version(3)
      .stores({
        projects: 'id, status, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: Project) => {
            if (!Array.isArray(project.phases)) project.phases = []
          }),
      )
  }
}

export const db = new TimeboundDB()

/**
 * IndexedDB 无法 structured-clone Vue 响应式代理对象（DexieError2 / DataCloneError）。
 * 所有写入入口统一转成纯净 JSON 再落库，避免同一类错误散落多处。
 */
function toPlain<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

let initialized = false

export async function initDb(): Promise<void> {
  if (initialized) return
  await db.open()
  // 每次启动都 upsert 默认状态定义，保证升级后新增的「未启动」等字段一定出现在下拉
  await db.statusDefs.bulkPut(DEFAULT_STATUSES)
  initialized = true
}

export const taskRepo = {
  all: () => db.tasks.toArray(),
  get: (id: string) => db.tasks.get(id),
  save: (task: Task) => db.tasks.put(toPlain(task)),
  bulkSave: (tasks: Task[]) => db.tasks.bulkPut(tasks.map(toPlain)),
  remove: (id: string) => db.tasks.delete(id),
  removeMany: (ids: string[]) => db.tasks.bulkDelete(ids),
  clear: () => db.tasks.clear(),
}

export const projectRepo = {
  all: () => db.projects.toArray(),
  get: (id: string) => db.projects.get(id),
  save: (p: Project) => db.projects.put(toPlain(p)),
  remove: (id: string) => db.projects.delete(id),
  clear: () => db.projects.clear(),
}

export const statusRepo = {
  all: () => db.statusDefs.toArray(),
  save: (status: StatusDefinition) => db.statusDefs.put(toPlain(status)),
  bulkSave: (statuses: StatusDefinition[]) => db.statusDefs.bulkPut(statuses.map(toPlain)),
  remove: (id: string) => db.statusDefs.delete(id),
}

export const okrRepo = {
  allObjectives: () => db.okrs.toArray(),
  allKeyResults: () => db.keyResults.toArray(),
  saveObjective: (o: Objective) => db.okrs.put(toPlain(o)),
  saveKeyResult: (k: KeyResult) => db.keyResults.put(toPlain(k)),
  bulkSaveKeyResults: (ks: KeyResult[]) => db.keyResults.bulkPut(ks.map(toPlain)),
  removeObjective: (id: string) => db.okrs.delete(id),
  removeKeyResult: (id: string) => db.keyResults.delete(id),
  clear: async () => {
    await db.okrs.clear()
    await db.keyResults.clear()
  },
}

export const reminderRepo = {
  recent: (limit = 20) => db.reminderLogs.orderBy('sentAt').reverse().limit(limit).toArray(),
  all: () => db.reminderLogs.toArray(),
  has: async (id: string) => (await db.reminderLogs.get(id)) !== undefined,
  log: (log: ReminderLogRecord) => db.reminderLogs.put(toPlain(log)),
  clear: () => db.reminderLogs.clear(),
}

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await db.settings.get(key)
    return row ? (row.value as T) : fallback
  },
  set: (key: string, value: unknown) => db.settings.put(toPlain({ key, value })),
  all: () => db.settings.toArray(),
}

export const sessionRepo = {
  all: () => db.sessions.orderBy('updatedAt').reverse().toArray(),
  save: (s: SessionRecord) => db.sessions.put(toPlain(s)),
  remove: (id: string) => db.sessions.delete(id),
  messages: (sessionId: string) =>
    db.messages.where('sessionId').equals(sessionId).sortBy('createdAt'),
  addMessage: (m: MessageRecord) => db.messages.put(toPlain(m)),
  removeMessages: (sessionId: string) => db.messages.where('sessionId').equals(sessionId).delete(),
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.okrs.clear(),
    db.keyResults.clear(),
    db.sessions.clear(),
    db.messages.clear(),
    db.reminderLogs.clear(),
    db.settings.clear(),
    db.projects.clear(),
  ])
  await db.statusDefs.clear()
  await db.statusDefs.bulkPut(DEFAULT_STATUSES)
}
