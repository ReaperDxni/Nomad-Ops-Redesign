<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { X, RefreshCw, Copy, WrapText, ArrowDownToLine, Search, ChevronsDown } from 'lucide-vue-next'
import type { LogTarget } from '../lib/resourceGraph'
import { LOG_TAIL_BYTES, NomadApi, type LogStream } from '../services/api'
import { toast } from '../stores/toast'
import { copyText } from '../lib/clipboard'

const props = defineProps<{ targets: LogTarget[]; title: string; start?: number }>()
const emit = defineEmits<{ close: [] }>()

type Level = 'err' | 'warn' | 'info'
interface Token { cls: '' | 'k' | 'v'; s: string }
interface Row { stream?: LogStream; time?: string; fullTime?: string; level?: string; lvl?: Level; src?: string; msg: Token[]; raw: string }

const index = ref(props.start ?? 0)
const follow = ref(true)
const wrap = ref(true)
const filter = ref('')
const levelFilter = ref<'all' | 'warn' | 'err'>('all')
const rawOut = ref('')
const rawErr = ref('')
const partial = ref<string>()
const loading = ref(true)
const error = ref<string>()
const updatedAt = ref<Date>()
const atEnd = ref(true)
const scroller = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()

const target = computed(() => props.targets[index.value])

// ---- resizable width: drag the left edge (or use the arrow keys); the choice is remembered
const WIDTH_KEY = 'nomad-ops-logs-width'
const DEFAULT_WIDTH = 820
const MIN_WIDTH = 420
const clampWidth = (w: number) => Math.min(Math.max(MIN_WIDTH, window.innerWidth - 48), Math.max(MIN_WIDTH, Math.round(w)))
function storedWidth() {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (v) return clampWidth(v)
  } catch { /* storage unavailable */ }
  return clampWidth(DEFAULT_WIDTH)
}
const width = ref(storedWidth())
const dragging = ref(false)
function saveWidth() {
  try { localStorage.setItem(WIDTH_KEY, String(width.value)) } catch { /* storage unavailable */ }
}
function gripDown(e: PointerEvent) {
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function gripMove(e: PointerEvent) {
  if (dragging.value) width.value = clampWidth(window.innerWidth - e.clientX)
}
function gripUp() {
  if (!dragging.value) return
  dragging.value = false
  saveWidth()
}
function gripKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 120 : 40
  if (e.key === 'ArrowLeft') width.value = clampWidth(width.value + step)
  else if (e.key === 'ArrowRight') width.value = clampWidth(width.value - step)
  else if (e.key === 'Home') width.value = clampWidth(DEFAULT_WIDTH)
  else return
  e.preventDefault()
  saveWidth()
}
function resetWidth() {
  width.value = clampWidth(DEFAULT_WIDTH)
  saveWidth()
}
const keepInWindow = () => { width.value = clampWidth(width.value) }

// ---- parsing: "2026-10-11T14:36:04.957Z INFO [server] handled request path=/x ms=3" -> columns
const LEVELS: Record<string, Level> = {
  TRACE: 'info', DEBUG: 'info', INFO: 'info', NOTICE: 'info', WARN: 'warn', WARNING: 'warn',
  ERROR: 'err', ERR: 'err', FATAL: 'err', PANIC: 'err', CRIT: 'err', CRITICAL: 'err',
}
const LINE = /^(\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?)\s+([A-Za-z]{3,8})\s+(?:\[([^\]]+)\]\s*)?(.*)$/
const LEVEL_ONLY = /^([A-Za-z]{3,8})\s+(.*)$/
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
  if (!t) {
    // No timestamp (a container's own stdout, a JVM start line): the level alone still gets its column.
    const l = LEVEL_ONLY.exec(line)
    if (l && LEVELS[l[1].toUpperCase()]) return { level: l[1].toUpperCase(), lvl: LEVELS[l[1].toUpperCase()], msg: tokens(l[2]), raw: line }
  }
  if (t) return { fullTime: t[1], time: t[1].split(/[T ]/)[1]?.replace('Z', ''), lvl: guess(t[2]), msg: tokens(t[2]), raw: line }
  return { lvl: guess(line), msg: tokens(line), raw: line }
}

