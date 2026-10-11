import PocketBase from 'pocketbase'
import { toast } from '../stores/toast'

const pb = new PocketBase(import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin)

pb.afterSend = (response: Response, data: any) => {
  if (response.status > 299 && !response.url.includes('/api/realtime')) {
    const msg = data?.message ? `${data.message}` : `${response.status}`
    if (response.status !== 401 && response.status !== 404) toast.error(`Request failed: ${msg}`)
  }
  return data
}

export default pb
