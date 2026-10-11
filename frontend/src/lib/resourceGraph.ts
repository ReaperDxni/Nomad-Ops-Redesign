import type { Edge, Node } from '@vue-flow/core'
import type { Allocation, Source } from './types'
import { nomadTone, sourceStatus, type Tone } from './status'

export type ResourceKind = 'source' | 'job' | 'group' | 'alloc' | 'cluster' | 'server' | 'dc' | 'node'

/** One stream of output the logs drawer can show: a task of an allocation. */
export interface LogTarget {
  allocId: string
  namespace: string
  task: string
  /** What the picker shows, for example `payments-api · api · a1b2c3d4 / server`. */
  label: string
}

export interface ResourceData {
  kind: ResourceKind
  title: string
  subtitle?: string
  tone: Tone
  stateLabel: string
  pulse?: boolean
  facts: Array<[string, string]>
  tasks?: Array<{ name: string; state: string; tone: Tone }>
  nomadPath?: string
  diffJob?: string
  /** Where logs can be read for this box: the tasks of an allocation, or of every allocation of a task group. */
  logTargets?: LogTarget[]
}

export const NODE_W = 248
const COL_GAP = 84
const ROW_GAP = 14

// Mirrors ResourceNode.vue: 78px for header + state, plus 13px divider block and 20px per task row.
const nodeHeight = (d: ResourceData) => 78 + (d.tasks?.length ? 13 + d.tasks.length * 20 : 0)

const worst = (tones: Tone[]): Tone =>
  (['err', 'warn', 'busy', 'ok', 'idle'] as Tone[]).find((t) => tones.includes(t)) ?? 'idle'

const toneLabel: Record<Tone, string> = { ok: 'Healthy', warn: 'Degraded', err: 'Failed', busy: 'Progressing', idle: 'Inactive' }

interface Tree { id: string; data: ResourceData; children: Tree[]; h: number; y: number; span: number }

