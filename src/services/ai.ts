import { z } from 'zod'
import type { AiSettings } from '@/domain/settings'
import { computePriority } from '@/domain/priority'
import type { Importance, OkrLink, Workload } from '@/domain/task'
import { uid } from '@/domain/task'
import type { KeyResult, Objective } from '@/domain/okr'
import { quarterRange } from '@/domain/okr'

export type AiErrorCode =
  | 'no-key'
  | 'auth'
  | 'rate'
  | 'network'
  | 'format'
  | 'unsupported'
  | 'unknown'

export class AiError extends Error {
  code: AiErrorCode
  status?: number

  constructor(message: string, code: AiErrorCode, status?: number) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.status = status
  }
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface TaskDraft {
  id: string
  title: string
  description: string
  dueStart: string | null
  dueEnd: string | null
  statusName: string
  importance: Importance
  urgency: Importance
  workload: Workload
  phase: string | null
  process: string | null
  owner: string | null
  participants: string[]
  confidence: number
  evidence: string
  priority: ReturnType<typeof computePriority>
  selected: boolean
  source: 'ai-chat' | 'okr-ai'
  sourceRef?: { sessionId?: string; messageId?: string; fileName?: string }
  projectId: string | null
  okrLinks: OkrLink[]
}

// GLM 等模型常把可选字段输出为 null（而不是省略），这里统一做 null-tolerant 解析
const textOrEmpty = z.string().nullish().transform((v) => v ?? '')
const textOrNull = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : null))
const listOrEmpty = z.array(z.string()).nullish().transform((v) => v ?? [])

const draftSchema = z.object({
  title: z.string().min(1),
  description: textOrEmpty,
  dueStart: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null))
    .default(null),
  dueEnd: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null))
    .default(null),
  status: textOrEmpty.transform((v) => v || '进行中'),
  importance: z
    .enum(['高', '中', '低'])
    .nullish()
    .transform((v) => v ?? '中'),
  urgency: z
    .enum(['高', '中', '低'])
    .nullish()
    .transform((v) => v ?? '中'),
  workload: z
    .enum(['大', '中', '小'])
    .nullish()
    .transform((v) => v ?? '中'),
  phase: textOrNull.default(null),
  process: textOrNull.default(null),
  owner: textOrNull.default(null),
  participants: listOrEmpty.default([]),
  confidence: z
    .number()
    .nullish()
    .transform((v) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : 0.7))
    .default(0.7),
  evidence: textOrEmpty,
  krIndex: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
})

const payloadSchema = z.object({
  tasks: z.array(draftSchema).min(1).max(20),
})

function endpoint(baseURL: string): string {
  const base = baseURL.trim().replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

function mapError(status: number, detail: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError('API Key 无效或没有权限，请到设置中检查', 'auth', status)
  }
  if (status === 429) {
    return new AiError('请求过于频繁或额度不足，请稍后重试', 'rate', status)
  }
  if (status === 404) {
    return new AiError('接口地址或模型不存在，请检查 Base URL 与模型名', 'unsupported', status)
  }
  if (status >= 500) {
    return new AiError('模型服务暂时不可用，请稍后重试', 'network', status)
  }
  return new AiError(detail || `请求失败（${status}）`, 'unknown', status)
}

export async function chatCompletion(
  config: AiSettings,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; onToken?: (delta: string, full: string) => void } = {},
): Promise<string> {
  if (!config.apiKey.trim()) {
    throw new AiError('尚未配置 API Key，请先到设置中填写', 'no-key')
  }
  if (!config.baseURL.trim()) {
    throw new AiError('尚未配置接口地址', 'unsupported')
  }

  const stream = Boolean(options.onToken)
  let response: Response
  try {
    response = await fetch(endpoint(config.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        stream,
      }),
      signal: options.signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new AiError(
      '网络请求失败。常见原因：该服务商不支持浏览器直连（智谱 / 通义千问 / Kimi 需要同源代理）。请改用 DeepSeek 或 OpenAI，或在 Nginx 配置代理后把 Base URL 指向同源路径（见 README「生产部署必须配置 AI 代理」）。',
      'network',
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw mapError(response.status, detail.slice(0, 300))
  }

  if (!stream) {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return json.choices?.[0]?.message?.content ?? ''
  }

  if (!response.body) throw new AiError('模型没有返回内容', 'format')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          options.onToken?.(delta, full)
        }
      } catch {
        // 忽略不完整的心跳/非 JSON 行
      }
    }
  }
  return full
}

export function toUserContent(text: string, images: string[] = []): string | ContentPart[] {
  if (!images.length) return text
  const parts: ContentPart[] = [{ type: 'text', text }]
  for (const url of images) parts.push({ type: 'image_url', image_url: { url } })
  return parts
}

