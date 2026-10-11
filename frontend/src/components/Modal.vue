<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string; width?: number }>()
const emit = defineEmits<{ close: [] }>()

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="title" :style="{ width: (width ?? 520) + 'px' }">
        <header>
          <h2>{{ title }}</h2>
          <button class="btn ghost icon sm" aria-label="Close" @click="emit('close')"><X /></button>
        </header>
        <div class="body"><slot /></div>
        <footer v-if="$slots.footer"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 50; padding: 16px; animation: fade 0.15s var(--ease); }
.dialog { max-width: 100%; max-height: 90vh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); animation: rise 0.22s var(--ease); }
header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 12px 20px; border-bottom: 1px solid var(--border); }
h2 { font-size: 14px; font-weight: 600; }
.body { padding: 18px 20px; overflow: auto; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border); }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(0.985); } }
</style>