/** Builds the ArgoCD-style resource tree: source -> jobs -> task groups -> allocations. */
export function buildResourceGraph(
  source: Source,
  allocsByJob: Record<string, Allocation[] | undefined>,
): { nodes: Node<ResourceData>[]; edges: Edge[] } {
  const st = sourceStatus(source.status?.status)
  const jobs = source.status?.jobs ?? {}

  const jobTrees: Tree[] = Object.keys(jobs).sort().map((jobName) => {
    const job = jobs[jobName]
    const allocs = allocsByJob[jobName] ?? []
    const groupNames = Array.from(new Set([...Object.keys(job.groups ?? {}), ...allocs.map((a) => a.TaskGroup)])).sort()

    const groupTrees: Tree[] = groupNames.map((g) => {
      const gAllocs = allocs.filter((a) => a.TaskGroup === g)
      const allocTrees: Tree[] = gAllocs.map((a) => {
        const tasks = Object.entries(a.TaskStates ?? {}).map(([name, s]) => ({ name, state: s.State, tone: nomadTone(s.State) }))
        const data: ResourceData = {
          kind: 'alloc',
          title: a.ID.slice(0, 8),
          subtitle: a.NodeName ? `on ${a.NodeName}` : undefined,
          tone: nomadTone(a.ClientStatus),
          stateLabel: a.ClientStatus,
          pulse: a.ClientStatus === 'pending',
          facts: [['Allocation', a.ID], ['Client status', a.ClientStatus], ['Desired', a.DesiredStatus ?? '-'], ['Node', a.NodeName ?? '-']],
          tasks,
          logTargets: tasks.map((t) => ({
            allocId: a.ID,
            namespace: job.namespace || source.namespace || 'default',
            task: t.name,
            label: `${jobName} · ${g} · ${a.ID.slice(0, 8)} / ${t.name}`,
          })),
        }
        return { id: `alloc:${a.ID}`, data, children: [], h: nodeHeight(data), y: 0, span: 0 }
      })
      const count = job.groups?.[g]?.count
      const tone = allocTrees.length ? worst(allocTrees.map((t) => t.data.tone)) : 'idle'
      const data: ResourceData = {
        kind: 'group',
        title: g,
        subtitle: count !== undefined ? `${count} desired` : undefined,
        tone,
        stateLabel: allocTrees.length ? toneLabel[tone] : 'No allocations',
        facts: [['Task group', g], ['Desired count', count === undefined ? '-' : String(count)], ['Allocations', String(allocTrees.length)]],
        logTargets: allocTrees.flatMap((t) => t.data.logTargets ?? []),
      }
      return { id: `group:${jobName}:${g}`, data, children: allocTrees, h: nodeHeight(data), y: 0, span: 0 }
    })

    let tone: Tone = nomadTone(job.status)
    if (job.deploymentStatus === 'failed') tone = 'err'
    else if (job.deploymentStatus === 'running') tone = 'busy'
    else if (groupTrees.length) tone = worst([tone, ...groupTrees.map((g) => g.data.tone)].filter((t) => t !== 'idle'))
    const data: ResourceData = {
      kind: 'job',
      title: jobName,
      subtitle: [job.type, job.namespace].filter(Boolean).join(' · ') || undefined,
      tone,
      stateLabel: job.deploymentStatus === 'failed' ? 'Deployment failed' : job.deploymentStatus === 'running' ? 'Deploying' : toneLabel[tone],
      pulse: job.deploymentStatus === 'running',
      facts: [
        ['Job', jobName],
        ['Namespace', job.namespace || 'default'],
        ['Type', job.type ?? '-'],
        ['Status', job.status ?? '-'],
        ['Deployment', job.deploymentStatus || '-'],
        ...(job.statusDescription ? ([['Description', job.statusDescription]] as Array<[string, string]>) : []),
      ],
      nomadPath: `${jobName}@${job.namespace || 'default'}`,
      diffJob: job.diff ? jobName : undefined,
    }
    return { id: `job:${jobName}`, data, children: groupTrees, h: nodeHeight(data), y: 0, span: 0 }
  })

  const rootData: ResourceData = {
    kind: 'source',
    title: source.name,
    subtitle: `${source.branch} · ${source.path}`,
    tone: st.tone,
    stateLabel: source.paused ? `${st.label} · paused` : st.label,
    pulse: st.pulse,
    facts: [['Repository', source.url], ['Branch', source.branch], ['Path', source.path]],
  }
  const root: Tree = { id: `source:${source.id}`, data: rootData, children: jobTrees, h: nodeHeight(rootData), y: 0, span: 0 }

  return layoutTree(root)
}

/** Tidy layout: leaves stack vertically, parents centre over their children. */
function layoutTree(root: Tree): { nodes: Node<ResourceData>[]; edges: Edge[] } {
  let cursor = 0
  const place = (t: Tree) => {
    if (!t.children.length) {
      t.y = cursor
      cursor += t.h + ROW_GAP
      return
    }
    t.children.forEach(place)
    const first = t.children[0]
    const last = t.children[t.children.length - 1]
    t.y = (first.y + last.y + last.h) / 2 - t.h / 2
  }
  place(root)

  const nodes: Node<ResourceData>[] = []
  const edges: Edge[] = []
  const walk = (t: Tree, depth: number, parent?: Tree) => {
    nodes.push({ id: t.id, type: 'resource', position: { x: depth * (NODE_W + COL_GAP), y: t.y }, data: t.data })
    if (parent) {
      edges.push({
        id: `${parent.id}->${t.id}`,
        source: parent.id,
        target: t.id,
        type: 'smoothstep',
        animated: t.data.pulse,
        class: `edge-${t.data.tone}`,
      })
    }
    t.children.forEach((c) => walk(c, depth + 1, t))
  }
  walk(root, 0)
  return { nodes, edges }
}

export interface NomadNode {
  ID: string; Name: string; Datacenter: string; NodeClass?: string; Status: string
  SchedulingEligibility?: string; Drain?: boolean; Address?: string; Version?: string
}
export interface NomadServer { Name: string; Addr: string; Status: string; Tags?: Record<string, string> }
export interface ClusterAlloc { ID: string; JobID: string; TaskGroup: string; NodeID: string; ClientStatus: string; Namespace?: string }

const mk = (id: string, data: ResourceData, children: Tree[] = []): Tree => ({ id, data, children, h: nodeHeight(data), y: 0, span: 0 })

