import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/tasks' },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('@/views/TasksView.vue'),
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectsView.vue'),
    },
    {
      path: '/wbs',
      name: 'wbs',
      component: () => import('@/views/WbsView.vue'),
    },
    {
      path: '/okr',
      name: 'okr',
      component: () => import('@/views/OkrView.vue'),
    },
    {
      path: '/ai',
      name: 'ai',
      component: () => import('@/views/AiView.vue'),
    },
    {
      path: '/reminders',
      name: 'reminders',
      component: () => import('@/views/RemindersView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/tasks' },
  ],
})

export default router
