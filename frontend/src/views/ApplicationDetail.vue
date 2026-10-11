<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow, useVueFlow, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ArrowLeft, RefreshCw, Pause, Play, Trash2, Users, ExternalLink, X, FolderGit2, ScrollText, GitBranch, Boxes, Layers, Container, Copy, GitCompareArrows } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import ResourceNode from '../components/ResourceNode.vue'
import JsonTree from '../components/JsonTree.vue'
import Modal from '../components/Modal.vue'
import LogsDrawer from '../components/LogsDrawer.vue'
import CheckList from '../components/CheckList.vue'
import { keys, sources, teams, vaultTokens } from '../stores/realtime'
import { NomadApi, SourceApi } from '../services/api'
import { buildResourceGraph, type LogTarget, type ResourceData } from '../lib/resourceGraph'
import { firstId, type Allocation } from '../lib/types'
import { timeAgo } from '../lib/status'
import { toast } from '../stores/toast'
import { copyText } from '../lib/clipboard'

const props = defineProps<{ id: string }>()
const router = useRouter()
const source = computed(() => sources.map.value[props.id])

const tab = ref<'tree' | 'diff' | 'details'>('tree')
const allocs = ref<Record<string, Allocation[] | undefined>>({})
const allocError = ref(false)
const nomadUI = ref<string>()
const selected = ref<{ id: string; data: ResourceData } | null>(null)
const editingTeams = ref(false)
const teamDraft = ref<string[]>([])
const confirmDelete = ref(false)
const logs = ref<{ targets: LogTarget[]; start: number; title: string } | null>(null)

const KIND: Record<string, { icon: unknown; label: string }> = {
  source: { icon: GitBranch, label: 'Source' }, job: { icon: Boxes, label: 'Job' },
  group: { icon: Layers, label: 'Task group' }, alloc: { icon: Container, label: 'Allocation' },
}
async function copyValue(v: string) {
  if (await copyText(v)) toast.success('Copied')
  else toast.error('Could not copy to the clipboard')
}
const allocCount = (data: ResourceData) => new Set((data.logTargets ?? []).map((t) => t.allocId)).size

function openLogs(data: ResourceData, task?: string) {
  const targets = data.logTargets ?? []
  const start = task ? Math.max(0, targets.findIndex((t) => t.task === task)) : 0
  logs.value = { targets, start, title: data.title }
}

const { fitView, onNodeClick, onPaneClick } = useVueFlow()
onNodeClick(({ node }: NodeMouseEvent) => { selected.value = { id: node.id, data: node.data } })
onPaneClick(() => { selected.value = null })

const graph = computed(() => (source.value ? buildResourceGraph(source.value, allocs.value) : { nodes: [], edges: [] }))
const nodes = computed(() => graph.value.nodes)
const edges = computed(() => graph.value.edges)

let timer: number | undefined
async function loadAllocs() {
  const s = source.value
  if (!s?.status?.jobs) return
  const entries = await Promise.allSettled(
    Object.entries(s.status.jobs).map(async ([name, job]) => [name, await NomadApi.allocations(name, job.namespace || s.namespace || 'default')] as const),
  )
  allocError.value = entries.some((e) => e.status === 'rejected')
  const next: Record<string, Allocation[] | undefined> = { ...allocs.value }
  for (const e of entries) if (e.status === 'fulfilled') next[e.value[0]] = e.value[1] ?? []
  allocs.value = next
}

onMounted(() => {
  NomadApi.urls().then((u) => (nomadUI.value = u.ui)).catch(() => undefined)
  loadAllocs()
  timer = window.setInterval(loadAllocs, 8000)
})
onUnmounted(() => window.clearInterval(timer))

// Refit when the shape of the tree changes (new jobs or allocations), not on every status refresh.
const shape = computed(() => nodes.value.map((n) => n.id).join('|'))
watch(shape, () => setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50))
watch(tab, (t) => { if (t === 'tree') setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50) })

const deployKeyName = computed(() => keys.list.value.find((k) => k.id === firstId(source.value?.deployKey))?.name)
const vaultTokenName = computed(() => vaultTokens.list.value.find((k) => k.id === firstId(source.value?.vaultToken))?.name)
const sourceTeams = computed(() => (source.value?.teams ?? []).map((id) => teams.map.value[id]?.name ?? 'Unknown team'))
const teamOptions = computed(() => teams.list.value.map((t) => ({ id: t.id, label: t.name })))

