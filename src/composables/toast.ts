import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

const items = ref<ToastItem[]>([])
let seq = 0

function remove(id: number) {
  items.value = items.value.filter((item) => item.id !== id)
}

export function useToast() {
  function push(message: string, type: ToastType = 'info', duration = 3200) {
    const id = ++seq
    items.value.push({ id, type, message })
    window.setTimeout(() => remove(id), duration)
  }
  return { items, push, remove }
}
