<script setup lang="ts">
import { computed } from 'vue'
import { Check, TriangleAlert, XCircle, RefreshCw, Hourglass, CircleHelp, GitCompareArrows } from 'lucide-vue-next'
import { sourceStatus } from '../lib/status'

const props = defineProps<{ status?: string; compact?: boolean }>()
const meta = computed(() => sourceStatus(props.status))
const icon = computed(() => {
  switch (meta.value.key) {
    case 'synced': return Check
    case 'outofsync': return GitCompareArrows
    case 'syncing': return RefreshCw
    case 'syncedwitherror': return TriangleAlert
    case 'error': return XCircle
    case 'init': return Hourglass
    default: return CircleHelp
  }
})
</script>

<template>
  <span class="badge" :class="[`tone-${meta.tone}`, { compact }]" :title="meta.hint">
    <component :is="icon" :class="{ spin: meta.pulse && meta.key === 'syncing' }" />
    <template v-if="!compact">{{ meta.label }}</template>
  </span>
</template>

<style scoped>
.badge { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px 0 6px; border-radius: 11px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.badge.compact { padding: 0; width: 22px; justify-content: center; }
.badge svg { width: 13px; height: 13px; }
.tone-ok { color: var(--ok); background: var(--ok-bg); }
.tone-warn { color: var(--warn); background: var(--warn-bg); }
.tone-err { color: var(--err); background: var(--err-bg); }
.tone-busy { color: var(--busy); background: var(--busy-bg); }
.tone-idle { color: var(--text-2); background: var(--idle-bg); }
.spin { animation: spin 1.4s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
