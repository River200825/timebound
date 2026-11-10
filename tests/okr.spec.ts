import { describe, expect, it } from 'vitest'
import {
  computeKrProgress,
  computeObjectiveProgress,
  currentQuarter,
  quarterRange,
  type KeyResult,
} from '@/domain/okr'
import { createTask } from '@/domain/task'

function kr(partial: Partial<KeyResult> = {}): KeyResult {
  return {
    id: 'kr1',
    objectiveId: 'o1',
    quarter: '2026-Q4',
    title: '完成招聘目标',
    metric: '入职人数',
    baseline: 0,
    target: 10,
    current: 0,
    unit: '人',
    dueDate: '2026-12-31',
    manualProgress: 0,
    mode: 'hybrid',
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

describe('OKR 进度', () => {
  it('季度工具', () => {
    expect(currentQuarter(new Date(2026, 9, 1))).toBe('2026-Q4')
    expect(quarterRange('2026-Q4')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(quarterRange('2026-Q1')).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('按工作量加权计算任务完成度（70/30）', () => {
    const a = createTask({
      title: '大任务',
      workload: '大',
      statusId: 'done',
      okrLinks: [{ keyResultId: 'kr1' }],
    })
    const b = createTask({
      title: '小任务',
      workload: '小',
      okrLinks: [{ keyResultId: 'kr1' }],
    })
    // 5/6*100*0.7 = 58.33 -> 58
    expect(computeKrProgress(kr(), [a, b])).toBe(58)
  })

  it('纯任务模式只按任务计算', () => {
    const a = createTask({
      title: '大任务',
      workload: '大',
      statusId: 'done',
      okrLinks: [{ keyResultId: 'kr1' }],
    })
    const b = createTask({
      title: '小任务',
      workload: '小',
      okrLinks: [{ keyResultId: 'kr1' }],
    })
    expect(computeKrProgress(kr({ mode: 'tasks' }), [a, b])).toBe(83)
  })

  it('纯手动模式忽略任务', () => {
    expect(computeKrProgress(kr({ mode: 'manual', manualProgress: 40 }), [])).toBe(40)
  })

  it('无关联任务时回退到手动进度', () => {
    expect(computeKrProgress(kr({ manualProgress: 40 }), [])).toBe(40)
  })

  it('O 进度为 KR 均值', () => {
    const krs = [kr({ id: 'kr1', manualProgress: 60, mode: 'manual' }), kr({ id: 'kr2', manualProgress: 20, mode: 'manual' })]
    expect(computeObjectiveProgress(krs, [])).toBe(40)
  })
})
