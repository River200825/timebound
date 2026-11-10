import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SKILLS,
  buildTaskSummary,
  isBuiltinEnabled,
  routeByKeywords,
  routeCandidates,
} from '@/services/ai-skills'
import type { SkillsSettings } from '@/domain/settings'
import type { Task, Importance, StatusDefinition } from '@/domain/task'
import { createTask, DEFAULT_STATUSES } from '@/domain/task'

const settings = (patch: Partial<SkillsSettings> = {}): SkillsSettings => ({
  builtin: {},
  custom: [],
  ...patch,
})
const allEnabled = () => true
const noneExceptDecompose = (id: string) => id === 'decompose'

describe('技能关键词路由', () => {
  it('会议纪要相关输入命中 meeting 技能', () => {
    expect(routeByKeywords('把今天的会议纪要整理成任务', allEnabled)).toBe('meeting')
    expect(routeByKeywords('会议记录里提到的行动项', allEnabled)).toBe('meeting')
  })

  it('周计划相关输入命中 plan-week 技能', () => {
    expect(routeByKeywords('帮我排这周的计划', allEnabled)).toBe('plan-week')
    expect(routeByKeywords('本周安排一下', allEnabled)).toBe('plan-week')
  })

  it('OKR 相关输入命中 okr-breakdown 技能', () => {
    expect(routeByKeywords('把 Q3 的 OKR 拆成任务', allEnabled)).toBe('okr-breakdown')
    expect(routeByKeywords('关键结果怎么落地', allEnabled)).toBe('okr-breakdown')
  })

  it('风险检查相关输入命中 risk-check 技能', () => {
    expect(routeByKeywords('这周有什么逾期风险', allEnabled)).toBe('risk-check')
    expect(routeByKeywords('晋级名单赶得上吗', allEnabled)).toBe('risk-check')
  })

  it('无法判断的输入返回 null（交给 LLM 路由）', () => {
    expect(routeByKeywords('下周三之前完成晋升名单梳理', allEnabled)).toBeNull()
  })

  it('技能被关闭时关键词不命中', () => {
    const enabled = (id: string) => id !== 'meeting'
    expect(routeByKeywords('把今天的会议纪要整理成任务', enabled)).toBeNull()
  })

  it('非 decompose 技能禁用后候选列表会去掉它', () => {
    const s = settings({ builtin: { meeting: false } })
    const ids = routeCandidates(s).map((c) => c.id)
    expect(ids).not.toContain('meeting')
    expect(ids).toContain('decompose')
  })

  it('decompose 始终启用，无法被 builtin 映射关闭', () => {
    const s = settings({ builtin: { decompose: false, 'risk-check': false } })
    expect(isBuiltinEnabled(s, 'decompose')).toBe(true)
    expect(isBuiltinEnabled(s, 'risk-check')).toBe(false)
    expect(routeCandidates(s).map((c) => c.id)).toContain('decompose')
  })

  it('自定义技能会出现在路由候选中', () => {
    const s = settings({
      custom: [
        { id: 'cs_test', name: '周报', prompt: '写周报', createdAt: '2026-11-10T00:00:00.000Z' },
      ],
    })
    const ids = routeCandidates(s).map((c) => c.id)
    expect(ids).toContain('cs_test')
  })
})

describe('任务摘要构建', () => {
  const statuses: StatusDefinition[] = DEFAULT_STATUSES
  const open: Task = createTask({ title: '紧急的事', importance: '高', urgency: '高', dueEnd: '2026-11-20' })
  const done: Task = createTask({ title: '已完成的事', statusId: 'done' })

  it('只含进行中任务，并带优先级与截止日期', () => {
    const summary = buildTaskSummary([open, done], statuses)
    expect(summary).toContain('紧急的事')
    expect(summary).not.toContain('已完成的事')
    expect(summary).toContain('截止 2026-11-20')
  })

  it('空任务表返回占位文案而不是空串', () => {
    expect(buildTaskSummary([], statuses)).toContain('暂无进行中')
  })
})
