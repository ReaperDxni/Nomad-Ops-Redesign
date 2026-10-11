<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listProviders, login, loginWithProvider } from '../stores/auth'
import { toast } from '../stores/toast'

const router = useRouter()
const identity = ref('')
const password = ref('')
const busy = ref(false)
const failed = ref(false)
const providers = ref<string[]>([])

onMounted(async () => { providers.value = await listProviders() })

async function submit() {
  busy.value = true
  failed.value = false
  try {
    await login(identity.value, password.value)
    router.replace('/')
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}

async function oauth(p: string) {
  try {
    await loginWithProvider(p)
    router.replace('/')
  } catch {
    toast.error(`Could not sign in with ${p}.`)
  }
}
</script>

<template>
  <div class="wrap">
    <form class="card" @submit.prevent="submit">
      <div class="brand"><img src="/logo.png" alt="" width="28" height="28" /><h1>Sign in to Nomad Ops</h1></div>
      <div class="field">
        <label for="id">Email or username</label>
        <input id="id" v-model="identity" class="input" autocomplete="username" required autofocus />
      </div>
      <div class="field">
        <label for="pw">Password</label>
        <input id="pw" v-model="password" class="input" type="password" autocomplete="current-password" required />
        <span v-if="failed" class="hint err" role="alert">Those credentials were not accepted. Check them and try again.</span>
      </div>
      <button class="btn primary submit" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <template v-if="providers.length">
        <div class="or"><span>or continue with</span></div>
        <button v-for="p in providers" :key="p" type="button" class="btn submit" @click="oauth(p)">{{ p }}</button>
      </template>
    </form>
  </div>
</template>

<style scoped>
.wrap { min-height: 100%; display: grid; place-items: center; padding: 24px; }
.card { width: 360px; max-width: 100%; display: grid; gap: 16px; padding: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.brand img { border-radius: 6px; }
h1 { font-size: 16px; font-weight: 600; }
.submit { height: 34px; justify-content: center; text-transform: capitalize; }
.hint.err { color: var(--err); }
.or { display: flex; align-items: center; gap: 10px; color: var(--text-3); font-size: 12px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
</style>
