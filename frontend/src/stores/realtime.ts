import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import pb from '../services/pb'
import type { Key, Source, Team, User, VaultToken } from '../lib/types'

interface Store<T> {
  map: ShallowRef<Record<string, T>>
  ready: ShallowRef<boolean>
  start: () => Promise<void>
  stop: () => void
  list: ComputedRef<T[]>
}

const stoppers: Array<() => void> = []

/** A PocketBase collection kept in sync through the realtime API. */
function createStore<T extends { id: string }>(collection: string, transform: (r: any) => T): Store<T> {
  const map = shallowRef<Record<string, T>>({})
  const ready = shallowRef(false)
  let unsubscribe: (() => Promise<void>) | undefined
  let started = false

  async function start() {
    if (started) return
    started = true
    const rows = await pb.collection(collection).getFullList({ $autoCancel: false })
    const next: Record<string, T> = {}
    for (const r of rows) next[r.id] = transform(r)
    map.value = next
    ready.value = true
    unsubscribe = await pb.collection(collection).subscribe('*', (e) => {
      const copy = { ...map.value }
      if (e.action === 'delete') delete copy[e.record.id]
      else copy[e.record.id] = transform(e.record)
      map.value = copy
    })
  }

  function stop() {
    unsubscribe?.()
    unsubscribe = undefined
    started = false
    ready.value = false
    map.value = {}
  }

  const store: Store<T> = { map, ready, start, stop, list: computed(() => Object.values(map.value)) }
  stoppers.push(stop)
  return store
}

export const sources = createStore<Source>('sources', (r) => ({
  id: r.id,
  name: r.name,
  url: r.url,
  path: r.path,
  branch: r.branch,
  dataCenter: r.dataCenter,
  namespace: r.namespace,
  region: r.region,
  force: r.force,
  paused: r.paused,
  created: r.created,
  updated: r.updated,
  status: r.status,
  deployKey: r.deployKey,
  vaultToken: r.vaultToken,
  teams: r.teams,
}))

export const teams = createStore<Team>('teams', (r) => ({ id: r.id, name: r.name, members: r.members, created: r.created }))
export const keys = createStore<Key>('keys', (r) => ({ id: r.id, name: r.name, value: r.value, team: r.team, created: r.created }))
export const vaultTokens = createStore<VaultToken>('vault_tokens', (r) => ({ id: r.id, name: r.name, value: r.value, team: r.team, created: r.created }))
export const users = createStore<User>('users', (r) => ({ id: r.id, username: r.username, email: r.email, name: r.name, created: r.created }))

export async function startAll() {
  await Promise.allSettled([sources.start(), teams.start(), keys.start(), vaultTokens.start(), users.start()])
}

export function stopAll() {
  stoppers.forEach((s) => s())
}
