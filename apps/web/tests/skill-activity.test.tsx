import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { agentRunSchema } from '@peaper/shared';
import { SkillActivity } from '../src/features/skills/SkillActivity.js';
import { skillTraces } from '../src/features/skills/skill-activity.js';
import { skillFileTree } from '../src/features/skills/skill-files.js';

const run = () =>
  agentRunSchema.parse({
    id: 'task',
    sessionId: 'session',
    prompt: 'Check',
    model: 'fixture',
    status: 'completed',
    text: '',
    startedAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    activities: [
      {
        id: 'discover',
        name: 'find_skills',
        input: { query: 'check' },
        status: 'completed',
        output: '[]',
      },
      {
        id: 'script',
        name: 'run_skill_script',
        input: { id: 'project:check', path: 'scripts/check.mjs' },
        status: 'completed',
        output: JSON.stringify({
          exitCode: 1,
          output: 'FAILED',
          timedOut: false,
          cancelled: false,
        }),
      },
    ],
    permissions: [
      {
        id: 'approval',
        activityId: 'script',
        kind: 'command',
        status: 'approved',
        description: 'Run script',
        command: 'node check.mjs',
      },
    ],
    changes: [],
    todos: [],
    knowledge: {
      skills: [
        {
          id: 'project:check',
          name: 'check',
          description: 'Check code',
          scope: 'project',
          path: '/skills/check/SKILL.md',
          compatibility: 'Node.js',
          enabled: true,
          automatic: true,
          instructions: 'Read before checking.',
          digest: 'a'.repeat(64),
          invocation: 'automatic',
          activationReason: 'Matches the requested project verification.',
        },
      ],
    },
  });
test('skill activity joins exact permissions, preserves execution failure and handles discovery-only or historical tasks', () => {
  const task = run(),
    trace = skillTraces(task)[0]!;
  assert.equal(trace.events[0]!.permission?.status, 'approved');
  assert.equal(trace.events[0]!.step, 2);
  const html = renderToStaticMarkup(<SkillActivity run={task} />);
  assert.match(html, /Matches the requested project verification/);
  assert.match(html, /exit 1/);
  assert.match(html, /Approval approved/);
  assert.match(html, /FAILED/);
  assert.doesNotMatch(html, /exit 0/);
  delete task.knowledge.skills[0]!.activationReason;
  assert.match(
    renderToStaticMarkup(<SkillActivity run={task} />),
    /No selection reason was recorded/,
  );
  task.knowledge.skills = [];
  assert.match(renderToStaticMarkup(<SkillActivity run={task} />), /Activation not recorded/);
  task.activities = task.activities.slice(0, 1);
  assert.equal(skillTraces(task).length, 0);
  assert.match(
    renderToStaticMarkup(<SkillActivity run={task} />),
    /does not mean a skill was activated/,
  );
  task.activities = [];
  assert.equal(renderToStaticMarkup(<SkillActivity run={task} />), '');
});
test('skill file tree preserves nested scripts and same-named resources in different folders', () => {
  const tree = skillFileTree([
    { path: 'scripts/helpers/check.mjs', bytes: 12 },
    { path: 'references/check.mjs', bytes: 8 },
  ]);
  assert.equal(
    tree.find((n) => n.name === 'scripts')?.children[0]?.children[0]?.path,
    'scripts/helpers/check.mjs',
  );
  assert.equal(
    tree.find((n) => n.name === 'references')?.children[0]?.path,
    'references/check.mjs',
  );
  assert.equal(tree.filter((n) => n.name === 'SKILL.md').length, 1);
});
