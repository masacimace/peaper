import type { FastifyInstance } from 'fastify';
import type { AgentRuntime } from '@peaper/core';
import {
  contextSelectionSchema,
  memoryInputSchema,
  personaInputSchema,
  memorySelectionSchema,
} from '@peaper/shared';
import { z } from 'zod';

const idParams = z.object({ id: z.string().max(120) });
export function knowledgeRoutes(app: FastifyInstance, agent: AgentRuntime) {
  const { store, skills } = agent.knowledge;
  const memory = agent.knowledge.memory;
  app.post('/api/memory-lens', (request) => {
    const value = z
      .object({
        sessionId: z.string().optional(),
        query: z.string().max(16000).default(''),
        selection: memorySelectionSchema.default({ includeIds: [], excludeIds: [] }),
      })
      .parse(request.body);
    return store.memoryLens(value.sessionId, value.query, value.selection);
  });
  const reviewInput = z.object({
    value: memoryInputSchema,
    proposalId: z.string().optional(),
    previousId: z.string().optional(),
    previousRevision: z.number().int().optional(),
  });
  app.post('/api/memory-review', (request) => {
    const { value, ...options } = reviewInput.parse(request.body);
    return memory.review(value, options);
  });
  app.post('/api/memory-review/commit', (request) => {
    const { value, ...options } = reviewInput
      .extend({
        inputDigest: z.string().length(64),
        evidenceDigest: z.string().length(64),
        action: z.enum(['create', 'update']),
        targetId: z.string().optional(),
        targetRevision: z.number().int().optional(),
      })
      .parse(request.body);
    return memory.commit(value, options);
  });
  app.get('/api/knowledge', (request) =>
    agent.knowledge.state(
      z.object({ sessionId: z.string().optional() }).parse(request.query).sessionId,
    ),
  );
  app.put<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/context-selection',
    (request) => store.select(request.params.sessionId, contextSelectionSchema.parse(request.body)),
  );
  app.get('/api/skills', () => skills.catalog());
  app.get('/api/skills/:id', (request) => skills.inspect(idParams.parse(request.params).id));
  app.get('/api/skills/:id/inspection', (request) =>
    skills.inspection(idParams.parse(request.params).id),
  );
  app.get('/api/skills/:id/resource', (request) => {
    const { path } = z.object({ path: z.string().max(1024) }).parse(request.query);
    return skills.readResource(idParams.parse(request.params).id, path, true);
  });
  app.post('/api/skills', (request) => {
    const { name, scope, document } = z
      .object({
        name: z.string().max(64),
        scope: z.enum(['personal', 'project']),
        document: z.string().max(65536),
      })
      .parse(request.body);
    return skills.save(scope, document, name);
  });
  app.put('/api/skills/:id', (request) => {
    const { id } = idParams.parse(request.params),
      [scope, name] = id.split(':');
    const { document, digest } = z
      .object({ document: z.string().max(65536), digest: z.string().length(64) })
      .parse(request.body);
    return skills.save(z.enum(['personal', 'project']).parse(scope), document, name!, digest);
  });
  app.patch('/api/skills/:id', (request) => {
    const { enabled, automatic } = z
      .object({ enabled: z.boolean(), automatic: z.boolean() })
      .parse(request.body);
    return skills.preference(idParams.parse(request.params).id, enabled, automatic);
  });
  app.post('/api/skills/import', (request) => {
    const { path, scope } = z
      .object({ path: z.string().min(1).max(2048), scope: z.enum(['personal', 'project']) })
      .parse(request.body);
    return skills.importFolder(path, scope);
  });
  app.post('/api/personas', (request) => store.saveProfile(personaInputSchema.parse(request.body)));
  app.put('/api/personas/:id', (request) => {
    const value = personaInputSchema.extend({ revision: z.number().int() }).parse(request.body);
    return store.saveProfile(value, idParams.parse(request.params).id, value.revision);
  });
  app.delete('/api/personas/:id', (request) => {
    store.deleteProfile(
      idParams.parse(request.params).id,
      z.object({ revision: z.number().int() }).parse(request.body).revision,
    );
    return { deleted: true };
  });
  app.put('/api/persona-default', (request) => {
    store.setDefaultProfile(z.object({ id: z.string().max(100) }).parse(request.body).id);
    return { id: store.defaultProfileId() };
  });
  app.get('/api/memories', (request) => {
    const { q, scope, sessionId } = z
      .object({
        q: z.string().max(200).default(''),
        scope: z.enum(['all', 'global', 'project', 'recap']).default('all'),
        sessionId: z.string().optional(),
      })
      .parse(request.query);
    return { memories: store.listMemories(q, scope, sessionId) };
  });
  app.post('/api/memories', (request) => memory.save(memoryInputSchema.parse(request.body)));
  app.get('/api/memories/:id/evidence', (request) =>
    store.evidenceView(idParams.parse(request.params).id),
  );
  app.get('/api/memories/:id', (request) => store.memory(idParams.parse(request.params).id));
  app.put('/api/memories/:id', (request) => {
    const value = memoryInputSchema.extend({ revision: z.number().int() }).parse(request.body);
    return memory.save(value, idParams.parse(request.params).id, value.revision);
  });
  app.delete('/api/memories/:id', (request) => {
    store.deleteMemory(
      idParams.parse(request.params).id,
      z.object({ revision: z.number().int() }).parse(request.body).revision,
    );
    return { deleted: true };
  });
  app.get('/api/memory-suggestions/:id', (request) =>
    store.proposal(idParams.parse(request.params).id),
  );
  app.post('/api/memory-suggestions/:id', (request) => {
    const { action, edited } = z
      .object({ action: z.enum(['save', 'dismiss']), edited: memoryInputSchema.optional() })
      .parse(request.body);
    return memory.decide(idParams.parse(request.params).id, action, edited);
  });
}
