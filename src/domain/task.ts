export type Importance = '高' | '中' | '低'
export type Workload = '大' | '中' | '小'
export type Priority = 'S' | 'A' | 'B+' | 'B' | 'B-' | 'C'
export type StatusCategory = 'active' | 'done' | 'cancelled' | 'postponed'
export type TaskSource = 'manual' | 'ai-chat' | 'okr-ai' | 'okr-manual' | 'import'

export interface OkrLink {
  objectiveId?: string
  keyResultId?: string
}

export interface PriorityOverride {
  value: Priority
  reason?: string
  at: string
}

export interface Task {
  id: string
  title: string
  description: string
  statusId: string
  importance: Importance
  urgency: Importance
  workload: Workload
  dueStart: string | null
  dueEnd: string | null
  priority: Priority
  priorityOverride: PriorityOverride | null
  phase: string | null
  process: string | null
  order: number
  owner: string | null
  participants: string[]
  projectId: string | null
  okrLinks: OkrLink[]
  source: TaskSource
  sourceRef: { sessionId?: string; messageId?: string; fileName?: string } | null
  reminderOffsets: number[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface StatusDefinition {
  id: string
  name: string
  color: string
  category: StatusCategory
  isDefault?: boolean
}

export const DEFAULT_STATUSES: StatusDefinition[] = [
  { id: 'not-started', name: '未启动', color: '#6B7280', category: 'active', isDefault: true },
  { id: 'todo', name: '进行中', color: '#3A7BD5', category: 'active', isDefault: true },
  { id: 'done', name: '已完成', color: '#3E9B63', category: 'done' },
  { id: 'cancelled', name: '已取消', color: '#8A8F98', category: 'cancelled' },
  { id: 'postponed', name: '已延期', color: '#C79A16', category: 'postponed' },
]

export const IMPORTANCE_OPTIONS: Importance[] = ['高', '中', '低']
export const WORKLOAD_OPTIONS: Workload[] = ['大', '中', '小']

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string }

export function createTask(input: TaskInput): Task {
  const now = nowISO()
  const dueStart = input.dueStart ?? input.dueEnd ?? null
  const dueEnd = input.dueEnd ?? input.dueStart ?? null
  return {
    id: uid(),
    title: input.title.trim(),
    description: input.description ?? '',
    statusId: input.statusId ?? 'todo',
    importance: input.importance ?? '中',
    urgency: input.urgency ?? '中',
    workload: input.workload ?? '中',
    dueStart,
    dueEnd,
    priority: input.priority ?? 'B',
    priorityOverride: input.priorityOverride ?? null,
    phase: input.phase ?? null,
    process: input.process ?? null,
    order: input.order ?? 0,
    owner: input.owner ?? null,
    participants: input.participants ?? [],
    projectId: input.projectId ?? null,
    okrLinks: input.okrLinks ?? [],
    source: input.source ?? 'manual',
    sourceRef: input.sourceRef ?? null,
    reminderOffsets: input.reminderOffsets ?? [1440, 60, 15],
    createdAt: now,
    updatedAt: now,
    completedAt: input.completedAt ?? null,
  }
}

export function validateTask(task: Pick<Task, 'title' | 'dueStart' | 'dueEnd'>): string[] {
  const errors: string[] = []
  if (!task.title || !task.title.trim()) errors.push('请输入任务名称')
  if (task.title.length > 200) errors.push('任务名称不能超过 200 个字符')
  if (task.dueStart && task.dueEnd && task.dueEnd < task.dueStart) {
    errors.push('结束日期不能早于开始日期')
  }
  return errors
}

export function statusOf(
  statusId: string,
  statuses: StatusDefinition[] = DEFAULT_STATUSES,
): StatusDefinition {
  return statuses.find((s) => s.id === statusId) ?? statuses[0] ?? DEFAULT_STATUSES[0]
}

export function isFinished(task: Task, statuses: StatusDefinition[] = DEFAULT_STATUSES): boolean {
  const category = statusOf(task.statusId, statuses).category
  return category === 'done' || category === 'cancelled'
}

export function stopsReminder(task: Task, statuses: StatusDefinition[] = DEFAULT_STATUSES): boolean {
  const category = statusOf(task.statusId, statuses).category
  return category !== 'active'
}

export function isOverdue(
  task: Task,
  statuses: StatusDefinition[] = DEFAULT_STATUSES,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (statusOf(task.statusId, statuses).category !== 'active') return false
  return !!task.dueEnd && task.dueEnd < today
}

export function dueLabel(task: Task): string {
  if (!task.dueStart && !task.dueEnd) return '未排期'
  if (task.dueStart && task.dueEnd && task.dueStart !== task.dueEnd) {
    return `${task.dueStart} → ${task.dueEnd}`
  }
  return task.dueEnd ?? task.dueStart ?? '未排期'
}