function clean(v: any): any {
  if (Array.isArray(v)) return v.map(clean).filter((x) => x !== undefined)
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === null || val === undefined || (k === 'Type' && val === 'None')) continue
      out[k] = clean(val)
    }
    return out
  }
  return v
}
const diffs = computed(() =>
  Object.entries(source.value?.status?.jobs ?? {}).filter(([, j]) => j.diff).map(([name, j]) => ({ name, diff: clean(j.diff) })),
)

async function sync() {
  await SourceApi.sync(props.id)
  toast.success(`Syncing ${source.value?.name}`)
}
async function togglePause() {
  const s = source.value
  if (!s) return
  await SourceApi.setPaused(s.id, !s.paused)
  toast.success(s.paused ? `Resumed ${s.name}` : `Paused ${s.name}`)
}
async function remove() {
  const name = source.value?.name
  await SourceApi.remove(props.id)
  toast.success(`Removed ${name}`)
  router.replace('/sources')
}
function openTeams() { teamDraft.value = [...(source.value?.teams ?? [])]; editingTeams.value = true }
async function saveTeams() {
  await SourceApi.setTeams(props.id, teamDraft.value)
  toast.success('Updated assigned teams')
  editingTeams.value = false
}
const nomadLink = (path?: string) => (nomadUI.value && path ? `${nomadUI.value}/ui/jobs/${path}` : undefined)
const minimapColor = (n: any) => ({ ok: '#4fd18b', warn: '#f0b24a', err: '#f2645f', busy: '#5aa9f5', idle: '#7d7d88' })[(n.data as ResourceData)?.tone] ?? '#7d7d88'
</script>

