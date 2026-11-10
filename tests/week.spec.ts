import { describe, expect, it } from 'vitest'
import { groupTasksByWeek, getWeekRange, isoWeekKey } from '@/domain/date'
import { createTask } from '@/domain/task'

function task(partial: Parameters<typeof createTask>[0]) {
  return createTask(partial)
}

describe('日期与周分组', () => {
  it('默认周一开始，周日归入上一周', () => {
    expect(getWeekRange('2026-08-09', 1)).toMatchObject({
      start: '2026-08-03',
      end: '2026-08-09',
      label: '2026年8月3日 - 9日',
    })
    expect(getWeekRange('2026-08-10', 1)).toMatchObject({
      start: '2026-08-10',
      end: '2026-08-16',
    })
  })

  it('可切换为周日开始，对齐原 Notion 截图', () => {
    expect(getWeekRange('2026-08-09', 0)).toMatchObject({
      start: '2026-08-09',
      end: '2026-08-15',
      label: '2026年8月9日 - 15日',
    })
  })

  it('跨年使用 ISO week-year', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
  })

  it('跨周任务在相交的每一周都出现', () => {
    const spanning = task({
      title: '跨周任务',
      dueStart: '2026-08-08',
      dueEnd: '2026-08-12',
    })
    const groups = groupTasksByWeek([spanning], { repeatSpanning: true, weekStartsOn: 1 })
    expect(groups.map((g) => g.start)).toEqual(['2026-08-10', '2026-08-03'])
  })

  it('关闭跨周重复时只按截止日归类', () => {
    const spanning = task({
      title: '跨周任务',
      dueStart: '2026-08-08',
      dueEnd: '2026-08-12',
    })
    const groups = groupTasksByWeek([spanning], { repeatSpanning: false, weekStartsOn: 1 })
    expect(groups).toHaveLength(1)
    expect(groups[0].start).toBe('2026-08-10')
  })

  it('无日期任务进入“未排期”且置底', () => {
    const dated = task({ title: '有日期', dueEnd: '2026-08-12' })
    const undated = task({ title: '无日期' })
    const groups = groupTasksByWeek([dated, undated], {
      repeatSpanning: false,
      weekStartsOn: 1,
    })
    expect(groups[groups.length - 1].key).toBe('unscheduled')
    expect(groups[groups.length - 1].tasks[0].title).toBe('无日期')
  })
})
