import type { FastifyInstance } from 'fastify';
import {
  connectionInputSchema,
  manualModelSchema,
  modelDefaultsSchema,
  modelPreferenceSchema,
  modelSelectionSchema,
} from '@peaper/shared';
import {
  refreshCatalog,
  testManagedModel,
  type AgentRuntime,
  type ProviderStore,
} from '@peaper/core';

export function modelRoutes(
  app: FastifyInstance,
  store: ProviderStore,
  agent: AgentRuntime,
  publish: () => void,
) {
  const locks = new Set<string>();
  function updated(sessionId: string | null = null) {
    agent.store.event('models.updated', sessionId);
    publish();
    return store.snapshot();
  }
  function editable(id: string) {
    if (locks.has(id))
      throw Object.assign(new Error('This connection is being checked. Wait for it to finish.'), {
        statusCode: 409,
      });
    if (!store.snapshot().connections.some((item) => item.id === id))
      throw Object.assign(new Error('Provider connection not found.'), { statusCode: 404 });
  }
  function modelConnection(id: string) {
    const model = store.snapshot().models.find((item) => item.id === id);
    if (!model) throw Object.assign(new Error('Model not found.'), { statusCode: 404 });
    return model.connectionId;
  }
  async function check(id: string, action: () => Promise<unknown>) {
    editable(id);
    locks.add(id);
    try {
      await action();
      return store.snapshot();
    } finally {
      locks.delete(id);
      updated();
    }
  }
  app.get('/api/models', () => store.snapshot());
  app.post('/api/model-connections', (request) => {
    store.saveConnection(connectionInputSchema.parse(request.body));
    return updated();
  });
  app.put<{ Params: { id: string } }>('/api/model-connections/:id', (request) => {
    editable(request.params.id);
    store.saveConnection(connectionInputSchema.parse(request.body), request.params.id);
    return updated();
  });
  app.post<{ Params: { id: string } }>('/api/model-connections/:id/refresh', (request) =>
    check(request.params.id, () => refreshCatalog(store, request.params.id)),
  );
  app.post('/api/models/manual', (request) => {
    const input = manualModelSchema.parse(request.body);
    editable(input.connectionId);
    store.addManual(input.connectionId, input.modelId, input.name);
    return updated();
  });
  app.patch<{ Params: { id: string } }>('/api/models/:id', (request) => {
    editable(modelConnection(request.params.id));
    store.updateModel(request.params.id, modelPreferenceSchema.parse(request.body));
    return updated();
  });
  app.post<{ Params: { id: string } }>('/api/models/:id/test', (request) =>
    check(modelConnection(request.params.id), () => testManagedModel(store, request.params.id)),
  );
  app.put('/api/model-defaults', (request) => {
    store.setDefaults(modelDefaultsSchema.parse(request.body));
    return updated();
  });
  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/model', (request) => ({
    selection: agent.store.selection(request.params.sessionId),
  }));
  app.put<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/model', (request) => {
    const selection = modelSelectionSchema.parse(request.body);
    store.resolve(selection);
    agent.store.select(request.params.sessionId, selection);
    return { selection };
  });
}
