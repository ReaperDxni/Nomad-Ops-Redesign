<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, LayoutGrid, List, RefreshCw, Pause, GitBranch, FolderGit2 } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import NewApplicationModal from '../components/NewApplicationModal.vue'
import { sources, teams } from '../stores/realtime'
import { currentUser } from '../stores/auth'
import { SOURCE_STATUSES, sourceStatus, timeAgo } from '../lib/status'
import { SourceApi } from '../services/api'
import { toast } from '../stores/toast'
import { userIsSourceMember, type Source } from '../lib/types'

const router = useRouter()
const search = ref('')
const searchEl = ref<HTMLInputElement>()
const statusFilter = ref<Set<string>>(new Set())
const teamFilter = ref<Set<string>>(new Set())
const mineOnly = ref(false)
const creating = ref(false)
const view = ref<'tiles' | 'list'>((() => { try { return (localStorage.getItem('nomad-ops-view') as 'tiles' | 'list') || 'tiles' } catch { return 'tiles' } })())
const setView = (v: 'tiles' | 'list') => { view.value = v; try { localStorage.setItem('nomad-ops-view', v) } catch { /* storage unavailable */ } }

const all = computed(() => [...sources.list.value].sort((a, b) => a.name.localeCompare(b.name)))
const teamList = computed(() => [...teams.list.value].sort((a, b) => a.name.localeCompare(b.name)))

const matchesSearch = (s: Source) => {
  const q = search.value.trim().toLowerCase()
  return !q || [s.name, s.url, s.branch, s.path].some((v) => v?.toLowerCase().includes(q))
}
const matchesTeam = (s: Source) => teamFilter.value.size === 0 || !!s.teams?.some((t) => teamFilter.value.has(t))
const matchesMine = (s: Source) => !mineOnly.value || userIsSourceMember(s, teamList.value, currentUser.value?.id ?? '')
const matchesStatus = (s: Source) => statusFilter.value.size === 0 || statusFilter.value.has(sourceStatus(s.status?.status).key)

const filtered = computed(() => all.value.filter((s) => matchesSearch(s) && matchesTeam(s) && matchesMine(s) && matchesStatus(s)))
const statusCounts = computed(() => {
  const base = all.value.filter((s) => matchesSearch(s) && matchesTeam(s) && matchesMine(s))
  return Object.fromEntries(SOURCE_STATUSES.map((m) => [m.key, base.filter((s) => sourceStatus(s.status?.status).key === m.key).length]))
})

function toggle(set: Set<string>, id: string) { set.has(id) ? set.delete(id) : set.add(id) }
const clearFilters = () => { search.value = ''; statusFilter.value = new Set(); teamFilter.value = new Set(); mineOnly.value = false }
const filtering = computed(() => !!search.value || statusFilter.value.size > 0 || teamFilter.value.size > 0 || mineOnly.value)

async function sync(e: Event, s: Source) {
  e.stopPropagation()
  await SourceApi.sync(s.id)
  toast.success(`Syncing ${s.name}`)
}
const open = (s: Source) => router.push({ name: 'source', params: { id: s.id } })
const teamName = (id: string) => teamList.value.find((t) => t.id === id)?.name ?? 'Unknown team'

