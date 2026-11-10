<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  width?: string
  subtitle?: string
}>()

defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask" @click.self="$emit('close')">
      <div class="modal" :style="{ maxWidth: width ?? '720px' }" role="dialog" aria-modal="true">
        <header class="modal-head">
          <div>
            <h3>{{ title }}</h3>
            <p v-if="subtitle" class="muted">{{ subtitle }}</p>
          </div>
          <button class="btn-ghost" aria-label="关闭" @click="$emit('close')">✕</button>
        </header>
        <div class="modal-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  display: grid;
  place-items: center;
  padding: 24px;
  z-index: 80;
}
.modal {
  width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
}
.modal-head p {
  margin: 3px 0 0;
  font-size: 12px;
}
.modal-body {
  padding: 16px 18px;
  overflow: auto;
}
.modal-foot {
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: var(--surface-2);
}
</style>
