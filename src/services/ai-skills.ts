import type { Importance, Priority, StatusDefinition, Task } from '@/domain/task'
import { isOverdue, statusOf } from '@/domain/task'
import type { KeyResult, Objective } from '@/domain/okr'
import { computePriority } from '@/domain/priority'
import { currentQuarter } from '@/domain/okr'
import { uid } from '@/domain/task'
import type { OkrLink } from '@/domain/task'
import type { AiSettings } from '@/domain/settings'
import type { CustomSkill, SkillsSettings } from '@/domain/settings'
import {
  AiError,
  chatCompletion,
  decompose,
  toDrafts,
  type ChatMessage,
  type TaskDraft,
} from './ai'

export interface AiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export type SkillResult =
  | { kind: 'question'; content: string; skillId: string }
  | { kind: 'tasks'; tasks: TaskDraft[]; skillId: string }
  | { kind: 'reply'; content: string; skillId: string }

export interface SkillDef {
  id: string
  name: string
  description: string
  output: 'task' | 'reply'
  context?: 'task-summary' | 'okr'
  enabledByDefault: true
}

export const BUILTIN_SKILLS: SkillDef[] = [
  { id: 'decompose', name: '智能拆解', description: '一句话识别任务意图，追问后拆成可执行任务', output: 'task', enabledByDefault: true },
  { id: 'meeting', name: '会议纪要提取', description: '粘贴会议记录/纪要，拆出行动项（负责人/截止日）', output: 'task', enabledByDefault: true },
  { id: 'plan-week', name: '本周计划', description: '基于任务表 S 级/逾期/本周到期项，生成本周任务草稿', output: 'task', context: 'task-summary', enabledByDefault: true },
  { id: 'okr-breakdown', name: 'OKR 拆任务', description: '把季度 OKR 拆成当季可执行任务，草稿自动关联 OKR', output: 'task', context: 'okr', enabledByDefault: true },
  { id: 'risk-check', name: '逾期风险检查', description: '只读分析任务表，输出本周风险与建议（不改任务）', output: 'reply', context: 'task-summary', enabledByDefault: true },
]

export function builtinSkillName(id: string): string {
  return BUILTIN_SKILLS.find((s) => s.id === id)?.name ?? '自定义技能'
}

export function isBuiltinEnabled(settings: SkillsSettings, id: string): boolean {
  if (id === 'decompose') return true
  return settings.builtin[id] !== false
}

export function enabledBuiltins(settings: SkillsSettings): SkillDef[] {
  return BUILTIN_SKILLS.filter((s) => isBuiltinEnabled(settings, s.id))
}

export function skillDisplayName(settings: SkillsSettings, id: string): string {
  return settings.custom.find((s) => s.id === id)?.name ?? builtinSkillName(id)
}

const FALLBACK_SKILL = 'decompose'

const RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: 'meeting', pattern: /纪要|会议记录|会议笔记|会议总结|行动项|action items?/i },
  { id: 'plan-week', pattern: /周计划|本周计划|这周计划|本周(安排|排一下|排下|做什么|干什么)|这周(安排|排|做什么|干什么)|排.{0,4}(本周|这周)|本周计划/ },
  { id: 'okr-breakdown', pattern: /okr|关键结果|\bkr\b|目标.{0,8}拆|季度目标/i },
  { id: 'risk-check', pattern: /风险|逾期|来不及|赶得上|有没有问题|危险/ },
]

export function routeByKeywords(text: string, enabled: (id: string) => boolean): string | null {
  for (const rule of RULES) {
    if (enabled(rule.id) && rule.pattern.test(text)) return rule.id
  }
  return null
}

export interface RouteCandidate {
  id: string
  name: string
  description: string
}

export function routeCandidates(settings: SkillsSettings): RouteCandidate[] {
  const builtins = enabledBuiltins(settings).map((s) => ({ id: s.id, name: s.name, description: s.description }))
  const customs = settings.custom.map((s) => ({ id: s.id, name: s.name, description: s.prompt.slice(0, 80) }))
  return [...builtins, ...customs]
}

function routePrompt(candidates: RouteCandidate[]): string {
  const list = candidates.map((c) => `- ${c.id}｜${c.name}｜${c.description}`).join('\n')
  return `你是意图路由器。根据用户最新一句话，从下列技能中选最匹配的一个。
只输出严格 JSON：{"skill":"技能id"}，不要解释、不要 Markdown。

可选技能：
${list}

若没有明显匹配，输出 {"skill":"decompose"}。`
}

