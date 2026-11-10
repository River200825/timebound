import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'virtual:uno.css'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.vue'
import router from './router'
import { initDb } from './data/db'
import { useSettingsStore } from './stores/settings'
import { useTaskStore } from './stores/tasks'
import { useOkrStore } from './stores/okr'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia).use(router)

  await initDb()
  await useSettingsStore(pinia).load()
  await useTaskStore(pinia).load()
  await useOkrStore(pinia).load()

  await router.isReady()
  app.mount('#app')
}

void bootstrap()
