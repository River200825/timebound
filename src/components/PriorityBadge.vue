<script setup lang="ts">
import { computed } from 'vue'
import { PRIORITY_META } from '@/domain/priority'
import type { Priority } from '@/domain/task'

const props = defineProps<{
  priority: Priority
  isOverride?: boolean
}>()

const meta = computed(() => PRIORITY_META[props.priority])
</script>

<template>
  <span class="priority-badge" :class="meta.className" :aria-label="`优先级 ${priority} ${meta.label}`">
    <strong>{{ priority }}</strong>
    <span class="label">{{ meta.label }}</span>
    <span v-if="isOverride" class="manual">手动</span>
  </span>
</template>

<style scoped>
.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: nowrap;
}
.label {
  font-size: 10.5px;
  opacity: 0.9;
}
.manual {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 16%, transparent);
}
</style>
