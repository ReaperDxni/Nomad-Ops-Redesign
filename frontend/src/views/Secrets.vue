<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Trash2, KeyRound, ShieldCheck } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import { keys, vaultTokens, teams } from '../stores/realtime'
import { KeyApi, VaultTokenApi } from '../services/api'
import { toast } from '../stores/toast'

const props = defineProps<{ kind: 'keys' | 'vault' }>()

const cfg = computed(() =>
  props.kind === 'keys'
    ? { title: 'Deploy keys', noun: 'deploy key', store: keys, api: KeyApi, icon: KeyRound, valueLabel: 'Private key', multiline: true,
        blurb: 'SSH private keys Nomad Ops uses to clone private repositories.' }
    : { title: 'Vault tokens', noun: 'vault token', store: vaultTokens, api: VaultTokenApi, icon: ShieldCheck, valueLabel: 'Token', multiline: false,
        blurb: 'Vault tokens passed along when jobs are registered in Nomad.' },
)

const rows = computed(() => [...cfg.value.store.list.value].sort((a, b) => a.name.localeCompare(b.name)))
const teamName = (id?: string) => (id ? teams.map.value[id]?.name : undefined)

const creating = ref(false)
const busy = ref(false)
const form = reactive({ name: '', value: '', team: '' })
const pendingDelete = ref<{ id: string; name: string } | null>(null)

function openCreate() { Object.assign(form, { name: '', value: '', team: '' }); creating.value = true }
async function create() {
  busy.value = true
  try {
    await cfg.value.api.create({ name: form.name, value: form.value, team: form.team || undefined })
    toast.success(`Created ${cfg.value.noun} ${form.name}`)
    creating.value = false
  } finally { busy.value = false }
}
async function remove() {
  if (!pendingDelete.value) return
  await cfg.value.api.remove(pendingDelete.value.id)
  toast.success(`Removed ${pendingDelete.value.name}`)
  pendingDelete.value = null
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>{{ cfg.title }}</h1>
      <span class="count">{{ rows.length }}</span>
      <span class="muted blurb">{{ cfg.blurb }}</span>
      <span class="grow" />
      <button class="btn primary" @click="openCreate"><Plus /> New {{ cfg.noun }}</button>
    </header>
    <div class="page-body">
      <div v-if="!cfg.store.ready.value" class="empty muted">Loading…</div>
      <div v-else-if="!rows.length" class="empty">
        <h3>No {{ cfg.title.toLowerCase() }} yet</h3>
        <p>{{ cfg.blurb }} Values are write-only after creation.</p>
        <button class="btn primary" @click="openCreate"><Plus /> New {{ cfg.noun }}</button>
      </div>
      <table v-else class="table">
        <thead><tr><th>Name</th><th>Team</th><th>Created</th><th /></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><span class="name"><component :is="cfg.icon" /> {{ r.name }}</span></td>
            <td><span v-if="teamName(r.team)" class="chip">{{ teamName(r.team) }}</span><span v-else class="muted">Everyone</span></td>
            <td class="muted">{{ r.created ? new Date(r.created).toLocaleString() : '-' }}</td>
            <td class="actions"><button class="btn sm icon ghost danger" :aria-label="`Delete ${r.name}`" @click="pendingDelete = { id: r.id, name: r.name }"><Trash2 /></button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="creating" :title="`New ${cfg.noun}`" @close="creating = false">
      <form id="secret-form" class="form-grid" @submit.prevent="create">
        <div class="field span-2"><label for="s-name">Name</label><input id="s-name" v-model="form.name" class="input" required autofocus /></div>
        <div class="field span-2">
          <label for="s-val">{{ cfg.valueLabel }}</label>
          <textarea v-if="cfg.multiline" id="s-val" v-model="form.value" class="input" rows="7" required spellcheck="false" />
          <input v-else id="s-val" v-model="form.value" class="input mono" type="password" required autocomplete="off" />
        </div>
        <div class="field span-2">
          <label for="s-team">Team</label>
          <select id="s-team" v-model="form.team" class="select">
            <option value="">Everyone</option>
            <option v-for="t in teams.list.value" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <span class="hint">Only members of the team can use this {{ cfg.noun }}.</span>
        </div>
      </form>
      <template #footer>
        <button class="btn" @click="creating = false">Cancel</button>
        <button class="btn primary" type="submit" form="secret-form" :disabled="busy">Create</button>
      </template>
    </Modal>
    <Modal v-if="pendingDelete" :title="`Delete ${pendingDelete.name}?`" :width="420" @close="pendingDelete = null">
      <p>Applications using this {{ cfg.noun }} will stop being able to use it.</p>
      <template #footer>
        <button class="btn" @click="pendingDelete = null">Cancel</button>
        <button class="btn danger" @click="remove"><Trash2 /> Delete</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.blurb { font-size: 12px; }
.grow { flex: 1; }
.name { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
.name svg { width: 14px; height: 14px; color: var(--text-3); }
</style>
