import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { providerInputSchema, sendMessageSchema } from '@peaper/shared';
import { testProvider, type AgentRuntime, type ProviderStore } from '@peaper/core';

export function agentRoutes(
  app: FastifyInstance,
  agent: AgentRuntime,
  providers: ProviderStore,
  publish: () => void,
) {
  let testing = false;
  const updated = () => {
    agent.store.event('provider.updated', null);
    publish();
  };
  const editable = () => {
    if (agent.running || testing)
      throw Object.assign(
        new Error('Wait for the active task or connection test before changing the provider.'),
        { statusCode: 409 },
      );
  };
  app.get('/api/provider', () => ({ provider: providers.get() }));
  app.put('/api/provider', (request) => {
    editable();
    const provider = providers.save(providerInputSchema.parse(request.body));
    updated();
    return { provider };
  });
  app.delete('/api/provider', () => {
    editable();
    providers.clear();
    updated();
    return { provider: null };
  });
  app.post('/api/provider/test', async () => {
    editable();
    testing = true;
    try {
      const provider = await testProvider(providers);
      updated();
      return { provider };
    } finally {
      testing = false;
      updated();
    }
  });
  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/runs', (request) => ({
    runs: agent.store.list(request.params.sessionId),
  }));
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/messages',
    (request, reply) => {
      const { message, selectedFile, selection, mode } = sendMessageSchema.parse(request.body);
      return reply
        .code(202)
        .send(agent.start(request.params.sessionId, message, selectedFile, selection, { mode }));
    },
  );
  app.post<{ Params: { runId: string } }>('/api/runs/:runId/cancel', (request) =>
    agent.cancel(request.params.runId),
  );
  app.post<{ Params: { runId: string; questionId: string } }>(
    '/api/runs/:runId/questions/:questionId',
    (request) => {
      const { answer } = z
        .object({ answer: z.string().trim().min(1).max(2000) })
        .parse(request.body);
      return agent.answer(request.params.runId, request.params.questionId, answer);
    },
  );
  app.post<{ Params: { runId: string; permissionId: string } }>(
    '/api/runs/:runId/permissions/:permissionId',
    (request) => {
      const { allow } = z.object({ allow: z.boolean() }).parse(request.body);
      return agent.decide(request.params.runId, request.params.permissionId, allow);
    },
  );
}