function onKey(e: KeyboardEvent) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
  if (e.key === '/' && !typing) { e.preventDefault(); searchEl.value?.focus() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Applications</h1>
      <span class="count">{{ filtered.length }}<template v-if="filtering"> / {{ all.length }}</template></span>
      <span class="grow" />
      <label class="search">
        <Search />
        <input ref="searchEl" v-model="search" class="input" placeholder="Search applications" aria-label="Search applications" />
        <kbd>/</kbd>
      </label>
      <div class="seg" role="group" aria-label="View">
        <button :class="{ on: view === 'tiles' }" aria-label="Tile view" :aria-pressed="view === 'tiles'" @click="setView('tiles')"><LayoutGrid /></button>
        <button :class="{ on: view === 'list' }" aria-label="List view" :aria-pressed="view === 'list'" @click="setView('list')"><List /></button>
      </div>
      <button class="btn primary" @click="creating = true"><Plus /> New application</button>
    </header>

    <div class="body">
      <aside class="filters" aria-label="Filters">
        <section>
          <h3>Sync status</h3>
          <label v-for="m in SOURCE_STATUSES" :key="m.key" class="check f">
            <input type="checkbox" :checked="statusFilter.has(m.key)" @change="toggle(statusFilter, m.key); statusFilter = new Set(statusFilter)" />
            <i class="dot" :class="`d-${m.tone}`" />
            <span>{{ m.label }}</span>
            <span class="n">{{ statusCounts[m.key] }}</span>
          </label>
        </section>
        <section>
          <h3>Teams</h3>
          <label class="check f">
            <input v-model="mineOnly" type="checkbox" />
            <span>My applications</span>
          </label>
          <label v-for="t in teamList" :key="t.id" class="check f">
            <input type="checkbox" :checked="teamFilter.has(t.id)" @change="toggle(teamFilter, t.id); teamFilter = new Set(teamFilter)" />
            <span>{{ t.name }}</span>
          </label>
          <p v-if="!teamList.length" class="muted">No teams yet.</p>
        </section>
        <button v-if="filtering" class="btn sm" @click="clearFilters">Clear filters</button>
      </aside>

      <div class="results">
        <div v-if="!sources.ready.value" class="empty muted">Loading applications…</div>
        <div v-else-if="!all.length" class="empty">
          <h3>No applications yet</h3>
          <p>Point Nomad Ops at a Git repository containing Nomad job files and it keeps your cluster in sync with it.</p>
          <button class="btn primary" @click="creating = true"><Plus /> New application</button>
        </div>
        <div v-else-if="!filtered.length" class="empty">
          <h3>No applications match these filters</h3>
          <button class="btn" @click="clearFilters">Clear filters</button>
        </div>

        <div v-else-if="view === 'tiles'" class="tiles">
          <article v-for="s in filtered" :key="s.id" class="tile" tabindex="0" @click="open(s)" @keydown.enter="open(s)">
            <div class="t-head">
              <StatusBadge :status="s.status?.status" />
              <span v-if="s.paused" class="chip"><Pause /> Paused</span>
              <span class="grow" />
              <button class="btn sm icon ghost" :aria-label="`Sync ${s.name}`" title="Sync now" @click="sync($event, s)"><RefreshCw /></button>
            </div>
            <h2>{{ s.name }}</h2>
            <p class="msg" :class="{ muted: !s.status?.message }">{{ s.status?.message || 'No message reported' }}</p>
            <dl>
              <div><dt><FolderGit2 /></dt><dd class="mono" :title="s.url">{{ s.url }}</dd></div>
              <div><dt><GitBranch /></dt><dd class="mono">{{ s.branch }} · {{ s.path }}</dd></div>
            </dl>
            <footer>
              <span class="muted">{{ s.dataCenter }}{{ s.namespace ? ` · ${s.namespace}` : '' }}</span>
              <span class="grow" />
              <span class="muted">Checked {{ timeAgo(s.status?.lastCheckTime) }}</span>
            </footer>
            <div v-if="s.teams?.length" class="teams">
              <span v-for="t in s.teams" :key="t" class="chip">{{ teamName(t) }}</span>
            </div>
          </article>
        </div>

        <table v-else class="table">
          <thead><tr><th>Name</th><th>Status</th><th>Repository</th><th>Target</th><th>Last check</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in filtered" :key="s.id" class="clickable" tabindex="0" @click="open(s)" @keydown.enter="open(s)">
              <td><strong>{{ s.name }}</strong> <span v-if="s.paused" class="chip">Paused</span></td>
              <td><StatusBadge :status="s.status?.status" /></td>
              <td class="mono">{{ s.url }}</td>
              <td class="mono">{{ s.branch }} · {{ s.path }}</td>
              <td class="muted">{{ timeAgo(s.status?.lastCheckTime) }}</td>
              <td class="actions"><button class="btn sm icon ghost" :aria-label="`Sync ${s.name}`" @click="sync($event, s)"><RefreshCw /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <NewApplicationModal v-if="creating" @close="creating = false" />
  </div>
</template>

<style scoped>
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 208px 1fr; }
.search { position: relative; display: flex; align-items: center; width: 260px; }
.search svg { position: absolute; left: 10px; width: 14px; height: 14px; color: var(--text-3); pointer-events: none; }
.search .input { padding-left: 32px; padding-right: 30px; }
.search kbd { position: absolute; right: 8px; }
.seg { display: flex; padding: 2px; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.seg button { display: grid; place-items: center; width: 28px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--text-3); }
.seg button.on { background: var(--surface-3); color: var(--text); }
.seg svg { width: 14px; height: 14px; }

.filters { border-right: 1px solid var(--border); padding: 16px 14px; display: flex; flex-direction: column; gap: 22px; overflow: auto; }
.filters h3 { font-size: 12px; font-weight: 500; color: var(--text-3); margin-bottom: 8px; }
.filters section { display: grid; gap: 2px; }
.f { padding: 4px 0; font-size: 13px; }
.f .n { margin-left: auto; font: 11px var(--mono); color: var(--text-3); }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.d-ok { background: var(--ok); } .d-warn { background: var(--warn); } .d-err { background: var(--err); } .d-busy { background: var(--busy); } .d-idle { background: var(--idle); }

.results { overflow: auto; min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; padding: 16px 20px; align-content: start; }
.tile { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); cursor: pointer; transition: border-color 0.15s var(--ease), transform 0.2s var(--ease), background 0.15s var(--ease); }
.tile:hover { border-color: var(--border-strong); background: var(--surface-2); transform: translateY(-1px); }
.t-head { display: flex; align-items: center; gap: 8px; }
.t-head .chip svg { width: 11px; height: 11px; margin-right: 4px; }
.grow { flex: 1; }
.tile h2 { font-size: 15px; font-weight: 600; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msg { color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.9em; }
dl { margin: 2px 0 0; display: grid; gap: 4px; }
dl > div { display: flex; gap: 8px; align-items: center; min-width: 0; }
dt { color: var(--text-3); display: grid; }
dt svg { width: 13px; height: 13px; }
dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); font-size: 12px; }
footer { display: flex; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; }
.teams { display: flex; gap: 4px; flex-wrap: wrap; }
tr.clickable { cursor: pointer; }
@media (max-width: 900px) {
  .body { grid-template-columns: 1fr; }
  .filters { display: none; }
  .search { width: 100%; }
}
</style>
