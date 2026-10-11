// Fake PocketBase + Nomad API for looking at the UI without a backend. Any login works.
// Run: npm run mock (port 8090), then npm run dev in a second terminal.
import http from 'node:http'

const now = new Date().toISOString()
const src = (id, name, status, message, jobs, extra = {}) => ({
  id, name, url: `git@github.com:acme/${name}.git`, path: `jobs/${name}`, branch: 'main', dataCenter: 'dc1',
  namespace: 'default', region: 'global', created: now, updated: now, teams: [], status: { status, message, lastCheckTime: now, jobs }, ...extra,
})
const data = {
  sources: [
    src('s1', 'payments', 'synced', 'All jobs in sync', {
      'payments-api': { namespace: 'default', type: 'service', status: 'running', deploymentStatus: 'successful', groups: { api: { count: 2 }, worker: { count: 1 } } },
      'payments-cron': { namespace: 'default', type: 'batch', status: 'running', groups: { cron: { count: 1 } } },
    }, { teams: ['t1'] }),
    src('s2', 'checkout', 'outofsync', 'Repository changed at 4d59afd', { 'checkout-web': { namespace: 'default', type: 'service', status: 'running', groups: { web: { count: 3 } }, diff: { Type: 'Edited', Fields: [{ Name: 'Count', Old: '2', New: '3' }, null] } } }),
    src('s3', 'search', 'error', 'ssh: handshake failed: no supported methods remain', {}),
    src('s4', 'ledger', 'syncing', 'Deployment pending for job: ledger', { ledger: { namespace: 'default', type: 'service', status: 'running', deploymentStatus: 'running', groups: { db: { count: 1 } } } }),
    src('s5', 'mailer', 'syncedwitherror', 'Deployment failed for job: mailer', { mailer: { namespace: 'default', type: 'service', status: 'running', deploymentStatus: 'failed', groups: { m: { count: 1 } } } }, { paused: true }),
  ],
  teams: [{ id: 't1', name: 'Platform', members: ['u1'], created: now }, { id: 't2', name: 'Growth', members: [], created: now }],
  keys: [{ id: 'k1', name: 'github-deploy', value: 'x', team: 't1', created: now }],
  vault_tokens: [], users: [{ id: 'u1', username: 'demo', email: 'demo@example.com', created: now }],
}
const alloc = (id, group, status, tasks) => ({ ID: id, TaskGroup: group, ClientStatus: status, DesiredStatus: 'run', NodeName: 'nomad-client-1',
  TaskStates: Object.fromEntries(tasks.map(([n, s]) => [n, { State: s }])) })
