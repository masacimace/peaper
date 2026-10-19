import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agentModeSchema, modelSelectionSchema } from '@peaper/shared';
import { configuredSelection, type AgentRuntime, type ProviderStore } from '@peaper/core';

export function continuityRoutes(
  app: FastifyInstance,
  agent: AgentRuntime,
  providers: ProviderStore,
) {
  const service = agent.continuity;
  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/draft', (request) =>
    service.get(request.params.sessionId),
  );
  function idle(sessionId: string) {
    agent.store.session(sessionId);
    if (agent.hasActive(sessionId) || service.busy.has(sessionId) || service.restoring)
      throw Object.assign(new Error('Finish or cancel the active session operation first.'), {
        statusCode: 409,
      });
  }
  app.get<{
    Params: { sessionId: string };
    Querystring: { modelId?: string; effort?: string; path?: string };
  }>('/api/sessions/:sessionId/context', (request) => {
    const { modelId, effort, path } = z
      .object({
        modelId: z.string().optional(),
        effort: z.string().optional(),
        path: z.string().max(2048).optional(),
      })
      .parse(request.query);
    return service.info(
      request.params.sessionId,
      modelId ? modelSelectionSchema.parse({ modelId, effort }) : undefined,
      path,
    );
  });
  app.patch<{ Params: { sessionId: string } }>('/api/sessions/:sessionId', (request) => {
    const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(request.body);
    return service.rename(request.params.sessionId, title);
  });
  app.put<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/draft', (request) => {
    const { draft, mode } = z
      .object({ draft: z.string().max(16000), mode: agentModeSchema.optional() })
      .parse(request.body);
    return service.update(request.params.sessionId, {
      draft,
      draftUpdatedAt: new Date().toISOString(),
      ...(mode ? { mode } : {}),
    });
  });
  app.get<{ Params: { sessionId: string }; Querystring: { format?: string } }>(
    '/api/sessions/:sessionId/export',
    (request) =>
      service.export(
        request.params.sessionId,
        z.enum(['json', 'markdown']).parse(request.query.format ?? 'markdown'),
      ),
  );
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/compact',
    async (request) => {
      const selection = z
        .object({ selection: modelSelectionSchema.optional() })
        .parse(request.body ?? {}).selection;
      idle(request.params.sessionId);
      const configured = configuredSelection(
        providers,
        selection ?? agent.store.selection(request.params.sessionId),
      );
      if (!configured.model.verifiedAt)
        throw Object.assign(new Error('Test this model before compacting.'), { statusCode: 409 });
      await service.compact(request.params.sessionId, configured);
      return service.info(request.params.sessionId, selection);
    },
  );
  app.post<{ Params: { runId: string } }>('/api/runs/:runId/resume', (request, reply) => {
    const { selection, message } = z
      .object({
        selection: modelSelectionSchema.optional(),
        message: z.string().trim().max(2000).optional(),
      })
      .parse(request.body ?? {});
    return reply.code(202).send(agent.resume(request.params.runId, selection, message));
  });
  app.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/fork', (request, reply) => {
    const { afterRunId, title } = z
      .object({ afterRunId: z.string().nullable(), title: z.string().trim().min(1).max(120) })
      .parse(request.body);
    idle(request.params.sessionId);
    return reply.code(201).send(service.fork(request.params.sessionId, afterRunId, title));
  });
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/rewind/preview',
    (request) => {
      const { afterRunId } = z.object({ afterRunId: z.string().nullable() }).parse(request.body);
      idle(request.params.sessionId);
      return service.preview(request.params.sessionId, afterRunId);
    },
  );
  for (const operation of ['rewind', 'restore'] as const)
    app.post<{ Params: { sessionId: string } }>(
      `/api/sessions/:sessionId/${operation}`,
      async (request) => {
        const { afterRunId, revision, paths } = z
          .object({
            afterRunId: z.string().nullable(),
            revision: z.string().length(64),
            paths: z.array(z.string()).max(100),
          })
          .parse(request.body);
        idle(request.params.sessionId);
        if ((operation === 'restore' && !paths.length) || (operation === 'rewind' && paths.length))
          throw Object.assign(
            new Error('Restore selected files and rewind the conversation in separate actions.'),
            { statusCode: 400 },
          );
        if (agent.running)
          throw Object.assign(
            new Error('Wait for all workspace tasks before restoring or rewinding.'),
            { statusCode: 409 },
          );
        service.restoring = true;
        try {
          return await service.rewind(
            request.params.sessionId,
            afterRunId,
            revision,
            paths,
            operation === 'rewind',
          );
        } finally {
          service.restoring = false;
        }
      },
    );
  app.put<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/plan', (request) => {
    idle(request.params.sessionId);
    const { text, revision } = z
      .object({ text: z.string().trim().min(1).max(12000), revision: z.number().int() })
      .parse(request.body);
    const plan = service.get(request.params.sessionId).plan;
    if (!plan || plan.revision !== revision || plan.implementedBy)
      throw Object.assign(
        new Error('This plan changed or has already been implemented. Reload the plan.'),
        { statusCode: 409 },
      );
    return service.update(request.params.sessionId, {
      plan: { ...plan, text, revision: revision + 1 },
    });
  });
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/plan/implement',
    (request, reply) => {
      const { revision, selection } = z
        .object({ revision: z.number().int(), selection: modelSelectionSchema.optional() })
        .parse(request.body);
      const plan = service.get(request.params.sessionId).plan;
      if (plan?.implementedBy) return reply.code(202).send(agent.store.get(plan.implementedBy));
      idle(request.params.sessionId);
      if (!plan || plan.revision !== revision)
        throw Object.assign(new Error('Review the latest plan before implementation.'), {
          statusCode: 409,
        });
      const run = agent.start(
        request.params.sessionId,
        `Implement this reviewed plan:\n\n${plan.text}`,
        null,
        selection,
        { mode: 'build' },
      );
      service.update(request.params.sessionId, {
        mode: 'build',
        plan: { ...plan, implementedBy: run.id },
      });
      return reply.code(202).send(run);
    },
  );
}