// The tail is cut at a byte offset, so its first line is usually half a line: leave it out and say so.
const truncated = computed(() => rawOut.value.length >= LOG_TAIL_BYTES || rawErr.value.length >= LOG_TAIL_BYTES)
function rowsOf(text: string, stream: LogStream): Row[] {
  const all = text.split('\n')
  if (all[all.length - 1] === '') all.pop()
  return (text.length >= LOG_TAIL_BYTES ? all.slice(1) : all).map((line) => ({ ...parse(line), stream }))
}
const epoch = (r: Row) => Date.parse(`${(r.fullTime ?? '').replace(' ', 'T').replace(',', '.')}${/(Z|[+-]\d\d:?\d\d)$/.test(r.fullTime ?? '') ? '' : 'Z'}`)

const outRows = computed(() => rowsOf(rawOut.value, 'stdout'))
const errRows = computed(() => rowsOf(rawErr.value, 'stderr'))
const hasData = computed(() => outRows.value.length + errRows.value.length > 0)
const hasBoth = computed(() => outRows.value.length > 0 && errRows.value.length > 0)
// stdout and stderr run in one list: by time when every line has one, else stdout first and stderr after it.
const interleaved = computed(() => {
  const all = [...outRows.value, ...errRows.value]
  return all.length > 0 && all.every((r) => r.fullTime && !Number.isNaN(epoch(r)))
})
const rows = computed<Row[]>(() => {
  const all = [...outRows.value, ...errRows.value]
  return interleaved.value ? all.sort((a, b) => epoch(a) - epoch(b)) : all
})
const mixedUnordered = computed(() => hasBoth.value && !interleaved.value)
// Clicking "stdout" or "stderr" marks that stream's lines in the list; nothing is hidden or split off.
const mark = reactive<Record<LogStream, boolean>>({ stdout: false, stderr: false })
const isMarked = (r: Row) => !!r.stream && mark[r.stream]
// A column nobody fills is not shown, so logs without timestamps do not start with a wide empty gutter.
const hasTime = computed(() => rows.value.some((r) => r.time))
const hasLevel = computed(() => rows.value.some((r) => r.level))
const cols = computed(() => [hasTime.value ? '96px' : '', hasLevel.value ? '46px' : '', 'minmax(0, 1fr)'].filter(Boolean).join(' '))
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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
  if (initial) { loading.value = true; rawOut.value = ''; rawErr.value = ''; partial.value = undefined }
  try {
    const [out, err] = await Promise.allSettled([
      NomadApi.logs(t.allocId, t.task, 'stdout', t.namespace, controller.signal),
      NomadApi.logs(t.allocId, t.task, 'stderr', t.namespace, controller.signal),
    ])
    if (mine !== run) return
    const failed = [out, err].find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed && (failed.reason as Error).name === 'AbortError') return
    if (out.status === 'rejected' && err.status === 'rejected') throw out.reason
    // One stream failing leaves the other readable: keep what was read last and say so.
    if (out.status === 'fulfilled') rawOut.value = out.value
    if (err.status === 'fulfilled') rawErr.value = err.value
    partial.value = failed ? `${out.status === 'rejected' ? 'stdout' : 'stderr'} could not be read` : undefined
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
  if (follow.value) timer = window.setInterval(() => { if (!(error.value && !hasData.value)) load() }, 3000)
}
watch(follow, (on) => { schedule(); if (on) { load(); scrollToEnd() } })
watch(index, () => load(true))
watch([levelFilter, query], () => { if (follow.value) scrollToEnd() })

async function copy() {
  if (await copyText(shown.value.map((r) => r.raw).join('\n'))) toast.success(`Copied ${plural(shown.value.length, 'line')}`)
  else toast.error('Could not copy to the clipboard')
}

