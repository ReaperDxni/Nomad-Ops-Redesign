<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LayoutGrid, Network, Users, KeyRound, ShieldCheck, LogOut, Sun, Moon, MonitorCog } from 'lucide-vue-next'
import Toasts from './components/Toasts.vue'
import { currentUser, displayName, logout } from './stores/auth'
import { sources, teams, keys, vaultTokens } from './stores/realtime'

const route = useRoute()
const router = useRouter()
const shell = computed(() => route.name !== 'login')

const nav = computed(() => [
  { to: '/sources', label: 'Applications', icon: LayoutGrid, count: sources.list.value.length },
  { to: '/cluster', label: 'Cluster', icon: Network, count: undefined as number | undefined },
  { to: '/teams', label: 'Teams', icon: Users, count: teams.list.value.length },
  { to: '/keys', label: 'Deploy keys', icon: KeyRound, count: keys.list.value.length },
  { to: '/vaultTokens', label: 'Vault tokens', icon: ShieldCheck, count: vaultTokens.list.value.length },
])

type Theme = 'system' | 'light' | 'dark'
const theme = ref<Theme>('system')
function applyTheme(t: Theme) {
  const light = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  try { localStorage.setItem('nomad-ops-theme', t) } catch { /* storage unavailable */ }
}
onMounted(() => {
  try { theme.value = (localStorage.getItem('nomad-ops-theme') as Theme) || 'system' } catch { /* storage unavailable */ }
  applyTheme(theme.value)
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(theme.value))
})
watch(theme, applyTheme)

function doLogout() {
  logout()
  router.replace({ name: 'login' })
}
const themes = [
  { id: 'system' as Theme, icon: MonitorCog, label: 'System theme' },
  { id: 'light' as Theme, icon: Sun, label: 'Light theme' },
  { id: 'dark' as Theme, icon: Moon, label: 'Dark theme' },
]
</script>

<template>
  <div v-if="shell" class="shell">
    <aside class="side">
      <div class="brand">
        <img src="/logo.png" alt="" width="22" height="22" />
        <span>Nomad Ops</span>
      </div>
      <nav aria-label="Main">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item">
          <component :is="n.icon" />
          <span>{{ n.label }}</span>
          <span v-if="n.count !== undefined" class="count">{{ n.count }}</span>
        </RouterLink>
      </nav>
      <div class="side-foot">
        <div class="row">
          <span class="muted">Theme</span>
          <div class="seg" role="group" aria-label="Theme">
            <button v-for="t in themes" :key="t.id" :class="{ on: theme === t.id }" :aria-label="t.label" :aria-pressed="theme === t.id" @click="theme = t.id">
              <component :is="t.icon" />
            </button>
          </div>
        </div>
        <div class="me">
          <div class="avatar" aria-hidden="true">{{ displayName(currentUser).slice(0, 1).toUpperCase() }}</div>
          <div class="who">
            <strong>{{ displayName(currentUser) }}</strong>
            <span class="muted">{{ currentUser?.email }}</span>
          </div>
          <button class="btn ghost icon sm" aria-label="Sign out" title="Sign out" @click="doLogout"><LogOut /></button>
        </div>
      </div>
    </aside>
    <main><RouterView /></main>
  </div>
  <RouterView v-else />
  <Toasts />
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 232px 1fr; height: 100%; gap: 0; padding: 6px; gap: 6px; }
.side, main { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); min-width: 0; overflow: hidden; }
.side { display: flex; flex-direction: column; }
main { background: var(--bg); }
.brand { display: flex; align-items: center; gap: 10px; padding: 14px 16px; font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
.brand img { border-radius: 5px; }
nav { display: grid; gap: 2px; padding: 4px 8px; flex: 1; align-content: start; }
.nav-item { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border-radius: var(--radius); color: var(--text-2); text-decoration: none; font-weight: 500; transition: background 0.15s var(--ease), color 0.15s var(--ease); }
.nav-item svg { width: 15px; height: 15px; flex: none; }
.nav-item span:nth-child(2) { flex: 1; }
.nav-item:hover { background: var(--surface-3); color: var(--text); }
.nav-item.router-link-active { background: var(--accent-bg); color: var(--accent-strong); }
.side-foot { border-top: 1px solid var(--border); padding: 10px 12px; display: grid; gap: 10px; }
.row { display: flex; align-items: center; justify-content: space-between; }
.seg { display: flex; padding: 2px; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
.seg button { display: grid; place-items: center; width: 26px; height: 22px; border: 0; border-radius: 6px; background: none; color: var(--text-3); }
.seg button.on { background: var(--surface-3); color: var(--text); }
.seg svg { width: 13px; height: 13px; }
.me { display: flex; align-items: center; gap: 10px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-bg); color: var(--accent-strong); display: grid; place-items: center; font-weight: 600; flex: none; }
.who { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
.who strong, .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who span { font-size: 11px; }
@media (max-width: 760px) {
  .shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .side { flex-direction: row; align-items: center; overflow-x: auto; }
  .brand span, .side-foot, .nav-item span { display: none; }
  nav { display: flex; padding: 4px; }
  .nav-item { padding: 0 10px; }
}
</style>
