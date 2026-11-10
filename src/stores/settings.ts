import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from '@/domain/settings'
import { DEFAULT_STATUSES, type StatusDefinition } from '@/domain/task'
import { clearAllData, settingsRepo, statusRepo } from '@/data/db'
import { testConnection } from '@/services/ai'
import { exportBackupFile, importBackupFile } from '@/data/backup'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  const statuses = ref<StatusDefinition[]>([...DEFAULT_STATUSES])
  const loaded = ref(false)

  const hasApiKey = computed(() => Boolean(settings.value.ai.apiKey.trim()))

  async function load() {
    const stored = await settingsRepo.get<Partial<AppSettings> | null>('settings', null)
    settings.value = mergeSettings(stored)
    const storedStatuses = await statusRepo.all()
    statuses.value = storedStatuses.length ? storedStatuses : [...DEFAULT_STATUSES]
    // 跨周重复展示已废弃：默认按截止日期归类，避免长任务在多周重复出现多行
    if (settings.value.repeatSpanning) {
      settings.value.repeatSpanning = false
      await save()
    }
    document.documentElement.dataset.theme = settings.value.theme
    loaded.value = true
  }

  async function save() {
    // settings.value 是 Vue 响应式代理，IndexedDB 无法 structured-clone 代理对象，
    // 先转为纯 JSON 对象再入库。
    const plain = JSON.parse(JSON.stringify(settings.value)) as AppSettings
    await settingsRepo.set('settings', plain)
  }

  async function update(patch: Partial<AppSettings>) {
    settings.value = mergeSettings({ ...settings.value, ...patch })
    await save()
    applyTheme()
  }

  async function updateAi(patch: Partial<AppSettings['ai']>) {
    settings.value.ai = { ...settings.value.ai, ...patch }
    await save()
  }

  async function updateReminder(patch: Partial<AppSettings['reminder']>) {
    settings.value.reminder = { ...settings.value.reminder, ...patch }
    await save()
  }

  function applyTheme() {
    document.documentElement.dataset.theme = settings.value.theme
  }

  async function toggleTheme() {
    await update({ theme: settings.value.theme === 'light' ? 'dark' : 'light' })
  }

  async function testAi() {
    return testConnection(settings.value.ai)
  }

  async function exportAll() {
    await exportBackupFile()
  }

  async function importAll(file: File, mode: 'merge' | 'replace' = 'merge') {
    const result = await importBackupFile(file, mode)
    await load()
    return result
  }

  async function resetAll() {
    await clearAllData()
    settings.value = { ...DEFAULT_SETTINGS }
    statuses.value = [...DEFAULT_STATUSES]
    await save()
  }

  return {
    settings,
    statuses,
    loaded,
    hasApiKey,
    load,
    save,
    update,
    updateAi,
    updateReminder,
    applyTheme,
    toggleTheme,
    testAi,
    exportAll,
    importAll,
    resetAll,
  }
})