export async function routeSkill(
  config: AiSettings,
  text: string,
  settings: SkillsSettings,
): Promise<string> {
  const enabled = (id: string) =>
    isBuiltinEnabled(settings, id) || settings.custom.some((s) => s.id === id)
  const local = routeByKeywords(text, enabled)
  if (local) return local
  const candidates = routeCandidates(settings)
  try {
    const raw = await chatCompletion(config, [
      { role: 'system', content: routePrompt(candidates) },
      { role: 'user', content: text },
    ])
    const match = raw.match(/\{[\s\S]*?\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { skill?: unknown }
      const id = typeof parsed.skill === 'string' ? parsed.skill.trim() : ''
      if (id && enabled(id)) return id
    }
  } catch {
    // 判别失败 → 回落兜底技能
  }
  return FALLBACK_SKILL
}

function todayInfo(): string {
  const now = new Date()
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekday}）`
}

function thisWeekRange(): { start: string; end: string } {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 周一起算
  const startDate = new Date(now)
  startDate.setDate(now.getDate() - day)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(startDate), end: iso(endDate) }
}

function priorityRank(value: Priority): number {
  const order: Priority[] = ['S', 'A', 'B+', 'B', 'B-', 'C']
  return order.length - order.indexOf(value)
}

export function buildTaskSummary(tasks: Task[], statuses: StatusDefinition[]): string {
  const open = tasks.filter((t) => statusOf(t.statusId, statuses).category === 'active')
  const sorted = [...open].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
  const lines: string[] = []
  if (!open.length) return '（任务表里暂无进行中任务）'
  for (const t of sorted.slice(0, 15)) {
    const overdue = isOverdue(t, statuses) ? ' · 逾期' : ''
    const range = t.dueStart ? `${t.dueStart}${t.dueEnd && t.dueEnd !== t.dueStart ? `→${t.dueEnd}` : ''}` : '无截止'
    lines.push(`· ${t.title}｜截止 ${range}｜${t.priority} 级｜重要${t.importance}｜紧急${t.urgency}${overdue}`)
  }
  if (open.length > 15) lines.push(`…其余 ${open.length - 15} 条略`)
  return lines.join('\n').slice(0, 1500)
}

export interface ActiveOkrSnapshot {
  objectives: Objective[]
  /** 与 buildOkrBreakdownPrompt 中出现的全局 krIndex 一致 */
  keyResults: KeyResult[]
  summary: string
}

export function buildOkrSummary(
  objectives: Objective[],
  keyResults: KeyResult[],
): ActiveOkrSnapshot | null {
  const quarter = currentQuarter()
  const active = objectives.filter((o) => o.status === 'active' && o.quarter === quarter)
  if (!active.length) return null
  const orderedKrs: KeyResult[] = []
  const lines: string[] = []
  active.forEach((o, oi) => {
    lines.push(`O${oi}：${o.title}${o.description ? `（${o.description}）` : ''}`)
    const krs = keyResults.filter((kr) => kr.objectiveId === o.id)
    krs.forEach((kr) => {
      const globalIndex = orderedKrs.length
      orderedKrs.push(kr)
      lines.push(
        `  KR${globalIndex}：${kr.title}｜指标 ${kr.metric}｜${kr.baseline} → ${kr.target}${kr.unit}｜当前 ${kr.current}${kr.unit}｜截止 ${kr.dueDate ?? '季度末'}`,
      )
    })
  })
  return { objectives: active, keyResults: orderedKrs, summary: lines.join('\n').slice(0, 1600) }
}

const OUTPUT_CONTRACT = `输出格式（二选一，不要同时输出，不要输出 Markdown 代码块）：
A. 追问：{"question":"你想先确认什么？"}
B. 任务：{"tasks":[...]}

tasks 条目 JSON 格式：
{"title":"任务名称","description":"说明","dueStart":"YYYY-MM-DD 或 null","dueEnd":"YYYY-MM-DD 或 null","status":"未启动","importance":"高|中|低","urgency":"高|中|低","workload":"大|中|小","phase":"阶段或 null","process":"流程或 null","owner":"主责人或 null","participants":[],"confidence":0.0,"evidence":"原文依据"}

硬性规则：
- 输出必须是单行 JSON。
- 相对日期必须换算成绝对日期；只有单日期时 dueStart 与 dueEnd 相同。
- 不要输出 priority 字段。
- 一条任务只表达一件事。
- 每轮最多 10 条。`

const TASK_SKILL_HEADER = `你是一个专业的任务规划助手。今天是 ${todayInfo()}，时区为本地时区。
优先从用户的话里识别任务意图；信息不足时只追问一个最关键的问题，每轮最多一问。
追问优先级：时间范围/截止日期 → 是否拆子任务 → 对谁 → 交付物或里程碑。
`

export function buildMeetingPrompt(): string {
  return `${TASK_SKILL_HEADER}
用户会粘贴会议记录、纪要或聊天记录。把其中的「行动项」拆成可执行任务：明确负责人、截止日期、交付物。
没写明负责人/截止日期就按纪要里最合理的信息补全或标记 null；信息不足时先追问一个问题。
${OUTPUT_CONTRACT}`
}

export function buildPlanWeekPrompt(taskSummary: string): string {
  const range = thisWeekRange()
  return `${TASK_SKILL_HEADER}
用户希望安排本周计划。今天是 ${todayInfo()}，本周是 ${range.start} ~ ${range.end}。

下面是用户任务表中未完成项的摘要（优先级已排序）：
${taskSummary}

请基于这些任务，产出 3~7 条本周可执行的任务草稿，聚焦：S 级与逾期项、本周到期项。
所有日期必须落在本周范围内。不要制造与摘要重复的相同任务；可以拆分大任务。
${OUTPUT_CONTRACT}`
}

/** OKR 拆解：草稿额外带 krIndex（全局下标，对应 ActiveOkrSnapshot.keyResults 的下标） */
export function buildOkrBreakdownPrompt(snapshot: ActiveOkrSnapshot): string {
  return `${TASK_SKILL_HEADER}
用户希望把活跃的 OKR 拆成可执行任务。下面是用户的活跃 OKR 列表（含下标，来自当前季度）：

${snapshot.summary}

task 条目额外带一个字段 krIndex：表示对应 KR 的全局下标（0 起），例如 KR3 即 krIndex=3。
如果某条任务同时对应多个 KR，取最相关的一个。
如果用户没指明拆哪个目标，且有多个活跃目标，先追问一个问题确认目标；只有一个活跃目标时直接拆。
${OUTPUT_CONTRACT.replace('"evidence":"原文依据"}', '"evidence":"对应哪个 KR","krIndex":0}')}`
}

export function buildRiskCheckPrompt(taskSummary: string): string {
  return `你是一个任务风险分析师。今天是 ${todayInfo()}。
用户希望了解任务表的逾期/风险情况。请基于下面未完成任务摘要：

${taskSummary}

输出要求：纯文本建议，不要输出 JSON、不要创建任何任务。
先给一句总判断，再列出：1) 逾期且 S/A 级的任务；2) 本周到期且重要度高的任务；3) 工作量过大或集中风险的提示；4) 2~3 条可执行建议。
语言简洁，不超过 300 字。`
}

export function buildCustomSkillPrompt(skill: CustomSkill): string {
  return `${TASK_SKILL_HEADER}
