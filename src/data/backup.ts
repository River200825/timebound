import type { AppSettings } from '@/domain/settings'
import { mergeSettings } from '@/domain/settings'
import type { Project } from '@/domain/project'
import { DEFAULT_STATUSES, type StatusDefinition, type Task } from '@/domain/task'
import type { KeyResult, Objective } from '@/domain/okr'
import {
  clearAllData,
  db,
  okrRepo,
  projectRepo,
  settingsRepo,
  statusRepo,
  taskRepo,
  type SettingRecord,
} from './db'

export interface BackupPayload {
  version: 1 | 2
  exportedAt: string
  tasks: Task[]
  statuses: StatusDefinition[]
  objectives: Objective[]
  keyResults: KeyResult[]
  settings: SettingRecord[]
  projects?: Project[]
}

export async function buildBackup(): Promise<BackupPayload> {
  const settings = (await settingsRepo.all()).map((row) => {
    if (row.key !== 'settings') return row
    const value = mergeSettings(row.value as Partial<AppSettings>)
    return {
      ...row,
      value: { ...value, ai: { ...value.ai, apiKey: '' } },
    }
  })

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks: await db.tasks.toArray(),
    statuses: await db.statusDefs.toArray(),
    objectives: await okrRepo.allObjectives(),
    keyResults: await okrRepo.allKeyResults(),
    settings,
    projects: await db.projects.toArray(),
  }
}

export async function applyBackup(
  payload: BackupPayload,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ tasks: number; objectives: number }> {
  if (!payload || (payload.version !== 1 && payload.version !== 2) || !Array.isArray(payload.tasks)) {
    throw new Error('备份文件版本不兼容，请使用 timebound 导出的 JSON 文件')
  }

  if (mode === 'replace') {
    await clearAllData()
  }

  await taskRepo.bulkSave(payload.tasks)
  const statuses = payload.statuses?.length ? payload.statuses : DEFAULT_STATUSES
  await statusRepo.bulkSave(statuses)
  for (const objective of payload.objectives ?? []) {
    await okrRepo.saveObjective(objective)
  }
  await okrRepo.bulkSaveKeyResults(payload.keyResults ?? [])
  for (const p of payload.projects ?? []) {
    await projectRepo.save(p)
  }
  for (const row of payload.settings ?? []) {
    if (row.key === 'settings') {
      const value = mergeSettings(row.value as Partial<AppSettings>)
      await settingsRepo.set(row.key, { ...value, ai: { ...value.ai, apiKey: '' } })
    } else {
      await settingsRepo.set(row.key, row.value)
    }
  }

  return { tasks: payload.tasks.length, objectives: (payload.objectives ?? []).length }
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportBackupFile(): Promise<void> {
  const payload = await buildBackup()
  downloadText(
    `timebound-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
  )
}

export async function importBackupFile(
  file: File,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ tasks: number; objectives: number }> {
  const text = await file.text()
  let payload: BackupPayload
  try {
    payload = JSON.parse(text) as BackupPayload
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  return applyBackup(payload, mode)
}