<template>
  <div v-if="!source" class="page">
    <div class="empty" v-if="sources.ready.value">
      <h3>Application not found</h3>
      <p>It may have been deleted.</p>
      <button class="btn" @click="router.push('/sources')"><ArrowLeft /> Back to applications</button>
    </div>
    <div v-else class="empty muted">Loading…</div>
  </div>

  <div v-else class="page">
    <header class="page-head">
      <button class="btn ghost icon" aria-label="Back to applications" @click="router.push('/sources')"><ArrowLeft /></button>
      <h1>{{ source.name }}</h1>
      <StatusBadge :status="source.status?.status" />
      <span v-if="source.paused" class="chip">Paused</span>
      <span class="grow" />
      <button class="btn" @click="sync"><RefreshCw /> Sync</button>
      <button class="btn" @click="togglePause"><component :is="source.paused ? Play : Pause" /> {{ source.paused ? 'Resume' : 'Pause' }}</button>
      <button class="btn" @click="openTeams"><Users /> Teams</button>
      <button class="btn danger" @click="confirmDelete = true"><Trash2 /> Delete</button>
    </header>

    <div class="summary">
      <div><span class="k">Repository</span><span class="v mono">{{ source.url }}</span></div>
      <div><span class="k">Target</span><span class="v mono">{{ source.branch }} · {{ source.path }}</span></div>
      <div><span class="k">Last check</span><span class="v">{{ timeAgo(source.status?.lastCheckTime) }}</span></div>
      <div class="wide"><span class="k">Message</span><span class="v">{{ source.status?.message || 'No message reported' }}</span></div>
    </div>

    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'tree'" :class="{ on: tab === 'tree' }" @click="tab = 'tree'">Resource tree</button>
      <button role="tab" :aria-selected="tab === 'diff'" :class="{ on: tab === 'diff' }" @click="tab = 'diff'">Diff <span v-if="diffs.length" class="count">{{ diffs.length }}</span></button>
      <button role="tab" :aria-selected="tab === 'details'" :class="{ on: tab === 'details' }" @click="tab = 'details'">Details</button>
      <span class="grow" />
      <span v-if="allocError && tab === 'tree'" class="muted warn">Could not reach Nomad for allocations</span>
    </div>

    <div v-show="tab === 'tree'" class="tree">
      <VueFlow
        :nodes="nodes" :edges="edges"
        :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="true"
        :min-zoom="0.2" :max-zoom="1.5" :fit-view-on-init="true" :default-viewport="{ zoom: 0.9, x: 40, y: 40 }"
      >
        <template #node-resource="p"><ResourceNode v-bind="p" :selected="selected?.id === p.id" /></template>
        <Background :gap="22" :size="1.2" pattern-color="var(--border)" />
        <Controls position="bottom-left" :show-interactive="false" />
        <MiniMap pannable zoomable :node-color="minimapColor" mask-color="rgba(0,0,0,0.45)" />
      </VueFlow>
      <div v-if="nodes.length === 1" class="hint-card">No jobs have been found in this source yet. They appear here once the first sync has read the repository.</div>

      <aside v-if="selected" class="panel" aria-label="Resource details">
        <header>
          <span class="ico"><component :is="KIND[selected.data.kind]?.icon" /></span>
          <div class="who">
            <span class="kind">{{ KIND[selected.data.kind]?.label }}</span>
            <strong :title="selected.data.title">{{ selected.data.title }}</strong>
          </div>
          <button class="btn ghost icon sm" aria-label="Close details" @click="selected = null"><X /></button>
        </header>

        <div class="pill" :class="`tone-${selected.data.tone}`"><i class="dot" :class="{ pulse: selected.data.pulse }" /> {{ selected.data.stateLabel }}</div>

        <dl class="facts">
          <div v-for="[k, v] in selected.data.facts" :key="k" class="fact">
            <dt>{{ k }}</dt>
            <dd><span class="mono" :title="v">{{ v }}</span><button class="copy" :aria-label="`Copy ${k}`" title="Copy" @click="copyValue(v)"><Copy /></button></dd>
          </div>
        </dl>

        <section v-if="selected.data.tasks?.length" class="tasks">
          <h4>Tasks <span class="n">{{ selected.data.tasks.length }}</span></h4>
          <ul>
            <li v-for="t in selected.data.tasks" :key="t.name" :class="`tone-${t.tone}`">
              <i class="dot" />
              <span class="name mono">{{ t.name }}</span>
              <span class="st">{{ t.state }}</span>
              <button class="btn sm" :aria-label="`Logs of ${t.name}`" @click="openLogs(selected.data, t.name)"><ScrollText /> Logs</button>
            </li>
          </ul>
        </section>

        <div class="acts">
          <button v-if="selected.data.logTargets?.length" class="btn primary wide" @click="openLogs(selected.data)">
            <ScrollText /> {{ selected.data.kind === 'group' ? `View logs · ${allocCount(selected.data)} allocation${allocCount(selected.data) === 1 ? '' : 's'}` : 'View logs' }}
          </button>
          <button v-if="selected.data.diffJob" class="btn wide" @click="tab = 'diff'"><GitCompareArrows /> View diff</button>
          <a v-if="nomadLink(selected.data.nomadPath)" class="btn wide" :href="nomadLink(selected.data.nomadPath)" target="_blank" rel="noopener"><ExternalLink /> Open in Nomad</a>
        </div>
      </aside>
    </div>

    <div v-if="tab === 'diff'" class="page-body pad">
      <div v-if="!diffs.length" class="empty"><h3>No pending changes</h3><p>When the repository differs from what runs in Nomad, the planned changes for each job show up here.</p></div>
      <section v-for="d in diffs" :key="d.name" class="diff">
        <h3><FolderGit2 /> {{ d.name }}</h3>
        <JsonTree :value="d.diff" />
      </section>
    </div>

    <div v-if="tab === 'details'" class="page-body pad">
      <dl class="kv">
        <dt>Repository</dt><dd class="mono">{{ source.url }}</dd>
        <dt>Branch</dt><dd class="mono">{{ source.branch }}</dd>
        <dt>Path</dt><dd class="mono">{{ source.path }}</dd>
        <dt>Data center</dt><dd>{{ source.dataCenter }}</dd>
        <dt>Namespace</dt><dd>{{ source.namespace || 'Not set' }}</dd>
        <dt>Region</dt><dd>{{ source.region || 'Not set' }}</dd>
        <dt>Deploy key</dt><dd>{{ deployKeyName ?? (firstId(source.deployKey) ? 'Key not found. Please fix' : 'No deploy key set') }}</dd>
        <dt>Vault token</dt><dd>{{ vaultTokenName ?? (firstId(source.vaultToken) ? 'Vault token not found. Please fix' : 'No vault token set') }}</dd>
        <dt>Force update on commit</dt><dd>{{ source.force ? 'Yes' : 'No' }}</dd>
        <dt>Teams</dt><dd><span v-for="t in sourceTeams" :key="t" class="chip">{{ t }}</span><template v-if="!sourceTeams.length">Everyone</template></dd>
        <dt>Created</dt><dd>{{ source.created ? new Date(source.created).toLocaleString() : '-' }}</dd>
        <dt>Last update</dt><dd>{{ source.status?.lastUpdateTime ? new Date(source.status.lastUpdateTime).toLocaleString() : '-' }}</dd>
      </dl>
    </div>

    <LogsDrawer v-if="logs" :targets="logs.targets" :start="logs.start" :title="logs.title" @close="logs = null" />
    <Modal v-if="editingTeams" title="Manage teams" @close="editingTeams = false">
      <CheckList v-model="teamDraft" :options="teamOptions" empty="No teams yet. Create one on the Teams page." />
      <template #footer>
        <button class="btn" @click="editingTeams = false">Cancel</button>
        <button class="btn primary" @click="saveTeams">Save</button>
      </template>
    </Modal>
    <Modal v-if="confirmDelete" :title="`Delete ${source.name}?`" :width="440" @close="confirmDelete = false">
      <p>Nomad Ops stops watching <span class="mono">{{ source.url }}</span>. Jobs already running in Nomad are left as they are.</p>
      <template #footer>
        <button class="btn" @click="confirmDelete = false">Cancel</button>
        <button class="btn danger" @click="remove"><Trash2 /> Delete application</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
