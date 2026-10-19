import {
  healthSchema,
  workspaceSchema,
  sessionSchema,
  eventSchema,
  directorySchema,
  workspaceFileSchema,
  agentRunSchema,
  agentRunsSchema,
  modelStateSchema,
  selectionResponseSchema,
  continuityStateSchema,
  contextInfoSchema,
  rewindPreviewSchema,
} from '@peaper/shared';
import type {
  RuntimeEvent,
  ConnectionInput,
  ModelSelection,
  ModelState,
  ModelOptions,
  AgentMode,
} from '@peaper/shared';
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
  sessionDraft: (id: string) =>
    request(`/sessions/${encodeURIComponent(id)}/draft`, continuityStateSchema),
  saveDraft: (id: string, draft: string, mode: AgentMode) =>
    request(`/sessions/${encodeURIComponent(id)}/draft`, continuityStateSchema, {
      method: 'PUT',
      body: JSON.stringify({ draft, mode }),
      keepalive: true,
    }),
  context: (id: string, selection?: ModelSelection | null, path?: string | null) => {
    const query = new URLSearchParams();
    if (selection) {
      query.set('modelId', selection.modelId);
      query.set('effort', selection.effort);
    }
    if (path) query.set('path', path);
    return request(`/sessions/${encodeURIComponent(id)}/context?${query}`, contextInfoSchema);
  },
  compact: (id: string, selection?: ModelSelection | null) =>
    request(`/sessions/${encodeURIComponent(id)}/compact`, contextInfoSchema, {
      method: 'POST',
      body: JSON.stringify({ selection: selection ?? undefined }),
    }),
  renameSession: (id: string, title: string) =>
    request(`/sessions/${encodeURIComponent(id)}`, sessionSchema, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  exportSession: (id: string, format: 'json' | 'markdown') =>
    request(
      `/sessions/${encodeURIComponent(id)}/export?format=${format}`,
      z.object({ filename: z.string(), content: z.string(), type: z.string() }),
    ),
  forkSession: (id: string, afterRunId: string | null, title: string) =>
    request(`/sessions/${encodeURIComponent(id)}/fork`, sessionSchema, {
      method: 'POST',
      body: JSON.stringify({ afterRunId, title }),
    }),
  rewindPreview: (id: string, afterRunId: string | null) =>
    request(`/sessions/${encodeURIComponent(id)}/rewind/preview`, rewindPreviewSchema, {
      method: 'POST',
      body: JSON.stringify({ afterRunId }),
    }),
  rewind: (id: string, afterRunId: string | null, revision: string, paths: string[]) =>
    request(
      `/sessions/${encodeURIComponent(id)}/rewind`,
      z.object({ rewound: z.number(), restored: z.number() }),
      { method: 'POST', body: JSON.stringify({ afterRunId, revision, paths }) },
    ),
  restoreFiles: (id: string, afterRunId: string | null, revision: string, paths: string[]) =>
    request(
      `/sessions/${encodeURIComponent(id)}/restore`,
      z.object({ rewound: z.number(), restored: z.number() }),
      { method: 'POST', body: JSON.stringify({ afterRunId, revision, paths }) },
    ),
  savePlan: (id: string, text: string, revision: number) =>
    request(`/sessions/${encodeURIComponent(id)}/plan`, continuityStateSchema, {
      method: 'PUT',
      body: JSON.stringify({ text, revision }),
    }),
  implementPlan: (id: string, revision: number, selection: ModelSelection | null) =>
    request(`/sessions/${encodeURIComponent(id)}/plan/implement`, agentRunSchema, {
      method: 'POST',
      body: JSON.stringify({ revision, selection: selection ?? undefined }),
    }),
  resumeRun: (id: string, selection: ModelSelection | null) =>
    request(`/runs/${encodeURIComponent(id)}/resume`, agentRunSchema, {
      method: 'POST',
      body: JSON.stringify({ selection: selection ?? undefined }),
    }),
  models: () => request('/models', modelStateSchema),
  saveConnection: (input: ConnectionInput, id?: string) =>
    request(
      id ? `/model-connections/${encodeURIComponent(id)}` : '/model-connections',
      modelStateSchema,
      { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) },
    ),
  refreshModels: (id: string) =>
    request(`/model-connections/${encodeURIComponent(id)}/refresh`, modelStateSchema, {
      method: 'POST',
    }),
  addModel: (connectionId: string, modelId: string, name?: string) =>
    request('/models/manual', modelStateSchema, {
      method: 'POST',
      body: JSON.stringify({ connectionId, modelId, name }),
    }),
  updateModel: (
    id: string,
    values: { favorite?: boolean; showInChat?: boolean; options?: ModelOptions },
  ) =>
    request(`/models/${encodeURIComponent(id)}`, modelStateSchema, {
      method: 'PATCH',
      body: JSON.stringify(values),
    }),
  testModel: (id: string) =>
    request(`/models/${encodeURIComponent(id)}/test`, modelStateSchema, { method: 'POST' }),
  saveDefaults: (defaults: ModelState['defaults']) =>
    request('/model-defaults', modelStateSchema, { method: 'PUT', body: JSON.stringify(defaults) }),
  sessionModel: (id: string) =>
    request(`/sessions/${encodeURIComponent(id)}/model`, selectionResponseSchema),
  selectModel: (id: string, selection: ModelSelection) =>
    request(`/sessions/${encodeURIComponent(id)}/model`, selectionResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(selection),
    }),
  answerQuestion: (id: string, questionId: string, answer: string) =>
    request(
      `/runs/${encodeURIComponent(id)}/questions/${encodeURIComponent(questionId)}`,
      agentRunSchema,
      { method: 'POST', body: JSON.stringify({ answer }) },
    ),
  runs: (sessionId: string) =>
    request(`/sessions/${encodeURIComponent(sessionId)}/runs`, agentRunsSchema),
  sendMessage: (
    sessionId: string,
    message: string,
    selectedFile: string | null,
    selection?: ModelSelection,
    mode?: AgentMode,
  ) =>
    request(`/sessions/${encodeURIComponent(sessionId)}/messages`, agentRunSchema, {
      method: 'POST',
      body: JSON.stringify({ message, selectedFile, selection, mode }),
    }),
  cancelRun: (id: string) =>
    request(`/runs/${encodeURIComponent(id)}/cancel`, agentRunSchema, { method: 'POST' }),
  decidePermission: (id: string, permissionId: string, allow: boolean) =>
    request(
      `/runs/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`,
      agentRunSchema,
      { method: 'POST', body: JSON.stringify({ allow }) },
    ),
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
