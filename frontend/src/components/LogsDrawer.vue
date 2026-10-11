<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, RefreshCw, Copy, WrapText, ArrowDownToLine, Search, ChevronsDown } from 'lucide-vue-next'
import type { LogTarget } from '../lib/resourceGraph'
import { LOG_TAIL_BYTES, NomadApi, type LogStream } from '../services/api'
import { toast } from '../stores/toast'
import { copyText } from '../lib/clipboard'

const props = defineProps<{ targets: LogTarget[]; title: string; start?: number }>()
const emit = defineEmits<{ close: [] }>()

type Level = 'err' | 'warn' | 'info'
interface Token { cls: '' | 'k' | 'v'; s: string }
interface Row { time?: string; fullTime?: string; level?: string; lvl?: Level; src?: string; msg: Token[]; raw: string }

const index = ref(props.start ?? 0)
const stream = ref<LogStream>('stdout')
const follow = ref(true)
const wrap = ref(true)
const filter = ref('')
const levelFilter = ref<'all' | 'warn' | 'err'>('all')
const raw = ref('')
const loading = ref(true)
const error = ref<string>()
const updatedAt = ref<Date>()
const atEnd = ref(true)
const scroller = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()

const target = computed(() => props.targets[index.value])

// ---- parsing: "2026-10-11T14:36:04.957Z INFO [server] handled request path=/x ms=3" -> columns
const LEVELS: Record<string, Level> = {
  TRACE: 'info', DEBUG: 'info', INFO: 'info', NOTICE: 'info', WARN: 'warn', WARNING: 'warn',
  ERROR: 'err', ERR: 'err', FATAL: 'err', PANIC: 'err', CRIT: 'err', CRITICAL: 'err',
}
const LINE = /^(\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?)\s+([A-Za-z]{3,8})\s+(?:\[([^\]]+)\]\s*)?(.*)$/
const TIME_ONLY = /^(\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?)\s+(.*)$/
const KV = /([A-Za-z_][\w.-]*)=("[^"]*"|\S*)/g

function tokens(msg: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of msg.matchAll(KV)) {
    if (m.index! > last) out.push({ cls: '', s: msg.slice(last, m.index) })
    out.push({ cls: 'k', s: `${m[1]}=` }, { cls: 'v', s: m[2] })
    last = m.index! + m[0].length
  }
  if (last < msg.length) out.push({ cls: '', s: msg.slice(last) })
  return out.length ? out : [{ cls: '', s: msg }]
}

function guess(text: string): Level | undefined {
  if (/\b(error|fatal|panic|exception|failed)\b/i.test(text)) return 'err'
  if (/\bwarn(ing)?\b/i.test(text)) return 'warn'
  return undefined
}

function parse(line: string): Row {
  const m = LINE.exec(line)
  if (m && LEVELS[m[2].toUpperCase()]) {
    return { fullTime: m[1], time: m[1].split(/[T ]/)[1]?.replace('Z', ''), level: m[2].toUpperCase(), lvl: LEVELS[m[2].toUpperCase()], src: m[3], msg: tokens(m[4]), raw: line }
  }
  const t = TIME_ONLY.exec(line)
  if (t) return { fullTime: t[1], time: t[1].split(/[T ]/)[1]?.replace('Z', ''), lvl: guess(t[2]), msg: tokens(t[2]), raw: line }
  return { lvl: guess(line), msg: tokens(line), raw: line }
}

// The tail is cut at a byte offset, so its first line is usually half a line: leave it out and say so.
const truncated = computed(() => raw.value.length >= LOG_TAIL_BYTES)
const rows = computed<Row[]>(() => {
  const all = raw.value.split('\n')
  if (all[all.length - 1] === '') all.pop()
  return (truncated.value ? all.slice(1) : all).map(parse)
})
const counts = computed(() => ({
  err: rows.value.filter((r) => r.lvl === 'err').length,
  warn: rows.value.filter((r) => r.lvl === 'warn').length,
}))
const query = computed(() => filter.value.trim())
const shown = computed(() => {
  const q = query.value.toLowerCase()
  return rows.value.filter((r) =>
    (levelFilter.value === 'all' || r.lvl === 'err' || (levelFilter.value === 'warn' && r.lvl === 'warn'))
    && (!q || r.raw.toLowerCase().includes(q)),
  )
})