/** Cluster view: cluster -> servers + datacenters -> client nodes -> allocations. */
export function buildClusterGraph(
  nodesIn: NomadNode[],
  servers: NomadServer[],
  allocs: ClusterAlloc[],
): { nodes: Node<ResourceData>[]; edges: Edge[] } {
  const serverTrees = servers.map((s) => {
    const alive = s.Status === 'alive'
    const leader = s.Tags?.raft_vsn !== undefined && s.Tags?.leader === 'true'
    return mk(`server:${s.Name}`, {
      kind: 'server',
      title: s.Name,
      subtitle: [s.Tags?.dc, leader ? 'leader' : undefined].filter(Boolean).join(' · ') || undefined,
      tone: alive ? 'ok' : 'err',
      stateLabel: alive ? 'Alive' : s.Status,
      facts: [['Server', s.Name], ['Address', s.Addr], ['Status', s.Status], ['Region', s.Tags?.region ?? '-'], ['Datacenter', s.Tags?.dc ?? '-'], ['Version', s.Tags?.build ?? '-']],
    })
  })

  const dcs = Array.from(new Set(nodesIn.map((n) => n.Datacenter))).sort()
  const dcTrees = dcs.map((dc) => {
    const nodeTrees = nodesIn.filter((n) => n.Datacenter === dc).sort((a, b) => a.Name.localeCompare(b.Name)).map((n) => {
      const mine = allocs.filter((a) => a.NodeID === n.ID && a.ClientStatus !== 'complete' && a.ClientStatus !== 'lost')
      const allocTrees = mine.map((a) =>
        mk(`alloc:${a.ID}`, {
          kind: 'alloc',
          title: a.JobID,
          subtitle: `${a.TaskGroup} · ${a.ID.slice(0, 8)}`,
          tone: nomadTone(a.ClientStatus),
          stateLabel: a.ClientStatus,
          pulse: a.ClientStatus === 'pending',
          facts: [['Allocation', a.ID], ['Job', a.JobID], ['Task group', a.TaskGroup], ['Namespace', a.Namespace ?? 'default'], ['Client status', a.ClientStatus]],
          nomadPath: `${a.JobID}@${a.Namespace ?? 'default'}`,
        }),
      )
      const down = n.Status !== 'ready'
      const tone: Tone = down ? 'err' : n.Drain ? 'warn' : n.SchedulingEligibility === 'ineligible' ? 'warn' : 'ok'
      return mk(`node:${n.ID}`, {
        kind: 'node',
        title: n.Name,
        subtitle: [n.NodeClass, `${mine.length} alloc${mine.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
        tone,
        stateLabel: down ? `Node ${n.Status}` : n.Drain ? 'Draining' : n.SchedulingEligibility === 'ineligible' ? 'Ineligible' : 'Ready',
        facts: [['Node', n.Name], ['ID', n.ID], ['Datacenter', n.Datacenter], ['Class', n.NodeClass || '-'], ['Address', n.Address ?? '-'], ['Status', n.Status], ['Eligibility', n.SchedulingEligibility ?? '-'], ['Version', n.Version ?? '-']],
      }, allocTrees)
    })
    const tone = worst(nodeTrees.map((t) => t.data.tone))
    return mk(`dc:${dc}`, {
      kind: 'dc', title: dc, subtitle: `${nodeTrees.length} node${nodeTrees.length === 1 ? '' : 's'}`, tone, stateLabel: toneLabel[tone],
      facts: [['Datacenter', dc], ['Nodes', String(nodeTrees.length)]],
    }, nodeTrees)
  })

  const children = [...serverTrees, ...dcTrees]
  const tone = worst(children.map((c) => c.data.tone))
  const root = mk('cluster', {
    kind: 'cluster', title: 'Nomad cluster', subtitle: `${servers.length} servers · ${nodesIn.length} nodes`, tone, stateLabel: toneLabel[tone],
    facts: [['Servers', String(servers.length)], ['Client nodes', String(nodesIn.length)], ['Allocations', String(allocs.length)]],
  }, children)
  return layoutTree(root)
}
