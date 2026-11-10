import type { StatusDefinition, Task } from '@/domain/task'
import { statusOf } from '@/domain/task'
import { buildWbs, type WbsGroup } from '@/domain/wbs'

function escapeCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return `\ufeff${lines.join('\r\n')}`
}

export function tasksToCsv(tasks: Task[], statuses: StatusDefinition[]): string {
  const headers = [
    '任务名称',
    '截止日期',
    '状态',
    '重要程度',
    '紧急程度',
    '工作量',
    '优先级',
    '阶段',
    '流程',
    '主责人',
    '参与人',
    '说明',
  ]
  const rows = tasks.map((task) => [
    task.title,
    task.dueStart && task.dueEnd && task.dueStart !== task.dueEnd
      ? `${task.dueStart} → ${task.dueEnd}`
      : (task.dueEnd ?? task.dueStart ?? ''),
    statusOf(task.statusId, statuses).name,
    task.importance,
    task.urgency,
    task.workload,
    task.priority,
    task.phase ?? '',
    task.process ?? '',
    task.owner ?? '',
    task.participants.join('/'),
    task.description,
  ])
  return toCsv(headers, rows)
}

export function wbsToCsv(groups: WbsGroup[], statuses: StatusDefinition[]): string {
  const headers = [
    '阶段',
    '流程',
    'NO',
    '任务项',
    '说明',
    '启动时间',
    '完成时间',
    '主责人',
    '参与人',
    '完成情况',
  ]
  const rows: unknown[][] = []
  let no = 1
  for (const group of groups) {
    for (const proc of group.processes) {
      for (const task of proc.tasks) {
        rows.push([
          group.phase,
          proc.name,
          no++,
          task.title,
          task.description,
          task.dueStart ?? '',
          task.dueEnd ?? '',
          task.owner ?? '',
          task.participants.join('/'),
          statusOf(task.statusId, statuses).name,
        ])
      }
    }
  }
  return toCsv(headers, rows)
}

export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportWbsCsv(tasks: Task[], statuses: StatusDefinition[]): Promise<void> {
  const groups = buildWbs(tasks, statuses)
  downloadText(`timebound-wbs-${new Date().toISOString().slice(0, 10)}.csv`, wbsToCsv(groups, statuses))
}

export async function exportPng(node: HTMLElement, filename = 'timebound.png'): Promise<void> {
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(node, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    pixelRatio: 2,
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
