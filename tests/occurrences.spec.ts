import { describe, expect, it } from 'vitest'
import { computeOccurrences, isQuietHour, nextQuietEnd } from '@/domain/reminder'
import { createTask } from '@/domain/task'

function task(partial: Parameters<typeof createTask>[0]) {
  return createTask(partial)
}

describe('提醒发生时间', () => {
  it('无截止日期不产生提醒', () => {
    expect(computeOccurrences(task({ title: '无日期' }))).toHaveLength(0)
  })

  it('日期型截止默认 18:00 计算三档提前量', () => {
    // 截止 2026-08-10 18:00，默认 [1440, 60, 15]
    const occ = computeOccurrences(task({ title: '截止', dueEnd: '2026-08-10' }))
    expect(occ.map((o) => o.offsetMinutes)).toEqual([1440, 60, 15])
    const local = occ.map((o) => {
      const d = new Date(o.fireAt)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    })
    // 1 天前、1 小时前、15 分钟前（按本地时区）
    expect(local).toContain('2026-08-09 18:00')
    expect(local).toContain('2026-08-10 17:00')
    expect(local).toContain('2026-08-10 17:45')
  })

  it('尊重任务自身的 reminderOffsets 覆盖默认值', () => {
    const occ = computeOccurrences(
      task({ title: '自定义', dueEnd: '2026-08-10', reminderOffsets: [120] }),
    )
    expect(occ).toHaveLength(1)
    expect(occ[0].offsetMinutes).toBe(120)
  })

  it('去重键包含 taskId + offset + 版本', () => {
    const occ = computeOccurrences(task({ title: '版本', dueEnd: '2026-08-10', reminderOffsets: [15] }))
    // taskId 由 createTask 自动生成，去重键固定以 :<offset>:<版本> 结尾
    expect(occ[0].id.endsWith(':15:2026-08-10@18:00')).toBe(true)
    expect(occ[0].dueEndVersion).toBe('2026-08-10@18:00')
  })

  it('免打扰时段判定（跨午夜）', () => {
    const quiet = { enabled: true, start: '22:00', end: '08:00' }
    // 23:30 在免打扰内，09:00 不在
    expect(isQuietHour(new Date(2026, 0, 1, 23, 30), quiet)).toBe(true)
    expect(isQuietHour(new Date(2026, 0, 1, 9, 0), quiet)).toBe(false)
    // 未启用
    expect(isQuietHour(new Date(2026, 0, 1, 23, 30), { ...quiet, enabled: false })).toBe(false)
  })

  it('免打扰顺延到时段结束', () => {
    const quiet = { enabled: true, start: '22:00', end: '08:00' }
    const at = new Date(2026, 0, 1, 23, 0)
    const end = nextQuietEnd(at, quiet)
    expect(end.getHours()).toBe(8)
    expect(end.getDate()).toBe(2)
  })

  it('非免打扰时段 nextQuietEnd 原样返回', () => {
    const quiet = { enabled: true, start: '22:00', end: '08:00' }
    const at = new Date(2026, 0, 1, 12, 0)
    expect(nextQuietEnd(at, quiet).getTime()).toBe(at.getTime())
  })
})
