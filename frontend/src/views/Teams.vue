<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Trash2, UserPen } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import CheckList from '../components/CheckList.vue'
import { teams, users } from '../stores/realtime'
import { displayName } from '../stores/auth'
import { TeamApi } from '../services/api'
import { toast } from '../stores/toast'

const rows = computed(() => [...teams.list.value].sort((a, b) => a.name.localeCompare(b.name)))
const userOptions = computed(() =>
  [...users.list.value].sort((a, b) => displayName(a).localeCompare(displayName(b))).map((u) => ({ id: u.id, label: `${displayName(u)}${u.email ? ` (${u.email})` : ''}` })),
)
const memberNames = (ids?: string[]) => (ids ?? []).map((id) => displayName(users.map.value[id])).sort((a, b) => a.localeCompare(b))

const creating = ref(false)
const busy = ref(false)
const form = reactive({ name: '', members: [] as string[] })
const editing = ref<{ id: string; name: string; members: string[] } | null>(null)
const pendingDelete = ref<{ id: string; name: string } | null>(null)

async function create() {
  busy.value = true
  try {
    await TeamApi.create({ name: form.name, members: form.members })
    toast.success(`Team ${form.name} created`)
    creating.value = false
    Object.assign(form, { name: '', members: [] })
  } finally { busy.value = false }
}
async function saveMembers() {
  if (!editing.value) return
  await TeamApi.setMembers(editing.value.id, editing.value.members)
  toast.success('Updated team members')
  editing.value = null
}
async function remove() {
  if (!pendingDelete.value) return
  await TeamApi.remove(pendingDelete.value.id)
  toast.success(`Removed team ${pendingDelete.value.name}`)
  pendingDelete.value = null
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Teams</h1>
      <span class="count">{{ rows.length }}</span>
      <span class="muted blurb">Teams decide who sees which applications, keys and tokens.</span>
      <span class="grow" />
      <button class="btn primary" @click="creating = true"><Plus /> New team</button>
    </header>
    <div class="page-body">
      <div v-if="!teams.ready.value" class="empty muted">Loading…</div>
      <div v-else-if="!rows.length" class="empty">
        <h3>No teams yet</h3>
        <p>Create a team, add its members, then assign it to applications.</p>
        <button class="btn primary" @click="creating = true"><Plus /> New team</button>
      </div>
      <table v-else class="table">
        <thead><tr><th>Name</th><th>Members</th><th>Created</th><th /></tr></thead>
        <tbody>
          <tr v-for="t in rows" :key="t.id">
            <td><strong>{{ t.name }}</strong></td>
            <td>
              <span v-for="m in memberNames(t.members)" :key="m" class="chip m">{{ m }}</span>
              <span v-if="!t.members?.length" class="muted">Everyone</span>
            </td>
            <td class="muted">{{ t.created ? new Date(t.created).toLocaleString() : '-' }}</td>
            <td class="actions">
              <button class="btn sm icon ghost" :aria-label="`Edit members of ${t.name}`" title="Edit members" @click="editing = { id: t.id, name: t.name, members: [...(t.members ?? [])] }"><UserPen /></button>
              <button class="btn sm icon ghost danger" :aria-label="`Delete ${t.name}`" @click="pendingDelete = { id: t.id, name: t.name }"><Trash2 /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="creating" title="New team" @close="creating = false">
      <form id="team-form" class="form-grid" @submit.prevent="create">
        <div class="field span-2"><label for="t-name">Name</label><input id="t-name" v-model="form.name" class="input" required autofocus /></div>
        <div class="field span-2"><span class="label">Members</span><CheckList v-model="form.members" :options="userOptions" empty="No users found." /></div>
      </form>
      <template #footer>
        <button class="btn" @click="creating = false">Cancel</button>
        <button class="btn primary" type="submit" form="team-form" :disabled="busy">Create team</button>
      </template>
    </Modal>
    <Modal v-if="editing" :title="`Members of ${editing.name}`" @close="editing = null">
      <CheckList v-model="editing.members" :options="userOptions" empty="No users found." />
      <template #footer>
        <button class="btn" @click="editing = null">Cancel</button>
        <button class="btn primary" @click="saveMembers">Save</button>
      </template>
    </Modal>
    <Modal v-if="pendingDelete" :title="`Delete ${pendingDelete.name}?`" :width="420" @close="pendingDelete = null">
      <p>Applications assigned to this team lose that assignment.</p>
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
.chip.m { margin: 0 4px 2px 0; }
</style>