function todayInfo(): string {
  const now = new Date()
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekday}）`
}

export interface AiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export type DecomposeResult =
  | { kind: 'question'; content: string }
  | { kind: 'tasks'; tasks: TaskDraft[] }

export function buildDecomposePrompt(): string {
  return `你是一个专业的任务规划助手。今天是 ${todayInfo()}，时区为本地时区。你的职责是把用户在聊天里讲的事情，拆成可执行的待办任务。

工作原则：
1. 如果信息足够，就直接输出拆解好的任务；
2. 如果信息不足，你只需要问**一个**最关键的问题——不要一次问很多，每轮只能追问一个。
3. 追问优先级：时间范围/截止日期 → 这件事要不要拆多条子任务 → 对谁 → 是否有具体交付物或里程碑。

输出格式（二选一，不要同时输出）：
A. 追问（还没能确定任务）：{"question":"你想先确认什么？"}
B. 拆解任务：{"tasks":[...]}

tasks 条目 JSON 请沿用任务抽取格式：
{"title":"任务名称","description":"说明","dueStart":"YYYY-MM-DD 或 null","dueEnd":"YYYY-MM-DD 或 null","status":"未启动","importance":"高|中|低","urgency":"高|中|低","workload":"大|中|小","phase":"阶段或 null","process":"流程或 null","owner":"主责人或 null","participants":[],"confidence":0.0,"evidence":"原文依据"}

硬性规则：
- 输出必须是单行 JSON，不要加 Markdown 代码块或解释。
- 相对日期（下周三、月底前、明天）必须换算成绝对日期；只有单日期时 dueStart 与 dueEnd 相同。
- 不要输出 priority 字段，优先级由系统计算。
- 一条任务只表达一件事；会议纪要/计划会议里的多个行动项要直接拆成多条，不需要用户再参与。
- 拆解出的任务要能直接执行；不要把原话原样塞回去变成一条任务。
- 每轮最多 11 条；宁可拆细，不要敷衍。`
}

function pickTaskJson(raw: unknown): { tasks?: unknown[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.tasks)) return { tasks: obj.tasks }
  if (obj.task && typeof obj.task === 'object') return { tasks: [obj.task] }
  return null
}

export async function decompose(
  config: AiSettings,
  history: AiHistoryMessage[],
): Promise<DecomposeResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildDecomposePrompt() },
  ]
  const trimmed = history.slice(-8)
  for (const message of trimmed) {
    messages.push({ role: message.role, content: message.content })
  }

  const answer = await chatCompletion(config, messages)

  let parsed: unknown
  try {
    parsed = parseJson(answer)
  } catch {
    parsed = null
  }

  if (parsed && typeof parsed === 'object' && typeof (parsed as { question?: unknown }).question === 'string') {
    return { kind: 'question', content: (parsed as { question: string }).question.trim() }
  }

  if (parsed) {
    try {
      const tasks = toDrafts(parsed, 'ai-chat', [], undefined)
      if (tasks.length) return { kind: 'tasks', tasks }
    } catch {
      // fallthrough
    }
  }

  const picked = pickTaskJson(parsed)
  if (picked?.tasks?.length) {
    try {
      const tasks = toDrafts({ tasks: picked.tasks }, 'ai-chat', [], undefined)
      return { kind: 'tasks', tasks }
    } catch {
      // fallthrough
    }
  }

  throw new AiError('AI 返回格式异常，请换一句话描述或更换模型', 'format')
}

export function buildExtractPrompt(): string {
  return `你是一个严谨的任务抽取助手。今天是 ${todayInfo()}，时区为本地时区。
从用户提供的文字、截图或文件中提取可执行任务，只输出严格 JSON，不要输出 Markdown 代码块或解释。

输出格式：
{"tasks":[{"title":"任务名称","description":"说明","dueStart":"YYYY-MM-DD 或 null","dueEnd":"YYYY-MM-DD 或 null","status":"进行中","importance":"高|中|低","urgency":"高|中|低","workload":"大|中|小","phase":"阶段或 null","process":"流程或 null","owner":"主责人或 null","participants":[],"confidence":0.0,"evidence":"原文依据"}]}

规则：
1. 相对日期（下周三、月底前、明天）必须换算成绝对日期；只有单日期时 dueStart 与 dueEnd 相同。
2. 无法判断的重要/紧急/工作量填“中”，并在 evidence 说明。
3. 一条任务只表达一件事；会议纪要中的多个行动项要拆成多条。
4. 不要输出 priority 字段，优先级由系统计算。
5. 最多输出 11 条；信息不足时宁缺毋滥。`
}

export function buildOkrPrompt(objective: Objective, krs: KeyResult[]): string {
  const range = quarterRange(objective.quarter)
  const krLines = krs
    .map(
      (kr, index) =>
        `${index}. ${kr.title}｜指标：${kr.metric}｜基线 ${kr.baseline} → 目标 ${kr.target}${kr.unit}｜截止 ${kr.dueDate ?? '季度末'}`,
    )
    .join('\n')
  return `你是 OKR 落地教练。今天是 ${todayInfo()}。
