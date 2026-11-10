<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useProjectStore } from '@/stores/projects'
import { useTaskStore } from '@/stores/tasks'
import { useToast } from '@/composables/toast'
import { PROJECT_COLORS } from '@/domain/project'

const projectStore = useProjectStore()
const taskStore = useTaskStore()
const toast = useToast()

interface EditingProject {
  id: string
}

const showNew = ref(false)
const editing = ref<EditingProject | null>(null)
const phaseInput = ref('')

const form = reactive<{ name: string; code: string; color: string; phases: string[] }>({
  name: '',
  code: '',
  color: PROJECT_COLORS[0],
  phases: [],
})
const errors = reactive({ name: '' })

onMounted(() => {
  void projectStore.load()
  if (!taskStore.tasks.length) {
    void taskStore.load()
  }
})

function openNew() {
  form.name = ''
  form.code = ''
  form.color = PROJECT_COLORS[0]
  form.phases = []
  phaseInput.value = ''
  errors.name = ''
  editing.value = null
  showNew.value = true
}

function openEdit(project: { id: string; name: string; code?: string; color: string; phases?: string[] }) {
  form.name = project.name
  form.code = project.code ?? ''
  form.color = project.color
  form.phases = [...(project.phases ?? [])]
  phaseInput.value = ''
  errors.name = ''
  editing.value = { id: project.id }
  showNew.value = true
}

function closeModal() {
  showNew.value = false
  editing.value = null
  phaseInput.value = ''
}

function addPhase() {
  const value = phaseInput.value.trim()
  if (!value) return
  if (form.phases.includes(value)) {
    toast.push(`阶段「${value}」已存在`, 'info')
    return
  }
  form.phases.push(value)
  phaseInput.value = ''
}

function removePhase(index: number) {
  form.phases.splice(index, 1)
}

function movePhase(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= form.phases.length) return
  const [item] = form.phases.splice(index, 1)
  form.phases.splice(target, 0, item)
}