用户自定义技能「${skill.name}」，按以下指令工作：
${skill.prompt}

${OUTPUT_CONTRACT}`
}

export interface SkillRunInput {
  skillId: string
  text: string
  config: AiSettings
  history: AiHistoryMessage[]
  skills: SkillsSettings
  /** 由调用方基于任务表构建的脱敏摘要（名称/日期/优先级，约 1500 字符） */
  tasksSummary?: string
  /** 调用方传入已过滤的活跃 OKR（与 buildOkrSummary 一致的口径） */
  activeOkr?: ActiveOkrSnapshot | null
}

function chatHistory(history: AiHistoryMessage[], text: string): ChatMessage[] {
  const messages: ChatMessage[] = history.slice(-8).map((m) => ({ role: m.role, content: m.content }))
  messages.push({ role: 'user', content: text })
  return messages
}

function parseQuestionOrTasks(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const block = fenced?.[1] ?? raw
  const start = block.indexOf('{')
  const end = block.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(block.slice(start, end + 1)) as {
        question?: unknown
        tasks?: unknown
      }
      if (typeof parsed.question === 'string' && parsed.question.trim()) {
        return { kind: 'question' as const, content: parsed.question.trim() }
      }
      return { kind: 'tasks' as const, raw: parsed }
    } catch {
      // fallthrough：把原文当作对话内容展示，避免用户看到死错误卡
    }
  }
  return { kind: 'question' as const, content: raw.trim() || 'AI 没有返回内容，请重试' }
}

function okrTasksToDrafts(raw: unknown, snapshot: ActiveOkrSnapshot): TaskDraft[] {
  const list = (raw as { tasks?: Array<Record<string, unknown>> })?.tasks ?? []
  return list.map((item) => {
    const importance = (item.importance as TaskDraft['importance']) ?? '中'
    const urgency = (item.urgency as TaskDraft['urgency']) ?? '中'
    const workload = (item.workload as TaskDraft['workload']) ?? '中'
    const krIndex = typeof item.krIndex === 'number' ? item.krIndex : undefined
    const kr = krIndex !== undefined ? snapshot.keyResults[krIndex] : undefined
    const links: OkrLink[] = []
    if (kr) links.push({ objectiveId: kr.objectiveId, keyResultId: kr.id })
    const dueStart = (item.dueStart as string | null) ?? (item.dueEnd as string | null) ?? null
    return {
      id: uid(),
      title: String(item.title ?? '').trim() || '未命名任务',
      description: String(item.description ?? ''),
      dueStart,
      dueEnd: (item.dueEnd as string | null) ?? dueStart,
      statusName: String(item.status ?? '未启动'),
      importance,
      urgency,
      workload,
      phase: (item.phase as string | null) ?? null,
      process: (item.process as string | null) ?? null,
      owner: (item.owner as string | null) ?? null,
      participants: Array.isArray(item.participants) ? (item.participants as string[]) : [],
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
      evidence: String(item.evidence ?? ''),
      priority: computePriority(importance, urgency),
      selected: true,
      source: 'ai-chat',
      projectId: null,
      okrLinks: links,
    }
  })
}

export async function runSkill(input: SkillRunInput): Promise<SkillResult> {
  const { skillId, text, config, history, skills } = input

  // 智能拆解：沿用既有的多轮追问/拆解实现
  if (skillId === 'decompose') {
    const result = await decompose(config, [...history, { role: 'user', content: text }])
    if (result.kind === 'question') return { kind: 'question', content: result.content, skillId }
    return { kind: 'tasks', tasks: result.tasks, skillId }
  }

  const builtin = BUILTIN_SKILLS.find((s) => s.id === skillId)
  const custom = builtin ? undefined : skills.custom.find((s) => s.id === skillId)
  if (!builtin && !custom) throw new AiError('技能不存在或已停用', 'unsupported')

  // 纯文本回复（如风险检查）：不产出任务
  if (builtin?.output === 'reply') {
    const taskSummary = input.tasksSummary ?? '（暂无任务数据）'
    const system = buildRiskCheckPrompt(taskSummary)
    const answer = await chatCompletion(config, [
      { role: 'system', content: system },
      ...history.slice(-4).map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
      { role: 'user', content: text },
    ])
    const content = answer.trim()
    if (!content) throw new AiError('AI 没有返回内容，请重试', 'format')
    return { kind: 'reply', content, skillId }
  }

  const messages = chatHistory(history, text)
  let systemPrompt: string
  if (skillId === 'meeting') systemPrompt = buildMeetingPrompt()
  else if (skillId === 'plan-week') systemPrompt = buildPlanWeekPrompt(input.tasksSummary ?? '（暂无任务数据）')
  else if (skillId === 'okr-breakdown') {
    const snapshot = input.activeOkr
    if (!snapshot) {
      return {
        kind: 'question',
        content: '当前季度还没有活跃的 OKR，请先在 OKR 页创建目标，然后再让我拆任务。',
        skillId,
      }
    }
    systemPrompt = buildOkrBreakdownPrompt(snapshot)
    const parsed = parseQuestionOrTasks(
      await chatCompletion(config, [{ role: 'system', content: systemPrompt }, ...messages]),
    )
    if (parsed.kind === 'question') return { kind: 'question', content: parsed.content, skillId }
    return { kind: 'tasks', tasks: okrTasksToDrafts(parsed.raw, snapshot), skillId }
  } else if (custom) systemPrompt = buildCustomSkillPrompt(custom)
  else systemPrompt = buildMeetingPrompt()

  const answer = await chatCompletion(config, [{ role: 'system', content: systemPrompt }, ...messages])
  const parsed = parseQuestionOrTasks(answer)
  if (parsed.kind === 'question') return { kind: 'question', content: parsed.content, skillId }
  try {
    return { kind: 'tasks', tasks: toDrafts(parsed.raw, 'ai-chat', [], undefined), skillId }
  } catch {
    // 模型输出了 tasks JSON 但字段不合规：降级为对话气泡，chip 仍显示技能名
    const content = answer.trim().slice(0, 800) || 'AI 返回格式异常，请换句话或到设置更换模型'
    return { kind: 'question', content, skillId }
  }
}