const parts = computed(() => (target.value?.label ?? '').split(/ · | \/ /))

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', keepInWindow)
  closeButton.value?.focus()
  load(true)
  schedule()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', keepInWindow)
  window.clearInterval(timer)
  controller?.abort()
})
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')">
      <aside class="drawer" :class="{ dragging }" :style="{ width: `${width}px` }" role="dialog" aria-modal="true" :aria-label="`Logs ${title}`">
        <div
          class="grip" role="separator" aria-orientation="vertical" aria-label="Resize logs" title="Drag to resize, double-click to reset"
          tabindex="0" :aria-valuenow="width" :aria-valuemin="MIN_WIDTH" aria-valuemax="1600"
          @pointerdown="gripDown" @pointermove="gripMove" @pointerup="gripUp" @pointercancel="gripUp" @dblclick="resetWidth" @keydown="gripKey"
        />
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

            <div v-if="counts.warn + counts.err > 0 || levelFilter !== 'all'" class="seg" role="group" aria-label="Level">
              <button :class="{ on: levelFilter === 'all' }" :aria-pressed="levelFilter === 'all'" @click="levelFilter = 'all'">All</button>
              <button class="w" :class="{ on: levelFilter === 'warn' }" :aria-pressed="levelFilter === 'warn'" @click="levelFilter = 'warn'">Warnings <b>{{ counts.warn + counts.err }}</b></button>
              <button class="e" :class="{ on: levelFilter === 'err' }" :aria-pressed="levelFilter === 'err'" @click="levelFilter = 'err'">Errors <b>{{ counts.err }}</b></button>
            </div>

            <div v-if="hasData" class="seg marks" role="group" aria-label="Mark output streams">
              <button class="so" :class="{ on: mark.stdout }" :aria-pressed="mark.stdout" :disabled="!outRows.length" title="Mark the lines written to stdout" @click="mark.stdout = !mark.stdout">
                <i class="dot" /> stdout <b>{{ outRows.length }}</b>
              </button>
              <button class="se" :class="{ on: mark.stderr }" :aria-pressed="mark.stderr" :disabled="!errRows.length" title="Mark the lines written to stderr" @click="mark.stderr = !mark.stderr">
                <i class="dot" /> stderr <b>{{ errRows.length }}</b>
              </button>
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
          <div ref="scroller" class="out" :class="{ wrap }" :style="{ '--cols': cols }" tabindex="0" role="log" aria-live="off" @scroll.passive="onScroll">
            <div v-if="loading && !hasData" class="note muted">Loading logs…</div>
            <div v-else-if="error && !hasData" class="note">
              <strong>Logs are not available</strong>
              <p class="muted">{{ error }}. The allocation may be gone, or its node unreachable.</p>
              <button class="btn sm" @click="load(true)">Try again</button>
            </div>
            <div v-else-if="!rows.length" class="note muted">No output yet.</div>
            <div v-else-if="!shown.length" class="note muted">No lines match your search or level filter.</div>
            <template v-else>
              <div v-for="(r, i) in shown" :key="i" class="ln" :class="[r.lvl, isMarked(r) ? (r.stream === 'stderr' ? 'se' : 'so') : '']">
                <span v-if="hasTime" class="t" :title="r.fullTime">{{ r.time ?? '' }}</span>
                <span v-if="hasLevel" class="lv">{{ r.level ?? '' }}</span>
                <span class="body">
                  <span v-if="isMarked(r)" class="tag" :title="`Written to ${r.stream}`">{{ r.stream }}</span>
                  <span v-if="r.src" class="src">{{ r.src }}</span>
                  <span v-for="(t, ti) in r.msg" :key="ti" :class="t.cls"><template v-for="(p, pi) in hl(t.s)" :key="pi"><mark v-if="p.hit">{{ p.s }}</mark><template v-else>{{ p.s }}</template></template></span>
                </span>
              </div>
            </template>
          </div>
          <button v-if="!atEnd && shown.length" class="btn sm primary jump" @click="follow = true"><ChevronsDown /> Jump to latest</button>
        </div>

        <footer>
          <span><b>{{ shown.length }}</b><template v-if="shown.length !== rows.length"> of {{ rows.length }}</template> line{{ (shown.length === rows.length ? shown.length : rows.length) === 1 ? '' : 's' }}</span>
          <span v-if="counts.err" class="e">{{ counts.err }} error{{ counts.err === 1 ? '' : 's' }}</span>
          <span v-if="counts.warn" class="w">{{ counts.warn }} warning{{ counts.warn === 1 ? '' : 's' }}</span>
          <span v-if="truncated" class="muted">last {{ LOG_TAIL_BYTES / 1024 }} KB only</span>
          <span v-if="mixedUnordered" class="muted" title="These lines carry no timestamps, so Nomad gives no common order">stdout first, then stderr</span>
          <span v-if="partial" class="w">{{ partial }}</span>
          <span v-if="error && hasData" class="w">reload failed, showing the last read</span>
          <span class="grow" />
          <span v-if="updatedAt" class="muted">Updated {{ updatedAt.toLocaleTimeString() }}</span>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.45); animation: fade 0.15s var(--ease); }
