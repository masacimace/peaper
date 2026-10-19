import {
  healthSchema,
  workspaceSchema,
  sessionSchema,
  eventSchema,
  directorySchema,
  workspaceFileSchema,
} from '@peaper/shared';
import type { RuntimeEvent } from '@peaper/shared';
import { z } from 'zod';

const fragment = new URLSearchParams(window.location.hash.slice(1));
const incoming = fragment.get('token');
if (incoming) {
  sessionStorage.setItem('peaper:token', incoming);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
export const accessToken = sessionStorage.getItem('peaper:token') || '';

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return schema.parse(await response.json());
}

export const api = {
  health: () => request('/health', healthSchema),
  workspace: () => request('/workspace', workspaceSchema),
  files: (path = '') => request(`/files?path=${encodeURIComponent(path)}`, directorySchema),
  file: (path: string) => request(`/file?path=${encodeURIComponent(path)}`, workspaceFileSchema),
  sessions: async (search = '') =>
    (
      await request(
        `/sessions?q=${encodeURIComponent(search)}`,
        z.object({ sessions: z.array(sessionSchema) }),
      )
    ).sessions,
  createSession: (title: string) =>
    request('/sessions', sessionSchema, { method: 'POST', body: JSON.stringify({ title }) }),
};

export async function subscribeEvents(
  workspaceId: string,
  signal: AbortSignal,
  onEvent: (event: RuntimeEvent) => void,
  onConnection: (connected: boolean) => void,
) {
  const cursorKey = `peaper:cursor:${workspaceId}`;
  let cursor = Number(sessionStorage.getItem(cursorKey)) || 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(`/api/events?after=${cursor}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!response.ok || !response.body) throw new Error('Event stream unavailable');
      onConnection(true);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const packet = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = packet.split('\n').find((line) => line.startsWith('data: '));
            if (!data) continue;
            const event = eventSchema.parse(JSON.parse(data.slice(6)));
            if (event.id <= cursor) continue;
            onEvent(event);
            cursor = event.id;
            sessionStorage.setItem(cursorKey, String(cursor));
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch {
      if (signal.aborted) return;
    }
    onConnection(false);
    await new Promise<void>((done) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        done();
      };
      const timer = setTimeout(finish, 2_000);
      signal.addEventListener('abort', finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
