<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { GitBranch, Boxes, Layers, Container, Network, Server, Globe, HardDrive } from 'lucide-vue-next'
import type { ResourceData } from '../lib/resourceGraph'

const props = defineProps<NodeProps<ResourceData>>()
const icon = computed(() => ({ source: GitBranch, job: Boxes, group: Layers, alloc: Container, cluster: Network, server: Server, dc: Globe, node: HardDrive })[props.data.kind])
const kindLabel = computed(() => ({ source: 'Source', job: 'Job', group: 'Task group', alloc: 'Allocation', cluster: 'Cluster', server: 'Server', dc: 'Datacenter', node: 'Node' })[props.data.kind])
</script>

<template>
  <div class="res" :class="[`tone-${data.tone}`, { selected, pulse: data.pulse }]">
    <Handle type="target" :position="Position.Left" :connectable="false" />
    <div class="head">
      <span class="ico"><component :is="icon" /></span>
      <div class="titles">
        <div class="title" :title="data.title">{{ data.title }}</div>
        <div class="sub">{{ kindLabel }}<template v-if="data.subtitle"> · {{ data.subtitle }}</template></div>
      </div>
    </div>
    <div class="state"><i class="dot" /> {{ data.stateLabel }}</div>
    <ul v-if="data.tasks?.length" class="tasks">
      <li v-for="t in data.tasks" :key="t.name" :class="`tone-${t.tone}`">
        <i class="dot" /><span class="tn">{{ t.name }}</span><span class="ts">{{ t.state }}</span>
      </li>
    </ul>
    <Handle type="source" :position="Position.Right" :connectable="false" />
  </div>
</template>

<style scoped>
.res {
  width: 248px; padding: 10px 12px; border-radius: 10px;
  background: var(--surface); border: 1px solid var(--border);
  transition: border-color 0.15s var(--ease), background 0.15s var(--ease), box-shadow 0.2s var(--ease);
  cursor: pointer;
}
.res:hover { border-color: var(--border-strong); background: var(--surface-2); }
.res.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
.head { display: flex; gap: 9px; align-items: center; min-width: 0; }
.ico { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; background: var(--surface-3); color: var(--text-2); flex: none; }
.ico svg { width: 14px; height: 14px; }
.titles { min-width: 0; }
.title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; font-weight: 500; color: var(--tone); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); flex: none; }
.pulse .dot { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
.tone-ok { --tone: var(--ok); }
.tone-warn { --tone: var(--warn); }
.tone-err { --tone: var(--err); }
.tone-busy { --tone: var(--busy); }
.tone-idle { --tone: var(--idle); }
.tasks { list-style: none; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid var(--border); display: grid; gap: 4px; }
.tasks li { display: flex; align-items: center; gap: 6px; font-size: 12px; height: 16px; }
.tn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 11px; }
.ts { color: var(--tone); font-size: 11px; }
:deep(.vue-flow__handle) { width: 6px; height: 6px; background: var(--border-strong); border: none; }
</style>