.drawer { position: absolute; top: 0; right: 0; bottom: 0; max-width: 100vw; display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-pop); animation: slide 0.25s var(--ease); }
.drawer.dragging { user-select: none; }
.drawer.dragging .out { pointer-events: none; }
.grip { position: absolute; left: -5px; top: 0; bottom: 0; width: 10px; z-index: 2; cursor: col-resize; touch-action: none; }
.grip::after { content: ''; position: absolute; left: 4px; top: 0; bottom: 0; width: 2px; background: var(--accent); opacity: 0; transition: opacity 0.15s var(--ease); }
.grip:hover::after, .grip:focus-visible::after, .dragging .grip::after { opacity: 1; }
.grip:focus-visible { outline: none; }
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
.ln { display: grid; grid-template-columns: var(--cols, 1fr); gap: 0 10px; padding: 1px 16px; color: var(--text-2); }
.ln:hover { background: var(--surface); }
.ln.warn { background: var(--warn-bg); }
.ln.err { background: var(--err-bg); }
.t { color: var(--text-3); white-space: nowrap; user-select: none; font-variant-numeric: tabular-nums; }
.lv { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-3); padding-top: 1px; user-select: none; }
.ln.warn .lv { color: var(--warn); }
.ln.err .lv { color: var(--err); }
.body { min-width: 0; white-space: pre; }
.wrap .body { white-space: pre-wrap; overflow-wrap: anywhere; }
/* Stream marks: stdout is blue, stderr is the accent violet; a warning or error keeps its own tint on top. */
.marks button .dot { width: 7px; height: 7px; border-radius: 2px; background: var(--text-3); }
.marks button:disabled { opacity: 0.45; cursor: not-allowed; }
.marks .so.on { background: var(--busy-bg); color: var(--busy); }
.marks .so.on .dot { background: var(--busy); }
.marks .so.on b { background: var(--busy-bg); color: var(--busy); }
.marks .se.on { background: var(--accent-bg); color: var(--accent-strong); }
.marks .se.on .dot { background: var(--accent-strong); }
.marks .se.on b { background: var(--accent-bg); color: var(--accent-strong); }
.ln.so { background: var(--busy-bg); }
.ln.so.warn { background: linear-gradient(var(--warn-bg), var(--warn-bg)), var(--busy-bg); }
.ln.so.err { background: linear-gradient(var(--err-bg), var(--err-bg)), var(--busy-bg); }
.ln.se { background: var(--accent-bg); }
.ln.se.warn { background: linear-gradient(var(--warn-bg), var(--warn-bg)), var(--accent-bg); }
.ln.se.err { background: linear-gradient(var(--err-bg), var(--err-bg)), var(--accent-bg); }
.tag { display: inline-block; margin-right: 8px; padding: 0 5px; border-radius: 4px; font-size: 10.5px; line-height: 1.5; vertical-align: 1px; user-select: none; }
.so .tag { background: var(--busy-bg); color: var(--busy); }
.se .tag { background: var(--accent-bg); color: var(--accent-strong); }
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
