<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight } from 'lucide-vue-next'

const props = defineProps<{ value: unknown; name?: string; depth?: number }>()
const depth = computed(() => props.depth ?? 0)
const open = ref(depth.value < 3)
const isObj = computed(() => props.value !== null && typeof props.value === 'object')
const entries = computed(() => (isObj.value ? Object.entries(props.value as object) : []))
const summary = computed(() => (Array.isArray(props.value) ? `[${entries.value.length}]` : `{${entries.value.length}}`))
const tone = computed(() => (typeof props.value === 'string' ? 'str' : typeof props.value === 'number' ? 'num' : 'lit'))
</script>

<template>
  <div class="node">
    <template v-if="isObj">
      <button class="row toggle" @click="open = !open" :aria-expanded="open">
        <ChevronRight class="chev" :class="{ open }" />
        <span v-if="name !== undefined" class="key">{{ name }}</span>
        <span class="sum">{{ summary }}</span>
      </button>
      <div v-if="open" class="kids">
        <JsonTree v-for="[k, v] in entries" :key="k" :name="k" :value="v" :depth="depth + 1" />
      </div>
    </template>
    <div v-else class="row leaf">
      <span class="key">{{ name }}</span><span :class="tone">{{ typeof value === 'string' ? `"${value}"` : String(value) }}</span>
    </div>
  </div>
</template>

<style scoped>
.node { font: 12px/1.7 var(--mono); }
.row { display: flex; gap: 8px; align-items: center; }
.toggle { background: none; border: none; padding: 0; text-align: left; }
.toggle:hover .key { color: var(--accent-strong); }
.leaf { padding-left: 18px; }
.chev { width: 12px; height: 12px; color: var(--text-3); transition: transform 0.15s var(--ease); }
.chev.open { transform: rotate(90deg); }
.kids { margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--border); }
.key { color: var(--text-2); }
.key::after { content: ':'; color: var(--text-3); margin-right: 2px; }
.sum { color: var(--text-3); }
.str { color: var(--ok); word-break: break-all; }
.num { color: var(--busy); }
.lit { color: var(--warn); }
</style>
