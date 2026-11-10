import { describe, expect, it } from 'vitest'
import { computePriority, PRIORITY_ORDER, resolvePriority, sortByPriority } from '@/domain/priority'
import type { Importance, Priority } from '@/domain/task'

describe('优先级引擎', () => {
  it('9 种组合与用户 Notion 公式一致', () => {
    const cases: Array<[Importance, Importance, Priority]> = [
      ['高', '高', 'S'],
      ['高', '中', 'A'],
      ['高', '低', 'B'],
      ['中', '高', 'B+'],
      ['中', '中', 'B'],
      ['中', '低', 'B-'],
      ['低', '高', 'B+'],
      ['低', '中', 'B'],
      ['低', '低', 'C'],
    ]
    for (const [importance, urgency, expected] of cases) {
      expect(computePriority(importance, urgency)).toBe(expected)
    }
  })

  it('手动覆盖优先于自动计算，并可恢复', () => {
    const base = { importance: '高' as const, urgency: '高' as const }
    expect(resolvePriority(base)).toEqual({ value: 'S', isOverride: false })
    expect(resolvePriority({ ...base, priorityOverride: { value: 'C' } })).toEqual({
      value: 'C',
      isOverride: true,
    })
    expect(resolvePriority({ ...base, priorityOverride: null })).toEqual({
      value: 'S',
      isOverride: false,
    })
  })

  it('六档排序为 S → A → B+ → B → B- → C', () => {
    const items = PRIORITY_ORDER.map((priority, i) => ({
      id: String(i),
      priority,
      dueEnd: null,
    })).reverse()
    expect(sortByPriority(items).map((x) => x.priority)).toEqual(PRIORITY_ORDER)
  })

  it('同优先级按截止日期升序，无日期置后', () => {
    const items = [
      { id: 'a', priority: 'S' as const, dueEnd: null },
      { id: 'b', priority: 'S' as const, dueEnd: '2026-08-12' },
      { id: 'c', priority: 'S' as const, dueEnd: '2026-08-10' },
    ]
    expect(sortByPriority(items).map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})
