<script setup lang="ts">
defineProps<{ options: Array<{ id: string; label: string }>; empty?: string }>()
const model = defineModel<string[]>({ default: () => [] })

function toggle(id: string) {
  model.value = model.value.includes(id) ? model.value.filter((x) => x !== id) : [...model.value, id]
}
</script>

<template>
  <div class="list">
    <label v-for="o in options" :key="o.id" class="check">
      <input type="checkbox" :checked="model.includes(o.id)" @change="toggle(o.id)" />
      {{ o.label }}
    </label>
    <p v-if="!options.length" class="muted">{{ empty ?? 'Nothing to choose from yet.' }}</p>
  </div>
</template>

<style scoped>
.list { display: grid; gap: 8px; max-height: 200px; overflow: auto; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
</style>
