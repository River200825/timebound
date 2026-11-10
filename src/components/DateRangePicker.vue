<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: { start: string | null; end: string | null }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { start: string | null; end: string | null }]
}>()

const single = ref(
  Boolean(props.modelValue.start && props.modelValue.end && props.modelValue.start === props.modelValue.end) ||
    (!props.modelValue.start && !props.modelValue.end),
)
const start = ref(props.modelValue.start ?? '')
const end = ref(props.modelValue.end ?? '')

watch(
  () => props.modelValue,
  (value) => {
    start.value = value.start ?? ''
    end.value = value.end ?? ''
    single.value = Boolean(value.start && value.end && value.start === value.end)
  },
  { deep: true },
)

const invalid = computed(() => Boolean(start.value && end.value && end.value < start.value))

function emitValue() {
  if (single.value) {
    const value = start.value || end.value || null
    start.value = value ?? ''
    end.value = value ?? ''
    emit('update:modelValue', { start: value, end: value })
  } else {
    // 始终派发原始值，由父级统一校验并决定是否阻止保存。
    emit('update:modelValue', {
      start: start.value || null,
      end: end.value || null,
    })
  }
}

function toggleSingle() {
  single.value = !single.value
  if (single.value && start.value) end.value = start.value
  emitValue()
}
</script>

<template>
  <div class="date-range">
    <label class="date-field">
      <span class="muted">{{ single ? '截止日期' : '开始' }}</span>
      <input v-model="start" type="date" class="field" @change="emitValue" />
    </label>
    <label v-if="!single" class="date-field">
      <span class="muted">结束</span>
      <input v-model="end" type="date" class="field" @change="emitValue" />
    </label>
    <button type="button" class="btn-ghost toggle" @click="toggleSingle">
      {{ single ? '改为区间' : '改为单日' }}
    </button>
    <p v-if="invalid" class="error">结束日期不能早于开始日期</p>
  </div>
</template>

<style scoped>
.date-range {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.date-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
}
.date-field .field {
  width: 140px;
}
.toggle {
  font-size: 11.5px;
  padding: 5px 7px;
}
.error {
  flex-basis: 100%;
  margin: 0;
  color: var(--danger);
  font-size: 11.5px;
}
</style>