请把下面的季度 OKR 拆解成 3~8 条当季度可执行的任务，只输出严格 JSON。

O：${objective.title}
O 说明：${objective.description || '无'}
季度：${objective.quarter}（${range.start} ~ ${range.end}）
KR 列表：
${krLines || '（暂无 KR，请围绕 O 拆解）'}

输出格式：
{"tasks":[{"title":"任务名称","description":"说明","dueStart":"YYYY-MM-DD","dueEnd":"YYYY-MM-DD","importance":"高|中|低","urgency":"高|中|低","workload":"大|中|小","phase":"阶段","process":"流程","owner":"主责人或 null","participants":[],"confidence":0.8,"evidence":"对应哪个 KR","krIndex":0}]}

规则：
1. 所有日期必须落在 ${range.start} ~ ${range.end} 内。
2. 每条任务必须能直接执行，避免“提升能力”这类口号。
3. krIndex 表示对应 KR 的下标（从 0 开始）；无法对应时省略。
4. 不要输出 priority 字段。
5. 至少 3 条，最多 8 条。`
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] ?? text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('没有找到 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

export function toDrafts(
  raw: unknown,
  source: TaskDraft['source'],
  krs: KeyResult[] = [],
  objectiveId?: string,
): TaskDraft[] {
  const normalized =
    Array.isArray(raw) ? { tasks: raw } : (raw as { tasks?: unknown[]; task?: unknown })
  if (!Array.isArray((normalized as { tasks?: unknown[] }).tasks)) {
    const single = (normalized as { task?: unknown }).task
    if (single) return toDrafts([single], source, krs, objectiveId)
    throw new Error('缺少 tasks 数组')
  }
  const parsed = payloadSchema.parse(normalized)

  return parsed.tasks.map((item) => {
    const importance = item.importance as Importance
    const urgency = item.urgency as Importance
    const workload = item.workload as Workload
    const kr = typeof item.krIndex === 'number' ? krs[item.krIndex] : undefined
    const links: OkrLink[] = []
    if (objectiveId) links.push({ objectiveId })
    if (kr) links.push({ objectiveId: kr.objectiveId, keyResultId: kr.id })

    return {
      id: uid(),
      title: item.title.trim(),
      description: item.description ?? '',
      dueStart: item.dueStart ?? item.dueEnd ?? null,
      dueEnd: item.dueEnd ?? item.dueStart ?? null,
      statusName: item.status || '进行中',
      importance,
      urgency,
      workload,
      phase: item.phase ?? null,
      process: item.process ?? null,
      owner: item.owner ?? null,
      participants: item.participants ?? [],
      confidence: item.confidence ?? 0.7,
      evidence: item.evidence ?? '',
      priority: computePriority(importance, urgency),
      selected: true,
      source,
      projectId: null,
      okrLinks: links,
    }
  })
}

export async function extractTasks(
  config: AiSettings,
  text: string,
  images: string[] = [],
): Promise<TaskDraft[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildExtractPrompt() },
    { role: 'user', content: toUserContent(text || '请从图片中提取任务', images) },
  ]

  let answer = await chatCompletion(config, messages)
  try {
    return toDrafts(parseJson(answer), 'ai-chat')
  } catch {
    answer = await chatCompletion(config, [
      ...messages,
      { role: 'assistant', content: answer },
      { role: 'user', content: '上面的输出不是合法 JSON。请只输出符合格式的 JSON，不要任何解释。' },
    ])
    try {
      return toDrafts(parseJson(answer), 'ai-chat')
    } catch {
      throw new AiError('AI 返回格式异常，请重试或更换模型', 'format')
    }
  }
}

export async function decomposeOkr(
  config: AiSettings,
  objective: Objective,
  krs: KeyResult[],
): Promise<TaskDraft[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildOkrPrompt(objective, krs) },
    {
      role: 'user',
      content: `请拆解这个 OKR：${objective.title}。输出 JSON。`,
    },
  ]
  const answer = await chatCompletion(config, messages)
  try {
    return toDrafts(parseJson(answer), 'okr-ai', krs, objective.id)
  } catch {
    throw new AiError('AI 拆解结果格式异常，请重试或更换模型', 'format')
  }
}

export async function testConnection(config: AiSettings): Promise<string> {
  const answer = await chatCompletion(config, [
    { role: 'system', content: '你是连通性测试助手。' },
    { role: 'user', content: '只回复两个字：正常' },
  ])
  return answer.trim()
}

export function toDateInput(value: string | null): string {
  return value ?? ''
}
