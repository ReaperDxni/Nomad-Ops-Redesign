<script setup lang="ts">
import { CircleCheck, CircleAlert } from 'lucide-vue-next'
import { toast, dismiss } from '../stores/toast'
</script>

<template>
  <div class="stack" aria-live="polite">
    <TransitionGroup name="t">
      <button v-for="t in toast.state.items" :key="t.id" class="toast" :class="t.kind" @click="dismiss(t.id)">
        <component :is="t.kind === 'ok' ? CircleCheck : CircleAlert" />
        <span>{{ t.text }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.stack { position: fixed; right: 16px; bottom: 16px; display: grid; gap: 8px; z-index: 100; }
.toast { display: flex; gap: 10px; align-items: center; max-width: 380px; padding: 10px 14px; text-align: left; background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-pop); }
.toast svg { width: 16px; height: 16px; flex: none; }
.toast.ok svg { color: var(--ok); }
.toast.err svg { color: var(--err); }
.t-enter-active, .t-leave-active { transition: all 0.25s var(--ease); }
.t-enter-from, .t-leave-to { opacity: 0; transform: translateY(8px); }
</style>