.summary { display: flex; gap: 28px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--border); }
.summary > div { display: grid; gap: 2px; min-width: 0; }
.summary .wide { flex: 1; min-width: 220px; }
.k { font-size: 11px; color: var(--text-3); }
.v { color: var(--text); overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; align-items: center; gap: 4px; padding: 0 16px; border-bottom: 1px solid var(--border); }
.tabs button { display: inline-flex; gap: 6px; align-items: center; height: 38px; padding: 0 10px; border: 0; background: none; color: var(--text-2); font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s var(--ease); }
.tabs button:hover { color: var(--text); }
.tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
.warn { color: var(--warn); font-size: 12px; }
.tree { position: relative; flex: 1; min-height: 0; }
.hint-card { position: absolute; left: 50%; bottom: 72px; transform: translateX(-50%); max-width: 420px; padding: 10px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-2); text-align: center; }
.panel { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 340px; max-width: calc(100% - 24px); overflow: auto; display: flex; flex-direction: column; gap: 16px; padding: 16px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); animation: slide 0.22s var(--ease); z-index: 5; }
.panel > header { display: flex; align-items: center; gap: 12px; }
.panel .ico { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--surface-3); color: var(--text-2); flex: none; }
.panel .ico svg { width: 17px; height: 17px; }
.panel .who { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
.panel .kind { font-size: 11px; color: var(--text-3); }
.panel .who strong { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 500; color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); flex: none; }
.dot.pulse { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
.facts { margin: 0; display: grid; border-top: 1px solid var(--border); }
.fact { display: grid; gap: 2px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.fact dt { font-size: 11px; color: var(--text-3); }
.fact dd { margin: 0; display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.fact dd .mono { flex: 1; min-width: 0; font-size: 12px; color: var(--text); overflow-wrap: anywhere; }
.copy { display: grid; place-items: center; width: 22px; height: 22px; flex: none; margin-top: -2px; border: 0; border-radius: 6px; background: none; color: var(--text-3); opacity: 0; transition: opacity 0.15s var(--ease), background 0.15s var(--ease); }
.copy svg { width: 13px; height: 13px; }
.fact:hover .copy, .copy:focus-visible { opacity: 1; }
.copy:hover { background: var(--surface-3); color: var(--text); }
.tasks h4 { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; font-weight: 500; color: var(--text-3); }
.tasks .n { font: 500 11px var(--mono); background: var(--surface-3); padding: 1px 6px; border-radius: 8px; }
.tasks ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.tasks li { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
.tasks .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text); }
.tasks .st { font-size: 12px; color: var(--tone); }
.tone-ok { --tone: var(--ok); } .tone-warn { --tone: var(--warn); } .tone-err { --tone: var(--err); } .tone-busy { --tone: var(--busy); } .tone-idle { --tone: var(--idle); }
.acts { display: grid; gap: 8px; margin-top: auto; padding-top: 4px; }
.acts .wide { width: 100%; justify-content: center; height: 32px; }
.acts a.btn { text-decoration: none; }
.pad { padding: 20px; }
.diff { margin-bottom: 24px; }
.diff h3 { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
.diff h3 svg { width: 14px; height: 14px; color: var(--text-3); }
.kv { display: grid; grid-template-columns: 200px 1fr; margin: 0; max-width: 760px; }
.kv dt, .kv dd { padding: 9px 0; border-bottom: 1px solid var(--border); margin: 0; }
.kv dt { color: var(--text-3); }
.kv dd .chip { margin-right: 4px; }
@keyframes slide { from { opacity: 0; transform: translateX(10px); } }
</style>