function hl(s: string): { s: string; hit: boolean }[] {
  const q = query.value
  if (!q) return [{ s, hit: false }]
  const out: { s: string; hit: boolean }[] = []
  const lower = s.toLowerCase(), needle = q.toLowerCase()
  let i = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, i)) {
    if (at > i) out.push({ s: s.slice(i, at), hit: false })
    out.push({ s: s.slice(at, at + needle.length), hit: true })
    i = at + needle.length
  }
  if (i < s.length) out.push({ s: s.slice(i), hit: false })
  return out
}

// ---- loading
let controller: AbortController | undefined
let run = 0
async function load(initial = false) {
  const t = target.value
  if (!t) return
  controller?.abort()
  controller = new AbortController()
  const mine = ++run
  if (initial) { loading.value = true; raw.value = '' }
  try {
    const text = await NomadApi.logs(t.allocId, t.task, stream.value, t.namespace, controller.signal)
    if (mine !== run) return
    raw.value = text
    error.value = undefined
    updatedAt.value = new Date()
  } catch (e) {
    if (mine !== run || (e as Error).name === 'AbortError') return
    error.value = (e as Error).message
  } finally {
    if (mine === run) loading.value = false
  }
  if (follow.value) scrollToEnd()
}

async function scrollToEnd() {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

// Scrolling up to read stops following; "Jump to latest" brings it back.
function onScroll() {
  const el = scroller.value
  if (!el) return
  atEnd.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  if (!atEnd.value && follow.value) follow.value = false
}

let timer: number | undefined
function schedule() {
  window.clearInterval(timer)
  // Stay quiet while nothing could be read at all (the allocation is gone or not started): "Try again" resumes it.
  if (follow.value) timer = window.setInterval(() => { if (!(error.value && !raw.value)) load() }, 3000)
}
watch(follow, (on) => { schedule(); if (on) { load(); scrollToEnd() } })
watch([index, stream], () => load(true))
watch([levelFilter, query], () => { if (follow.value) scrollToEnd() })

async function copy() {
  if (await copyText(shown.value.map((r) => r.raw).join('\n'))) toast.success(`Copied ${shown.value.length} lines`)
  else toast.error('Could not copy to the clipboard')
}

const parts = computed(() => (target.value?.label ?? '').split(/ · | \/ /))

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => {
  window.addEventListener('keydown', onKey)
  closeButton.value?.focus()
  load(true)
  schedule()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.clearInterval(timer)
  controller?.abort()
})
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')">
      <aside class="drawer" role="dialog" aria-modal="true" :aria-label="`Logs ${title}`">
        <header>
          <div class="titles">
            <h2>Logs</h2>
            <p v-if="targets.length <= 1" class="crumbs" :title="target?.label">
              <template v-for="(p, i) in parts" :key="i"><span v-if="i" class="sep">/</span><span :class="{ last: i === parts.length - 1 }">{{ p }}</span></template>
            </p>
          </div>
          <button ref="closeButton" class="btn ghost icon sm" aria-label="Close logs" @click="emit('close')"><X /></button>
        </header>

        <div class="bar">
          <select v-if="targets.length > 1" v-model.number="index" class="select pick" aria-label="Allocation and task">
            <option v-for="(t, i) in targets" :key="`${t.allocId}/${t.task}`" :value="i">{{ t.label }}</option>
          </select>

          <div class="row">
            <div class="seg" role="group" aria-label="Output stream">
              <button :class="{ on: stream === 'stdout' }" :aria-pressed="stream === 'stdout'" @click="stream = 'stdout'">stdout</button>
              <button :class="{ on: stream === 'stderr' }" :aria-pressed="stream === 'stderr'" @click="stream = 'stderr'">stderr</button>
            </div>

            <div class="seg" role="group" aria-label="Level">
              <button :class="{ on: levelFilter === 'all' }" :aria-pressed="levelFilter === 'all'" @click="levelFilter = 'all'">All</button>
              <button class="w" :class="{ on: levelFilter === 'warn' }" :aria-pressed="levelFilter === 'warn'" @click="levelFilter = 'warn'">Warnings <b>{{ counts.warn + counts.err }}</b></button>
              <button class="e" :class="{ on: levelFilter === 'err' }" :aria-pressed="levelFilter === 'err'" @click="levelFilter = 'err'">Errors <b>{{ counts.err }}</b></button>
            </div>

            <label class="find">
              <Search />
              <input v-model="filter" class="input" placeholder="Search in logs" aria-label="Search in logs" />
            </label>

            <span class="grow" />

            <button class="btn sm live" :class="{ on: follow }" :aria-pressed="follow" title="Reload every 3 seconds and stay at the end" @click="follow = !follow">
              <i class="pulse" /> Live
            </button>
            <button class="btn sm icon" :class="{ on: wrap }" :aria-pressed="wrap" aria-label="Wrap long lines" title="Wrap long lines" @click="wrap = !wrap"><WrapText /></button>
            <button class="btn sm icon" aria-label="Reload" title="Reload" @click="load()"><RefreshCw :class="{ spin: loading }" /></button>
            <button class="btn sm icon" aria-label="Copy shown lines" title="Copy shown lines" :disabled="!shown.length" @click="copy"><Copy /></button>
          </div>
        </div>

        <div class="stage">
          <div ref="scroller" class="out" :class="{ wrap }" tabindex="0" role="log" aria-live="off" @scroll.passive="onScroll">
            <div v-if="loading && !raw" class="note muted">Loading logs…</div>
            <div v-else-if="error && !raw" class="note">
              <strong>Logs are not available</strong>
              <p class="muted">{{ error }}. The allocation may be gone, or its node unreachable.</p>
              <button class="btn sm" @click="load(true)">Try again</button>
            </div>
            <div v-else-if="!rows.length" class="note muted">No {{ stream }} output yet.</div>
            <div v-else-if="!shown.length" class="note muted">No lines match your search or level filter.</div>
            <template v-else>
              <div v-for="(r, i) in shown" :key="i" class="ln" :class="r.lvl">
                <span class="t" :title="r.fullTime">{{ r.time ?? '' }}</span>
                <span class="lv">{{ r.level ?? '' }}</span>
                <span class="body">
                  <span v-if="r.src" class="src">{{ r.src }}</span>
                  <span v-for="(t, ti) in r.msg" :key="ti" :class="t.cls"><template v-for="(p, pi) in hl(t.s)" :key="pi"><mark v-if="p.hit">{{ p.s }}</mark><template v-else>{{ p.s }}</template></template></span>
                </span>
              </div>
            </template>
          </div>
          <button v-if="!atEnd && shown.length" class="btn sm primary jump" @click="follow = true"><ChevronsDown /> Jump to latest</button>
        </div>

        <footer>
          <span><b>{{ shown.length }}</b><template v-if="shown.length !== rows.length"> of {{ rows.length }}</template> lines</span>
          <span v-if="counts.err" class="e">{{ counts.err }} error{{ counts.err === 1 ? '' : 's' }}</span>
          <span v-if="counts.warn" class="w">{{ counts.warn }} warning{{ counts.warn === 1 ? '' : 's' }}</span>
          <span v-if="truncated" class="muted">last {{ LOG_TAIL_BYTES / 1024 }} KB only</span>
          <span v-if="error && raw" class="w">reload failed, showing the last read</span>
          <span class="grow" />
          <span v-if="updatedAt" class="muted">Updated {{ updatedAt.toLocaleTimeString() }}</span>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.45); animation: fade 0.15s var(--ease); }
.drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(820px, 100vw); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-pop); animation: slide 0.25s var(--ease); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 12px 12px 20px; }
.titles { min-width: 0; display: grid; gap: 4px; }
h2 { font-size: 15px; font-weight: 600; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; margin: 0; font: 12px var(--mono); color: var(--text-3); }
.crumbs .sep { color: var(--border-strong); }
.crumbs .last { color: var(--text); }

.bar { display: grid; gap: 8px; padding: 0 16px 12px; border-bottom: 1px solid var(--border); }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pick { height: 28px; font-size: 12px; }
.seg { display: flex; padding: 2px; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
.seg button { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border: 0; border-radius: 6px; background: none; color: var(--text-3); font: 500 12px var(--font); transition: background 0.15s var(--ease), color 0.15s var(--ease); }
.seg button:hover { color: var(--text); }
.seg button.on { background: var(--surface-3); color: var(--text); }
.seg button b { font: 600 11px var(--mono); padding: 0 5px; border-radius: 8px; background: var(--surface-3); color: var(--text-2); }
.seg button.w.on b { background: var(--warn-bg); color: var(--warn); }
.seg button.e.on b { background: var(--err-bg); color: var(--err); }
.find { position: relative; display: flex; align-items: center; flex: 1; min-width: 150px; max-width: 260px; }
.find svg { position: absolute; left: 9px; width: 13px; height: 13px; color: var(--text-3); pointer-events: none; }
.find .input { height: 28px; padding-left: 28px; font-size: 12px; }
.grow { flex: 1; }
.btn.on { background: var(--accent-bg); border-color: transparent; color: var(--accent-strong); }
.live .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.live.on .pulse { background: var(--ok); animation: pulse 1.6s ease-in-out infinite; }

.stage { position: relative; flex: 1; min-height: 0; display: flex; }
.out { flex: 1; min-width: 0; overflow: auto; padding: 6px 0 10px; background: var(--bg); font: 12px/1.65 var(--mono); }
.out:focus-visible { outline-offset: -2px; }
.ln { display: grid; grid-template-columns: 96px 46px 1fr; gap: 0 10px; padding: 1px 16px; color: var(--text-2); }
.ln:hover { background: var(--surface); }
.ln.warn { background: var(--warn-bg); }
.ln.err { background: var(--err-bg); }
.t { color: var(--text-3); white-space: nowrap; user-select: none; font-variant-numeric: tabular-nums; }
.lv { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-3); padding-top: 1px; user-select: none; }
.ln.warn .lv { color: var(--warn); }
.ln.err .lv { color: var(--err); }
.body { min-width: 0; white-space: pre; }
.wrap .body { white-space: pre-wrap; overflow-wrap: anywhere; }
.src { color: var(--accent-strong); margin-right: 8px; opacity: 0.85; }
.src::before { content: '['; opacity: 0.5; } .src::after { content: ']'; opacity: 0.5; }
.k { color: var(--text-3); }
.v { color: var(--text); }
.ln.err .v, .ln.err { color: var(--text); }
.ln.warn .v { color: var(--text); }
mark { background: var(--accent-bg); color: var(--accent-strong); border-radius: 3px; box-shadow: 0 0 0 1px var(--accent-bg); }
.note { display: grid; gap: 8px; justify-items: start; padding: 28px 20px; font-family: var(--font); font-size: 13px; }
.jump { position: absolute; right: 18px; bottom: 14px; box-shadow: var(--shadow-pop); }

footer { display: flex; gap: 14px; align-items: center; padding: 9px 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-2); }
footer b { color: var(--text); font-weight: 600; }
footer .e { color: var(--err); } footer .w { color: var(--warn); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: 0.35; } }
@keyframes fade { from { opacity: 0; } }
@keyframes slide { from { transform: translateX(24px); opacity: 0; } }
@media (max-width: 560px) { .ln { grid-template-columns: 1fr; } .t, .lv { display: none; } }
</style>
