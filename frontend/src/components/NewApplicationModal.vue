<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Modal from './Modal.vue'
import CheckList from './CheckList.vue'
import { keys, teams, vaultTokens } from '../stores/realtime'
import { SourceApi } from '../services/api'
import { toast } from '../stores/toast'

const emit = defineEmits<{ close: [] }>()

const form = reactive({
  name: '', url: '', branch: 'main', path: '', dataCenter: '', namespace: '', region: '',
  force: false, deployKey: '', vaultToken: '', teams: [] as string[],
})
const busy = ref(false)
const teamOptions = computed(() => teams.list.value.map((t) => ({ id: t.id, label: t.name })))

async function submit() {
  busy.value = true
  try {
    await SourceApi.create({
      name: form.name, url: form.url, branch: form.branch, path: form.path, dataCenter: form.dataCenter,
      namespace: form.namespace, region: form.region, force: form.force, teams: form.teams,
      deployKey: form.deployKey || undefined, vaultToken: form.vaultToken || undefined,
    } as any)
    toast.success(`Watching ${form.url}`)
    emit('close')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal title="New application" :width="620" @close="emit('close')">
    <form id="new-app" class="form-grid" @submit.prevent="submit">
      <div class="field span-2">
        <label for="n-name">Name</label>
        <input id="n-name" v-model="form.name" class="input" required autofocus placeholder="payments" />
      </div>
      <div class="field span-2">
        <label for="n-url">Repository URL</label>
        <input id="n-url" v-model="form.url" class="input mono" required placeholder="git@github.com:acme/jobs.git" />
      </div>
      <div class="field">
        <label for="n-branch">Branch</label>
        <input id="n-branch" v-model="form.branch" class="input mono" required />
      </div>
      <div class="field">
        <label for="n-path">Path</label>
        <input id="n-path" v-model="form.path" class="input mono" required placeholder="jobs/payments" />
      </div>
      <div class="field">
        <label for="n-dc">Data center</label>
        <input id="n-dc" v-model="form.dataCenter" class="input" required placeholder="dc1" />
      </div>
      <div class="field">
        <label for="n-ns">Namespace</label>
        <input id="n-ns" v-model="form.namespace" class="input" placeholder="default" />
      </div>
      <div class="field">
        <label for="n-region">Region</label>
        <input id="n-region" v-model="form.region" class="input" placeholder="global" />
      </div>
      <div class="field">
        <label for="n-key">Deploy key</label>
        <select id="n-key" v-model="form.deployKey" class="select">
          <option value="">No deploy key</option>
          <option v-for="k in keys.list.value" :key="k.id" :value="k.id">{{ k.name }}</option>
        </select>
      </div>
      <div class="field">
        <label for="n-vault">Vault token</label>
        <select id="n-vault" v-model="form.vaultToken" class="select">
          <option value="">No vault token</option>
          <option v-for="t in vaultTokens.list.value" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <div class="field">
        <span class="label">Updates</span>
        <label class="check"><input v-model="form.force" type="checkbox" /> Force update on every commit</label>
      </div>
      <div class="field span-2">
        <span class="label">Teams</span>
        <CheckList v-model="form.teams" :options="teamOptions" empty="No teams yet. Without a team, everyone can see this application." />
      </div>
    </form>
    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Cancel</button>
      <button class="btn primary" type="submit" form="new-app" :disabled="busy">{{ busy ? 'Creating…' : 'Create application' }}</button>
    </template>
  </Modal>
</template>
