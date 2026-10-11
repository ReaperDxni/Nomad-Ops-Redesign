import { ref } from 'vue'
import pb from '../services/pb'
import type { User } from '../lib/types'
import { startAll, stopAll } from './realtime'

export const currentUser = ref<User | null>((pb.authStore.model as unknown as User) ?? null)

pb.authStore.onChange((_token, model) => {
  currentUser.value = (model as unknown as User) ?? null
})

export function isAuthed(): boolean {
  return pb.authStore.isValid
}

export async function refreshAuth(): Promise<boolean> {
  if (!pb.authStore.isValid) return false
  try {
    await pb.collection('users').authRefresh({ $autoCancel: false })
    return true
  } catch {
    pb.authStore.clear()
    return false
  }
}

let started = false

/** Verifies the stored session once and starts the realtime stores. */
export async function ensureSession(): Promise<boolean> {
  if (!isAuthed()) return false
  if (!started) {
    if (!(await refreshAuth())) return false
    started = true
    startAll()
  }
  return true
}

export async function login(identity: string, password: string) {
  await pb.collection('users').authWithPassword(identity, password)
}

export async function loginWithProvider(provider: string) {
  await pb.collection('users').authWithOAuth2({ provider })
}

export async function listProviders(): Promise<string[]> {
  try {
    const methods: any = await pb.collection('users').listAuthMethods()
    return (methods.authProviders ?? []).map((p: any) => p.name as string)
  } catch {
    return []
  }
}

export function logout() {
  started = false
  stopAll()
  pb.authStore.clear()
}

export function displayName(u: Pick<User, 'username' | 'email' | 'name'> | null | undefined): string {
  return u?.name || u?.username || u?.email || 'Unknown'
}
