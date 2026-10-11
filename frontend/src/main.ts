import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import './styles/global.css'
import App from './App.vue'
import { ensureSession } from './stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
    { path: '/', redirect: '/sources' },
    { path: '/sources', name: 'sources', component: () => import('./views/Applications.vue') },
    { path: '/sources/:id', name: 'source', component: () => import('./views/ApplicationDetail.vue'), props: true },
    { path: '/cluster', name: 'cluster', component: () => import('./views/Cluster.vue') },
    { path: '/teams', name: 'teams', component: () => import('./views/Teams.vue') },
    { path: '/keys', name: 'keys', component: () => import('./views/Secrets.vue'), props: { kind: 'keys' } },
    { path: '/vaultTokens', name: 'vaultTokens', component: () => import('./views/Secrets.vue'), props: { kind: 'vault' } },
    { path: '/:rest(.*)*', redirect: '/sources' },
  ],
})

router.beforeEach(async (to) => {
  const ok = await ensureSession()
  if (to.meta.public) return ok && to.name === 'login' ? '/' : true
  return ok ? true : { name: 'login' }
})

createApp(App).use(router).mount('#app')
