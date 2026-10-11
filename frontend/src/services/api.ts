import pb from './pb'
import type { Allocation, Key, Source, Team, VaultToken } from '../lib/types'

export const SourceApi = {
  create: (src: Partial<Source>) =>
    pb.collection('sources').create({ ...src, status: { status: 'init', message: 'init' } }),
  remove: (id: string) => pb.collection('sources').delete(id),
  setTeams: (id: string, teams: string[]) => pb.collection('sources').update(id, { teams }),
  setPaused: (id: string, paused: boolean) => pb.collection('sources').update(id, { paused }),
  sync: (id: string) => pb.send('/api/actions/sources/sync', { method: 'POST', query: { id } }),
}

export const TeamApi = {
  create: (t: Pick<Team, 'name' | 'members'>) => pb.collection('teams').create(t),
  remove: (id: string) => pb.collection('teams').delete(id),
  setMembers: (id: string, members: string[]) => pb.collection('teams').update(id, { members }),
}

export const KeyApi = {
  create: (k: Pick<Key, 'name' | 'value' | 'team'>) => pb.collection('keys').create(k),
  remove: (id: string) => pb.collection('keys').delete(id),
}

export const VaultTokenApi = {
  create: (t: Pick<VaultToken, 'name' | 'value' | 'team'>) => pb.collection('vault_tokens').create(t),
  remove: (id: string) => pb.collection('vault_tokens').delete(id),
}

async function nomadGet(path: string) {
  const resp = await fetch(pb.buildUrl(path), { headers: { Authorization: pb.authStore.token } })
  if (resp.status !== 200 && resp.status !== 204) throw resp
  return resp.status === 204 ? [] : resp.json()
}

/** A plain-text answer of the Nomad proxy (task logs); the proxy labels everything as JSON, so read it as text. */
async function nomadText(path: string, signal?: AbortSignal): Promise<string> {
  const resp = await fetch(pb.buildUrl(path), { headers: { Authorization: pb.authStore.token }, signal })
  if (!resp.ok) throw new Error(`Nomad answered ${resp.status}`)
  return resp.text()
}

export type LogStream = 'stdout' | 'stderr'
/** The size of the tail the drawer reads, in bytes. */
export const LOG_TAIL_BYTES = 64 * 1024

export const NomadApi = {
  /** The last bytes of a task's stdout or stderr. `plain=true` returns the raw text instead of Nomad's framed JSON. */
  logs: (allocId: string, task: string, type: LogStream, namespace: string, signal?: AbortSignal): Promise<string> =>
    nomadText(
      `/api/nomad/proxy/v1/client/fs/logs/${encodeURIComponent(allocId)}?task=${encodeURIComponent(task)}&type=${type}`
      + `&plain=true&follow=false&origin=end&offset=${LOG_TAIL_BYTES}&namespace=${encodeURIComponent(namespace || 'default')}`,
      signal,
    ),
  urls: (): Promise<{ ui: string }> => nomadGet('/api/nomad/urls'),
  nodes: (): Promise<any[]> => nomadGet('/api/nomad/proxy/v1/nodes'),
  members: (): Promise<{ Members?: any[] }> => nomadGet('/api/nomad/proxy/v1/agent/members'),
  allAllocations: (): Promise<any[]> => nomadGet('/api/nomad/proxy/v1/allocations?namespace=*&resources=false'),
  allocations: (job: string, namespace: string): Promise<Allocation[]> =>
    nomadGet(`/api/nomad/proxy/v1/job/${encodeURIComponent(job)}/allocations?namespace=${encodeURIComponent(namespace || 'default')}`),
}