async function submit() {
  errors.name = ''
  if (!form.name.trim()) {
    errors.name = '请输入项目名称'
    return
  }
  if (editing.value) {
    try {
      await projectStore.update(editing.value.id, {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        color: form.color,
        phases: [...form.phases],
      })
      toast.push('项目已更新', 'success')
      closeModal()
    } catch (error) {
      toast.push(error instanceof Error ? error.message : '更新失败', 'error')
    }
    return
  }
  try {
    await projectStore.create({
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      color: form.color,
      phases: [...form.phases],
    })
    toast.push('项目已创建', 'success')
    closeModal()
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

async function toggleArchive(project: { id: string; name: string; status: 'active' | 'archived' }) {
  try {
    await projectStore.update(project.id, {
      status: project.status === 'active' ? 'archived' : 'active',
    })
    toast.push(project.status === 'active' ? '已归档项目' : '已恢复项目', 'info')
  } catch (error) {
    toast.push(error instanceof Error ? error.message : '操作失败', 'error')
  }
}

async function confirmRemove(project: { id: string; name: string }) {
  if (!confirm(`确定删除项目「${project.name}」？`)) return
  await projectStore.remove(project.id)
  toast.push('已删除项目', 'info')
}

function taskCountOf(projectId: string) {
  return taskStore.tasks.filter((t) => t.projectId === projectId).length
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>项目</h1>
        <p class="muted">项目用于归集同一批目标下面的待办，WBS / 时间轴按项目查看。</p>
      </div>
      <button class="btn-primary" @click="openNew">+ 新建项目</button>
    </header>

    <div v-if="!projectStore.projects.length" class="empty card">
      <h3>还没有项目</h3>
      <p class="muted">创建一个项目，把归属同一批目标的任务都归集到这里。</p>
      <button class="btn-primary" @click="openNew">+ 新建项目</button>
    </div>

    <div v-else class="project-grid">
      <article
        v-for="project in projectStore.projects"
        :key="project.id"
        class="project-card card"
      >
        <header class="project-head">
          <div class="project-title">
            <span class="color" :style="{ background: project.color }" />
            <h3>{{ project.name }}</h3>
            <span v-if="project.code" class="code">{{ project.code }}</span>
          </div>
          <span class="status" :class="project.status">{{ project.status === 'active' ? '进行中' : '已归档' }}</span>
        </header>
        <div class="project-meta">
          <span>{{ taskCountOf(project.id) }} 条任务</span>
        </div>
        <div v-if="project.phases?.length" class="project-phases">
          <span v-for="phase in project.phases" :key="phase" class="phase-tag">{{ phase }}</span>
        </div>
        <div class="project-actions">
          <button class="btn-outline" @click="openEdit(project)">编辑</button>
          <button class="btn-ghost" @click="toggleArchive(project)">{{ project.status === 'active' ? '归档' : '恢复' }}</button>
          <button class="btn-ghost danger-text" @click="confirmRemove(project)">删除</button>
        </div>
      </article>
    </div>

    <div v-if="showNew" class="modal-mask" @click.self="closeModal">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal-head">
          <h3>{{ editing ? '编辑项目' : '新建项目' }}</h3>
          <button class="btn-ghost" aria-label="关闭" @click="closeModal">✕</button>
        </header>
        <div class="modal-body">
          <div class="form-grid">
            <label class="block">
              <span>项目名称 <i class="muted">*</i></span>
              <input v-model="form.name" class="field" :class="{ 'field-error': errors.name }" placeholder="例如：2027 晋级礼盒" />
              <p v-if="errors.name" class="field-error-text">{{ errors.name }}</p>
            </label>
            <label class="block">
              <span>项目代码</span>
              <input v-model="form.code" class="field" placeholder="例如：PRJ-2026-Q2" />
            </label>
            <div class="block">
              <span>项目颜色</span>
              <div class="color-row">
                <button
                  v-for="color in PROJECT_COLORS"
                  :key="color"
                  class="color-dot"
                  :class="{ active: form.color === color }"
                  :style="{ background: color }"
                  type="button"
                  @click="form.color = color"
                  :aria-label="`选 ${color}`"
                />
              </div>
            </div>
            <div class="block">
              <span>阶段 <i class="muted">（可选；新建任务选此项目后自动带出）</i></span>
              <div class="phase-row">
                <input
                  v-model="phaseInput"
                  class="field"
                  placeholder="例如：准备阶段 / 执行阶段 / 收尾阶段"
                  @keydown.enter.prevent="addPhase"
                />
                <button type="button" class="btn-outline" @click="addPhase">添加</button>
              </div>
              <div v-if="form.phases.length" class="phase-chips">
                <span v-for="(phase, index) in form.phases" :key="phase" class="phase-chip">
                  <span class="phase-name">{{ phase }}</span>
                  <button type="button" class="phase-op" title="上移" @click="movePhase(index, -1)">↑</button>
                  <button type="button" class="phase-op" title="下移" @click="movePhase(index, 1)">↓</button>
                  <button type="button" class="phase-op danger" title="删除" @click="removePhase(index)">×</button>
                </span>
              </div>
              <p v-else class="muted hint">暂无阶段，添加后任务创建时可下拉选择。</p>
            </div>
          </div>
        </div>
        <footer class="modal-foot">
          <button class="btn-outline" @click="closeModal">取消</button>
          <button class="btn-primary" @click="submit">{{ editing ? '保存' : '创建' }}</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.project-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.project-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.project-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.project-title h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.code {
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 5px;
}
.status {
  font-size: 11px;
  color: var(--brand);
  background: var(--brand-bg);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
.status.archived {
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.project-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.project-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.empty {
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty h3 {
  margin: 0;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: grid;
  place-items: center;
  z-index: 60;
}
.modal {
  width: min(460px, 94vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  margin: 0;
  font-size: 15px;
}
.modal-body {
  padding: 16px;
}
.modal-foot {
  padding: 12px 16px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.field-error {
  border-color: var(--danger) !important;
}
.field-error-text {
  margin: 0;
  color: var(--danger);
  font-size: 11.5px;
}
.color-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  outline: none;
}
.color-dot.active {
  border-color: var(--surface);
  box-shadow: 0 0 0 2px var(--brand);
}
.phase-row {
  display: flex;
  gap: 6px;
}
.phase-row .field {
  flex: 1;
  min-width: 0;
}
.phase-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.phase-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 4px 2px 8px;
  font-size: 11.5px;
}
.phase-op {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 4px;
  width: 18px;
  height: 18px;
  font-size: 11px;
  line-height: 1;
}
.phase-op:hover {
  background: var(--border);
  color: var(--text);
}
.phase-op.danger:hover {
  color: var(--danger);
}
.project-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.phase-tag {
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: var(--text-muted);
}
</style>
