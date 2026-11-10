import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { projectRepo } from '@/data/db'
import { createProject, normalizeProject, type Project, type ProjectStatus } from '@/domain/project'

export const useProjectStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const selectedId = ref<string>('') // '' 表示「全部项目」

  const active = computed(() => projects.value.filter((p) => p.status === 'active'))
  const archived = computed(() => projects.value.filter((p) => p.status === 'archived'))

  async function load() {
    projects.value = (await projectRepo.all()).map((p) => normalizeProject(p))
  }

  async function create(input: { name: string; code?: string; color?: string; phases?: string[] }) {
    const project = createProject({
      name: input.name,
      code: input.code?.trim() || undefined,
      color: input.color,
      phases: input.phases,
    })
    await projectRepo.save(project)
    projects.value = [project, ...projects.value]
    return project
  }

  async function update(id: string, patch: Partial<Project>) {
    const index = projects.value.findIndex((p) => p.id === id)
    if (index < 0) throw new Error('项目不存在')
    const next = { ...projects.value[index], ...patch, updatedAt: new Date().toISOString() }
    await projectRepo.save(next)
    projects.value.splice(index, 1, next)
    return next
  }

  async function archive(id: string) {
    return update(id, { status: 'archived' })
  }

  async function remove(id: string) {
    await projectRepo.remove(id)
    projects.value = projects.value.filter((p) => p.id !== id)
    if (selectedId.value === id) selectedId.value = ''
  }

  function byId(id: string | null | undefined) {
    if (!id) return null
    return projects.value.find((p) => p.id === id) ?? null
  }

  return {
    projects,
    selectedId,
    active,
    archived,
    load,
    create,
    update,
    archive,
    remove,
    byId,
  }
})
