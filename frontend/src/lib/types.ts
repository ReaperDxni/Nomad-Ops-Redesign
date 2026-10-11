export interface Team { id: string; name: string; members?: string[]; created?: string }
export interface User { id: string; username: string; email: string; name?: string; created: string }
export interface Key { id: string; name: string; value: string; team?: string; created?: string }
export interface VaultToken { id: string; name: string; value: string; team?: string; created?: string }

export interface JobStatus {
  groups?: Record<string, { count?: number }>
  status?: string
  deploymentStatus?: string
  statusDescription?: string
  type?: string
  namespace?: string
  diff?: unknown
}

export interface SourceStatus {
  jobs?: Record<string, JobStatus>
  status: string
  message?: string
  lastCheckTime?: string
  lastUpdateTime?: string
}

export interface Source {
  id: string
  name: string
  url: string
  path: string
  branch: string
  dataCenter: string
  namespace?: string
  region?: string
  force?: boolean
  paused?: boolean
  created?: string
  updated?: string
  teams?: string[]
  deployKey?: string | string[]
  vaultToken?: string | string[]
  status?: SourceStatus | null
}

export interface TaskState { State: string; StartedAt?: string; FinishedAt?: string; Failed?: boolean; Restarts?: number }
export interface Allocation {
  ID: string
  TaskGroup: string
  ClientStatus: string
  DesiredStatus?: string
  NodeName?: string
  TaskStates?: Record<string, TaskState> | null
}

export function firstId(v?: string | string[]): string | undefined {
  if (!v) return undefined
  return Array.isArray(v) ? v[0] : v
}

export function userIsSourceMember(src: Source, teams: Team[], userID: string): boolean {
  if (!src.teams || src.teams.length === 0) return true
  return src.teams.some((id) => teams.find((t) => t.id === id)?.members?.includes(userID))
}
