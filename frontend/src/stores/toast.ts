import { reactive } from 'vue'

export interface Toast { id: number; kind: 'ok' | 'err'; text: string }

const state = reactive<{ items: Toast[] }>({ items: [] })
let seq = 0

function push(kind: Toast['kind'], text: string) {
  const id = ++seq
  state.items.push({ id, kind, text })
  setTimeout(() => dismiss(id), kind === 'err' ? 6000 : 3500)
}

export function dismiss(id: number) {
  const i = state.items.findIndex((t) => t.id === id)
  if (i >= 0) state.items.splice(i, 1)
}

export const toast = {
  state,
  success: (text: string) => push('ok', text),
  error: (text: string) => push('err', text),
}
