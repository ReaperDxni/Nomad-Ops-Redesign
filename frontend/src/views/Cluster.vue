<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow, useVueFlow, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { RefreshCw, ExternalLink, X } from 'lucide-vue-next'
import ResourceNode from '../components/ResourceNode.vue'
import { NomadApi } from '../services/api'
import { sources } from '../stores/realtime'
import { buildClusterGraph, type ClusterAlloc, type NomadNode, type NomadServer, type ResourceData } from '../lib/resourceGraph'

const router = useRouter()
const nodesIn = ref<NomadNode[]>([])
const servers = ref<NomadServer[]>([])
const allocs = ref<ClusterAlloc[]>([])
const loaded = ref(false)
const error = ref(false)
const updatedAt = ref<Date>()
const nomadUI = ref<string>()
const selected = ref<{ id: string; data: ResourceData } | null>(null)

const { fitView, onNodeClick, onPaneClick } = useVueFlow()
onNodeClick(({ node }: NodeMouseEvent) => { selected.value = { id: node.id, data: node.data } })
onPaneClick(() => { selected.value = null })

const graph = computed(() => buildClusterGraph(nodesIn.value, servers.value, allocs.value))

const stats = computed(() => {
  const ready = nodesIn.value.filter((n) => n.Status === 'ready' && !n.Drain).length
  const alive = servers.value.filter((s) => s.Status === 'alive').length
  const running = allocs.value.filter((a) => a.ClientStatus === 'running').length
  return [
    ['Servers', `${alive}/${servers.value.length} alive`],
    ['Nodes', `${ready}/${nodesIn.value.length} ready`],
    ['Allocations', `${running}/${allocs.value.length} running`],
  ] as const
})

async function load() {
  const [n, m, a] = await Promise.allSettled([NomadApi.nodes(), NomadApi.members(), NomadApi.allAllocations()])
  error.value = n.status === 'rejected'
  const prev = graph.value.nodes.map((x) => x.id).join('|')
  if (n.status === 'fulfilled') nodesIn.value = n.value ?? []
  if (m.status === 'fulfilled') servers.value = m.value?.Members ?? []
  if (a.status === 'fulfilled') allocs.value = a.value ?? []
  loaded.value = true
  updatedAt.value = new Date()
  if (graph.value.nodes.map((x) => x.id).join('|') !== prev) setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50)
}

let timer: number | undefined
onMounted(() => {
  NomadApi.urls().then((u) => (nomadUI.value = u.ui)).catch(() => undefined)
  load()
  timer = window.setInterval(load, 10000)
})
onUnmounted(() => window.clearInterval(timer))

const owner = computed(() => {
  const d = selected.value?.data
  if (d?.kind !== 'alloc') return undefined
  const job = d.facts.find(([k]) => k === 'Job')?.[1]
  return sources.list.value.find((s) => job && s.status?.jobs && job in s.status.jobs)
})
const nomadLink = computed(() => {
  const d = selected.value?.data
  if (!nomadUI.value || !d) return undefined
  if (d.nomadPath) return `${nomadUI.value}/ui/jobs/${d.nomadPath}`
  if (d.kind === 'node') return `${nomadUI.value}/ui/clients/${d.facts.find(([k]) => k === 'ID')?.[1]}`
  return undefined
})
const minimapColor = (n: any) => ({ ok: '#4fd18b', warn: '#f0b24a', err: '#f2645f', busy: '#5aa9f5', idle: '#7d7d88' })[(n.data as ResourceData)?.tone] ?? '#7d7d88'
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Cluster</h1>
      <div class="stats"><span v-for="[k, v] in stats" :key="k"><span class="muted">{{ k }}</span> {{ v }}</span></div>
      <span class="grow" />
      <span v-if="updatedAt" class="muted">Updated {{ updatedAt.toLocaleTimeString() }}</span>
      <button class="btn" @click="load"><RefreshCw /> Refresh</button>
    </header>

    <div v-if="loaded && error" class="empty">
      <h3>Could not reach Nomad</h3>
      <p>Nomad Ops could not read the node list. Check the Nomad address and that its ACL token may read nodes.</p>
      <button class="btn" @click="load">Try again</button>
    </div>
    <div v-else-if="!loaded" class="empty muted">Loading cluster…</div>
    <div v-else class="tree">
      <VueFlow :nodes="graph.nodes" :edges="graph.edges" :nodes-draggable="false" :nodes-connectable="false" :min-zoom="0.2" :max-zoom="1.5" :fit-view-on-init="true">
        <template #node-resource="p"><ResourceNode v-bind="p" :selected="selected?.id === p.id" /></template>
        <Background :gap="22" :size="1.2" pattern-color="var(--border)" />
        <Controls position="bottom-left" :show-interactive="false" />
        <MiniMap pannable zoomable :node-color="minimapColor" mask-color="rgba(0,0,0,0.45)" />
      </VueFlow>

      <aside v-if="selected" class="panel" aria-label="Details">
        <header>
          <strong>{{ selected.data.title }}</strong>
          <button class="btn ghost icon sm" aria-label="Close details" @click="selected = null"><X /></button>
        </header>
        <div class="state" :class="`tone-${selected.data.tone}`"><i class="dot" /> {{ selected.data.stateLabel }}</div>
        <dl><template v-for="[k, v] in selected.data.facts" :key="k"><dt>{{ k }}</dt><dd class="mono">{{ v }}</dd></template></dl>
        <div class="acts">
          <button v-if="owner" class="btn" @click="router.push({ name: 'source', params: { id: owner.id } })">Open {{ owner.name }}</button>
          <a v-if="nomadLink" class="btn" :href="nomadLink" target="_blank" rel="noopener"><ExternalLink /> Open in Nomad</a>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
.stats { display: flex; gap: 18px; margin-left: 8px; }
.stats .muted { margin-right: 4px; }
.tree { position: relative; flex: 1; min-height: 0; }
.panel { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 320px; max-width: calc(100% - 24px); overflow: auto; display: grid; gap: 14px; align-content: start; padding: 14px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); animation: slide 0.22s var(--ease); z-index: 5; }
.panel > header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.panel strong { font-size: 14px; word-break: break-all; }
.panel dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.panel dt { color: var(--text-3); }
.panel dd { margin: 0; word-break: break-all; font-size: 12px; }
.state { display: flex; align-items: center; gap: 7px; color: var(--tone); font-weight: 500; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); }
.tone-ok { --tone: var(--ok); } .tone-warn { --tone: var(--warn); } .tone-err { --tone: var(--err); } .tone-busy { --tone: var(--busy); } .tone-idle { --tone: var(--idle); }
.acts { display: flex; gap: 8px; flex-wrap: wrap; }
.acts a.btn { text-decoration: none; }
@keyframes slide { from { opacity: 0; transform: translateX(10px); } }
</style>
