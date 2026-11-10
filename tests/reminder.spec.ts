import { describe, expect, it } from 'vitest'
import { computeOccurrences, isQuietHour, nextQuietEnd, offsetLabel } from '@/domain/reminder'
import { createTask } from '@/domain/task'

describe('提醒发生时间', () => {
  it('日期型截止默认 18:00，生成 1 天/1 小时/15 分钟三档', () => {
    const task = createTask({ title: '截止提醒', dueEnd: '2026-08-12' })
    const list = computeOccurrences(task, [1440, 60, 15], '18:00')
    expect(list).toHaveLength(3)
    expect(list.map((x) => x.label)).toEqual(['1 天前', '1 小时前', '15 分钟前'])
    for (const item of list) {
      expect(item.dueAt - item.fireAt).toBe(item.offsetMinutes * 60_000)
      const due = new Date(item.dueAt)
      expect(due.getHours()).toBe(18)
      expect(due.getMinutes()).toBe(0)
    }
  })

  it('无截止日期不产生提醒', () => {
    const task = createTask({ title: '无日期' })
    expect(computeOccurrences(task)).toEqual([])
  })

  it('改期后 dueEndVersion 变化，旧提醒自然失效', () => {
    const a = createTask({ title: 'A', dueEnd: '2026-08-12' })
    const b = { ...a, dueEnd: '2026-08-13' }
    expect(computeOccurrences(a)[0].dueEndVersion).not.toBe(computeOccurrences(b)[0].dueEndVersion)
  })

  it('免打扰跨午夜判断与顺延', () => {
    const quiet = { enabled: true, start: '22:00', end: '08:00' }
    expect(isQuietHour(new Date(2026, 7, 12, 23, 0), quiet)).toBe(true)
    expect(isQuietHour(new Date(2026, 7, 12, 7, 59), quiet)).toBe(true)
    expect(isQuietHour(new Date(2026, 7, 12, 8, 0), quiet)).toBe(false)
    expect(isQuietHour(new Date(2026, 7, 12, 12, 0), quiet)).toBe(false)
    const next = nextQuietEnd(new Date(2026, 7, 12, 23, 0), quiet)
    expect(next.getDate()).toBe(13)
    expect(next.getHours()).toBe(8)
  })

  it('提前量文案', () => {
    expect(offsetLabel(1440)).toBe('1 天前')
    expect(offsetLabel(60)).toBe('1 小时前')
    expect(offsetLabel(15)).toBe('15 分钟前')
  })
})
