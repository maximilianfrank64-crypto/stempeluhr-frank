import { SYNC_AUTH_HEADER } from '../config';
import type { SyncMessage } from '../core/sync';

/** POST one message to the n8n webhook. Throws with a short reason on failure. */
export async function sendMessage(url: string, accessKey: string, msg: SyncMessage): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SYNC_AUTH_HEADER]: accessKey },
      body: JSON.stringify(msg),
      keepalive: true,
    });
  } catch {
    throw new Error('offline');
  }
  if (res.status === 401 || res.status === 403) throw new Error('auth');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
