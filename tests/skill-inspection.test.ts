import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkillDetail } from '@peaper/shared';
import { inspectReferences, inspectSkill } from '../packages/core/src/skills/inspection.js';

const skill: SkillDetail = {
  id: 'project:review-ui',
  name: 'review-ui',
  scope: 'project',
  path: '/skills/review-ui/SKILL.md',
  enabled: true,
  automatic: true,
  compatibility: 'Node.js 24 and a custom package.',
  description: 'Review UI.',
  document: '',
  instructions: '',
  digest: 'a'.repeat(64),
  resources: [
    'scripts/check.mjs',
    'scripts/helpers/check.py',
    'references/layout guide.md',
    'examples/basic.md',
  ].map((path) => ({ path, bytes: 10 })),
};
test('inspector resolves nested and encoded references, reports missing/outside paths and ignores web links', () => {
  const result = inspectReferences({
    ...skill,
    instructions:
      '[Guide](<references/layout guide.md>)\n[Same guide](./references/layout%20guide.md#intro)\nRead scripts/check.mjs, then references/missing.md.\n[Outside](../secret.txt) [Encoded outside](%2e%2e/secret.txt) [Web](https://example.com/scripts/remote.mjs)\nhttps://example.com/references/remote.md\n[Anchor](#example) [Folder](examples/) [Instructions](SKILL.md)',
  });
  assert.deepEqual(
    result.references.map(({ path, status }) => [path, status]),
    [
      ['references/layout guide.md', 'found'],
      ['../secret.txt', 'outside'],
      ['examples/', 'found'],
      ['SKILL.md', 'found'],
      ['scripts/check.mjs', 'found'],
      ['references/missing.md', 'missing'],
    ],
  );
  assert.equal(result.referencesTruncated, false);
  const many = inspectReferences({
    ...skill,
    instructions: Array.from({ length: 140 }, (_, i) => `references/${i}.md`).join('\n'),
  });
  assert.equal(many.references.length, 128);
  assert.equal(many.referencesTruncated, true);
});
test('inspector reports runner availability without executing scripts or claiming package/version validation', async () => {
  const result = await inspectSkill(
    {
      ...skill,
      resources: [
        ...skill.resources,
        { path: 'scripts/check.sh', bytes: 10 },
        { path: 'scripts/check.ts', bytes: 10 },
      ],
    },
    { PATH: '' },
    'win32',
  );
  assert.equal(result.runtimes.find((r) => r.name === 'Node.js')?.status, 'available');
  assert.equal(result.runtimes.find((r) => r.name === 'Python')?.status, 'unavailable');
  assert.equal(result.runtimes.find((r) => r.name === 'POSIX shell')?.status, 'unsupported');
  assert.equal(result.runtimes.find((r) => r.name.includes('.ts'))?.status, 'unsupported');
  assert.equal(result.skill.compatibility, skill.compatibility);
  assert.ok(result.inspectedAt);
});