const allocs = {
  'payments-api': [alloc('a1b2c3d4-0001', 'api', 'running', [['server', 'running'], ['log-shipper', 'running']]), alloc('a1b2c3d4-0002', 'api', 'running', [['server', 'running'], ['log-shipper', 'running']]), alloc('e5f6a7b8-0003', 'worker', 'pending', [['worker', 'pending']])],
  'payments-cron': [alloc('c0ffee00-0004', 'cron', 'running', [['cron', 'running']])],
}
// Fake task logs. They grow by a line every 2 seconds so "Follow" has something to follow; the cron allocation
// is chatty enough to exceed the 64 KB tail the UI reads.
const startedAt = Date.now()
const logText = (id, task, type) => {
  // A task that only writes plain, unstamped lines to stderr (nothing on stdout).
  if (task === 'log-shipper') return type === 'stderr' ? 'Listening on http://[::]:3000\n' : ''
  // Container output without timestamps, like a JVM start script: the UI must not reserve empty columns for it.
  if (id === 'c0ffee00-0004' && type === 'stderr') {
    return [
      'INFO exec -a "java" java -XX:MaxRAMPercentage=80.0 -XX:+UseParallelGC -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=20 -XX:GCTimeRatio=4 -Dquarkus.http.host=0.0.0.0 -cp "." -jar /deployments/quarkus-run.jar',
      'INFO running in /deployments',
    ].join('\n') + '\n'
  }
  const grown = Math.floor((Date.now() - startedAt) / 2000)
  const count = (id === 'c0ffee00-0004' ? 900 : 40) + grown
  const paths = ['/api/payments', '/api/refunds', '/healthz', '/api/orders/42', '/metrics']
  const out = []
  for (let i = 0; i < count; i++) {
    const ts = new Date(startedAt - (count - i) * 2000).toISOString()
    const p = paths[i % paths.length]
    if (type === 'stderr') {
      if (i % 9 === 0) out.push(`${ts} WARN  [${task}] slow upstream response path=${p} ms=${800 + (i % 7) * 40}`)
      else if (i % 23 === 0) out.push(`${ts} ERROR [${task}] connection reset by peer while calling ledger:8080 attempt=${1 + (i % 3)}`)
    } else {
      out.push(`${ts} INFO  [${task}] handled request path=${p} status=${i % 17 === 0 ? 500 : 200} ms=${5 + (i % 31)} alloc=${id.slice(0, 8)}`)
    }
  }
  return out.length ? out.join('\n') + '\n' : ''
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = `${b64({ alg: 'HS256' })}.${b64({ exp: 4102444800, id: 'u1', type: 'authRecord' })}.sig`

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const u = new URL(req.url, 'http://x')
  const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
  let m
  if (u.pathname === '/api/realtime') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(`id: 1\nevent: PB_CONNECT\ndata: {"clientId":"c1"}\n\n`); return }
  if ((m = u.pathname.match(/^\/api\/collections\/(\w+)\/records$/))) return json({ page: 1, perPage: 500, totalItems: 0, totalPages: 1, items: data[m[1]] ?? [] })
  if (u.pathname.endsWith('/auth-refresh')) return json({ token, record: data.users[0] })
  if (u.pathname.endsWith('/auth-with-password')) return json({ token, record: data.users[0] })
  if (u.pathname.endsWith('/auth-methods')) return json({ authProviders: [{ name: 'microsoft' }] })
  if (u.pathname === '/api/nomad/proxy/v1/nodes') return json([
    { ID: 'n1aaaaaa-1', Name: 'client-a', Datacenter: 'dc1', NodeClass: 'general', Status: 'ready', SchedulingEligibility: 'eligible', Address: '10.0.0.11' },
    { ID: 'n2bbbbbb-2', Name: 'client-b', Datacenter: 'dc1', NodeClass: 'general', Status: 'ready', SchedulingEligibility: 'ineligible', Drain: true, Address: '10.0.0.12' },
    { ID: 'n3cccccc-3', Name: 'client-c', Datacenter: 'dc2', NodeClass: 'gpu', Status: 'down', SchedulingEligibility: 'eligible', Address: '10.1.0.5' }])
  if (u.pathname === '/api/nomad/proxy/v1/agent/members') return json({ Members: [1, 2, 3].map((i) => ({ Name: `nomad-srv-${i}.global`, Addr: `10.0.1.${i}`, Status: i === 3 ? 'failed' : 'alive', Tags: { dc: 'dc1', region: 'global', build: '1.9.3', leader: i === 1 ? 'true' : 'false', raft_vsn: '3' } })) })
  if (u.pathname === '/api/nomad/proxy/v1/allocations') return json([
    { ID: 'a1b2c3d4-0001', JobID: 'payments-api', TaskGroup: 'api', NodeID: 'n1aaaaaa-1', ClientStatus: 'running' },
    { ID: 'a1b2c3d4-0002', JobID: 'payments-api', TaskGroup: 'api', NodeID: 'n1aaaaaa-1', ClientStatus: 'running' },
    { ID: 'e5f6a7b8-0003', JobID: 'payments-api', TaskGroup: 'worker', NodeID: 'n2bbbbbb-2', ClientStatus: 'pending' },
    { ID: 'c0ffee00-0004', JobID: 'checkout-web', TaskGroup: 'web', NodeID: 'n2bbbbbb-2', ClientStatus: 'running' },
    { ID: 'dead0000-0005', JobID: 'mailer', TaskGroup: 'm', NodeID: 'n3cccccc-3', ClientStatus: 'failed' }])
  if ((m = u.pathname.match(/^\/api\/nomad\/proxy\/v1\/client\/fs\/logs\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1])
    const task = u.searchParams.get('task') ?? 'task'
    const type = u.searchParams.get('type') === 'stderr' ? 'stderr' : 'stdout'
    const offset = Number(u.searchParams.get('offset')) || 65536
    // The pending allocation has no output yet: Nomad answers with an error, so the drawer's error state shows.
    if (id === 'e5f6a7b8-0003') { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('task not started') }
    const text = logText(id, task, type)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(text.length > offset ? text.slice(text.length - offset) : text)
  }
  if (u.pathname === '/api/nomad/urls') return json({ ui: 'http://nomad.local:4646' })
  if ((m = u.pathname.match(/^\/api\/nomad\/proxy\/v1\/job\/([^/]+)\/allocations/))) return json(allocs[decodeURIComponent(m[1])] ?? [])
  json({}, 404)
}).listen(8090, '127.0.0.1', () => console.log('mock up'))
