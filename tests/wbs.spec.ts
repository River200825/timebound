import { describe, expect, it } from 'vitest'
import { buildWbs, wbsRows } from '@/domain/wbs'
import type { StatusDefinition } from '@/domain/task'
import { createTask } from '@/domain/task'

const statuses: StatusDefinition[] = [
  { id: 'todo', name: '进行中', color: '#3A7BD5', category: 'active', isDefault: true },
  { id: 'done', name: '已完成', color: '#3E9B63', category: 'done' },
  { id: 'cancelled', name: '已取消', color: '#8A8F98', category: 'cancelled' },
  { id: 'postponed', name: '已延期', color: '#C79A16', category: 'postponed' },
]

function task(partial: Parameters<typeof createTask>[0]) {
  return createTask(partial)
}

describe('WBS 构建规则', () => {
  it('按 阶段 → 流程 两级分组并稳定排序', () => {
    const tasks = [
      task({ title: 'A-2', phase: 'P1', process: 'F2', order: 2 }),
      task({ title: 'A-1', phase: 'P1', process: 'F2', order: 1 }),
      task({ title: 'B-1', phase: 'P2', process: 'F1', order: 1 }),
    ]
    const groups = buildWbs(tasks, statuses)
    expect(groups.map((g) => g.phase)).toEqual(['P1', 'P2'])
    const p1 = groups.find((g) => g.phase === 'P1')!
    expect(p1.processes[0].name).toBe('F2')
    expect(p1.processes[0].tasks.map((t) => t.title)).toEqual(['A-1', 'A-2'])
  })

  it('未填阶段/流程归到默认分组', () => {
    const tasks = [task({ title: '无阶段' })]
    const groups = buildWbs(tasks, statuses)
    expect(groups[0].phase).toBe('未分组阶段')
    expect(groups[0].processes[0].name).toBe('未分组流程')
  })

  it('统计条包含总数/完成数/逾期数/工作量分布', () => {
    const past = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
    const future = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
    const tasks = [
      task({ title: '逾期进行中', workload: '大', dueEnd: past }),
      task({ title: '已完成', statusId: 'done', workload: '小', dueEnd: future }),
    ]
    const group = buildWbs(tasks, statuses)[0]
    expect(group.stats.total).toBe(2)
    expect(group.stats.done).toBe(1)
    expect(group.stats.overdue).toBe(1)
    expect(group.stats.workload).toEqual({ 大: 1, 中: 0, 小: 1 })
  })

  it('默认排除已取消任务，可通过开关包含', () => {
    const tasks = [
      task({ title: '正常', phase: 'P1' }),
      task({ title: '取消', phase: 'P1', statusId: 'cancelled' }),
    ]
    expect(buildWbs(tasks, statuses).find((g) => g.phase === 'P1')!.stats.total).toBe(1)
    expect(
      buildWbs(tasks, statuses, { includeCancelled: true }).find((g) => g.phase === 'P1')!
        .stats.total,
    ).toBe(2)
  })

  it('合并时间条取流程内最早开始与最晚结束', () => {
    const tasks = [
      task({ title: '早', phase: 'P1', process: 'F1', dueStart: '2026-01-05', dueEnd: '2026-01-10' }),
      task({ title: '晚', phase: 'P1', process: 'F1', dueStart: '2026-02-01', dueEnd: '2026-02-28' }),
    ]
    const proc = buildWbs(tasks, statuses).find((g) => g.phase === 'P1')!.processes[0]
    expect(proc.start).toBe('2026-01-05')
    expect(proc.end).toBe('2026-02-28')
  })

  it('无日期任务阶段时间条为 null', () => {
    const tasks = [task({ title: '无日期', phase: 'P1', process: 'F1' })]
    const group = buildWbs(tasks, statuses).find((g) => g.phase === 'P1')!
    expect(group.start).toBeNull()
    expect(group.end).toBeNull()
  })

  it('wbsRows 仅对流程首任务标记 processStart', () => {
    const tasks = [
      task({ title: 't1', phase: 'P1', process: 'F1', order: 1 }),
      task({ title: 't2', phase: 'P1', process: 'F1', order: 2 }),
    ]
    const rows = wbsRows(buildWbs(tasks, statuses))
    expect(rows.map((r) => r.processStart)).toEqual([1, 0])
  })
})
