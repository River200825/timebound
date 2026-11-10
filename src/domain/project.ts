export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  name: string
  code?: string
  color: string
  status: ProjectStatus
  /** 该项目已有阶段（有序），用于任务创建时下拉选择 */
  phases: string[]
  createdAt: string
  updatedAt: string
}

export const PROJECT_COLORS: string[] = [
  '#2486ff',
  '#3e9b63',
  '#c25618',
  '#8a6d00',
  '#6b7280',
  '#7c3aed',
  '#e11d48',
  '#0891b2',
]

export function normalizeProject(raw: Partial<Project> & Pick<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  return {
    code: undefined,
    color: PROJECT_COLORS[0],
    status: 'active',
    ...raw,
    name: raw.name?.trim() || '未命名项目',
    phases: Array.isArray(raw.phases) ? raw.phases.map((p) => String(p).trim()).filter(Boolean) : [],
  }
}

export function createProject(input: Partial<Project> & { name: string }): Project {
  const now = new Date().toISOString()
  return normalizeProject({
    id: crypto?.randomUUID?.() ?? `prj_${now.slice(0, 10)}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    code: input.code?.trim() || undefined,
    color: input.color || PROJECT_COLORS[0],
    status: input.status || 'active',
    phases: Array.isArray(input.phases) ? input.phases : [],
    createdAt: now,
    updatedAt: now,
  })
}
