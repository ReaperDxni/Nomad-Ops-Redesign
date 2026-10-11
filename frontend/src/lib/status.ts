export type Tone = 'ok' | 'warn' | 'err' | 'busy' | 'idle'

export interface StatusMeta { key: string; label: string; tone: Tone; pulse?: boolean; hint: string }

export const SOURCE_STATUSES: StatusMeta[] = [
  { key: 'synced', label: 'Synced', tone: 'ok', hint: 'Nomad matches the repository' },
  { key: 'outofsync', label: 'Out of sync', tone: 'warn', hint: 'Repository changed, not yet applied' },
  { key: 'syncing', label: 'Syncing', tone: 'busy', pulse: true, hint: 'Applying changes to Nomad' },
  { key: 'syncedwitherror', label: 'Degraded', tone: 'warn', hint: 'Applied, but a deployment failed' },
  { key: 'error', label: 'Error', tone: 'err', hint: 'Could not read or apply the source' },
  { key: 'init', label: 'Initializing', tone: 'idle', pulse: true, hint: 'Waiting for the first check' },
  { key: 'unknown', label: 'Unknown', tone: 'idle', hint: 'No status reported' },
]

export function sourceStatus(key?: string): StatusMeta {
  return SOURCE_STATUSES.find((s) => s.key === key) ?? SOURCE_STATUSES[SOURCE_STATUSES.length - 1]
}

/** Nomad allocation / task / job states mapped onto the same tones. */
export function nomadTone(state?: string): Tone {
  switch ((state ?? '').toLowerCase()) {
    case 'running': case 'successful': case 'complete': case 'healthy': return 'ok'
    case 'pending': case 'starting': case 'queued': case 'running-deploy': return 'busy'
    case 'failed': case 'lost': case 'unhealthy': return 'err'
    default: return 'idle'
  }
}

export function timeAgo(iso?: string): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return 'never'
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
