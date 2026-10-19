import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { agentRunSchema } from '@peaper/shared';
import { MemoryTaskLens } from '../src/features/memory/MemoryTaskLens.js';

test('task Memory Lens renders captured revisions, initial/search reasons, exclusions and untrusted evidence as plain text', () => {
  const run = agentRunSchema.parse({
    id: 'task',
    sessionId: 'session',
    prompt: 'Inspect',
    model: 'fixture',
    status: 'completed',
    text: '',
    startedAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    activities: [],
    permissions: [],
    changes: [],
    todos: [],
    knowledge: {
      memories: [
        {
          id: 'memory',
          title: 'Captured decision',
          body: 'ORIGINAL_SNAPSHOT',
          scope: 'project',
          sessionId: null,
          sourceRunId: null,
          pinned: false,
          revision: 2,
          createdAt: '2026-10-20T00:00:00Z',
          updatedAt: '2026-10-20T00:00:00Z',
          evidence: [
            {
              reference: { kind: 'file', path: 'src/theme.ts' },
              workspaceId: 'workspace',
              label: 'Theme source',
              digest: 'a'.repeat(64),
              excerpt: '<script>unsafe()</script>',
              capturedAt: '2026-10-20T00:00:00Z',
            },
          ],
        },
      ],
      memoryContext: [
        {
          id: 'memory',
          revision: 2,
          title: 'Captured decision',
          scope: 'project',
          selected: true,
          reason: 'search',
          stage: 'search',
          matchedTerms: ['theme'],
        },
        {
          id: 'excluded',
          revision: 1,
          title: 'Excluded decision',
          scope: 'project',
          selected: false,
          reason: 'excluded',
          stage: 'initial',
        },
      ],
    },
  });
  const html = renderToStaticMarkup(<MemoryTaskLens run={run} />);
  assert.match(html, /ORIGINAL_SNAPSHOT/);
  assert.match(html, /During task/);
  assert.match(html, /Found during agent search/);
  assert.match(html, /Excluded for this task/);
  assert.match(html, /r2/);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  delete run.knowledge.memoryContext;
  assert.match(
    renderToStaticMarkup(<MemoryTaskLens run={run} />),
    /Selection reason was not recorded/,
  );
});
