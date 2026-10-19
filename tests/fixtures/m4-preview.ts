import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPeaperServer } from '../../apps/server/src/index.js';
import { testProvider } from '../../packages/core/src/providers/model.js';
import { modelFixture, type FixtureReply } from '../helpers/model-fixture.js';

// Isolated M4 browser QA: deterministic local model, real skill files, command and SQLite.
const directory = await mkdtemp(join(tmpdir(), 'peaper-m4-ui-')),
  workspace = join(directory, 'skills-workspace');
await mkdir(workspace);
await writeFile(join(workspace, 'math.mjs'), 'export const add = (a, b) => a + b;\n');
await writeFile(
  join(workspace, 'PEAPER.md'),
  '# Workspace rules\nRead code before judging behavior. Report real verification results.\n',
);
const model = await modelFixture((request) => {
  if (request.messages.some((m) => m.content?.includes('PEAPER_COMPACTION')))
    return {
      text: 'The project exposes add(a, b). Preserve the export, inspect the current file and obtain approval before running checks. Record only actual verification outcomes.',
    };
  const index = request.messages
    .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
    .filter((m) => m.role === 'tool').length;
  const planning = request.messages.some(
    (m) => m.role === 'system' && m.content?.includes('PLAN MODE:'),
  );
  const verified = request.messages
    .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
    .some(
      (m) =>
        m.role === 'tool' &&
        m.content?.includes('M4_CHECK_OK') &&
        m.content?.includes('"exitCode":0'),
    );
  const steps: FixtureReply[] = planning
    ? [
        {
          tool: 'load_skill',
          input: {
            id: 'project:verify-project',
            reason: 'The project verification skill matches the requested addition check.',
          },
        },
        {
          tool: 'read_skill_resource',
          input: { id: 'project:verify-project', path: 'references/checklist.md' },
        },
        { tool: 'read_file', input: { path: 'math.mjs' } },
        {
          tool: 'propose_plan',
          input: {
            plan: '# Verify addition\n\n1. Read math.mjs and the skill checklist.\n2. Obtain approval to run scripts/check.mjs.\n3. Record the actual command result and offer a session recap for review.',
          },
        },
        {
          text: 'The verification plan is ready for review. I loaded the project skill and inspected math.mjs. No commands were run.',
        },
      ]
    : [
        {
          tool: 'load_skill',
          input: {
            id: 'project:verify-project',
            reason: 'The project verification skill matches the requested addition check.',
          },
        },
        {
          tool: 'read_skill_resource',
          input: { id: 'project:verify-project', path: 'references/checklist.md' },
        },
        { tool: 'read_file', input: { path: 'math.mjs' } },
        {
          tool: 'run_skill_script',
          input: { id: 'project:verify-project', path: 'scripts/check.mjs', args: [] },
        },
        {
          tool: 'propose_memory',
          input: {
            title: 'Addition verification',
            body: verified
              ? 'math.mjs exports add(a, b). The skill check verified add(2, 3) === 5 and printed M4_CHECK_OK with exit code 0. Preserve the named export.'
              : 'The addition export was inspected. Command verification has not succeeded; inspect its reported outcome before relying on it.',
            scope: 'project',
            files: ['math.mjs'],
            activityIds: request.messages
              .flatMap((m) => m.tool_calls ?? [])
              .filter((call) => call.function.name === 'run_skill_script')
              .slice(-1)
              .map((call) => call.id),
          },
        },
        {
          tool: 'propose_memory',
          input: {
            title: 'Verification session recap',
            body: verified
              ? 'Read the project skill, its checklist and math.mjs. After command approval, scripts/check.mjs passed with M4_CHECK_OK. No code edits were needed. Continue by choosing which reviewed findings to save.'
              : 'Read the project skill, checklist and math.mjs. Script verification remains unresolved. Review tool output before continuing.',
            scope: 'recap',
          },
        },
        {
          text: verified
            ? 'The project skill was used to verify `math.mjs`. After your approval, its script printed **M4_CHECK_OK: add(2, 3) === 5** and exited with code 0. No code changes were needed. Two memory suggestions are ready for your review; choose which to save.'
            : 'The project skill and code were inspected. Script verification did not complete successfully. Review its activity output; the suggested notes preserve that uncertainty.',
        },
      ];
  return steps[index] ?? { text: 'Fixture task complete.' };
});
const runtime = await createPeaperServer({
  workspace,
  dataDirectory: join(directory, 'profile'),
  distributionDirectory: resolve('dist'),
  version: 'M4-browser-fixture',
});
runtime.providers.save({
  kind: 'compatible',
  baseURL: model.url,
  model: 'fixture-model',
  apiKey: 'local-fixture-key',
  maxOutputTokens: 4096,
  temperature: null,
});
await testProvider(runtime.providers);
const session = runtime.database.createSession(runtime.workspace.id, 'Verify the project').session;
const skill = await runtime.agent.knowledge.skills.save(
  'project',
  '---\nname: verify-project\ndescription: Verify the addition export using the project checklist and local check script. Use for reviewing or testing this project.\ncompatibility: Node.js 24\n---\n# Verify this project\nRead references/checklist.md, inspect math.mjs, then request approval for scripts/check.mjs. Report the actual output and exit status. Offer useful decisions or session recaps for user review; never save memory automatically.\n',
  'verify-project',
);
const skillRoot = join(workspace, '.peaper/skills/verify-project');
await mkdir(join(skillRoot, 'references'));
await mkdir(join(skillRoot, 'scripts'));
await writeFile(
  join(skillRoot, 'references/checklist.md'),
  '# Checklist\nPreserve the named export. Inspect the code. Run the check only after approval. Record observed results accurately.\n',
);
await writeFile(
  join(skillRoot, 'scripts/check.mjs'),
  "import { pathToFileURL } from 'node:url';\nimport { join } from 'node:path';\nconst { add } = await import(pathToFileURL(join(process.cwd(), 'math.mjs')).href);\nif (add(2, 3) !== 5) throw new Error('Addition failed');\nconsole.log('M4_CHECK_OK: add(2, 3) === 5');\n",
);
await mkdir(join(skillRoot, 'references/examples'), { recursive: true });
await writeFile(
  join(skillRoot, 'references/examples/basic.md'),
  '# Example\nInvoke /verify-project to inspect the current addition export and request approval for its check script.\n',
);
const profile = runtime.agent.knowledge.store.saveProfile({
  name: 'Evidence first',
  description: 'Focused changes and concrete verification.',
  instructions:
    'Inspect before acting. Keep explanations concise. Separate verified results from assumptions and suggestions.',
  scope: 'project',
});
runtime.agent.knowledge.store.setDefaultProfile(profile.id);
runtime.agent.knowledge.store.saveMemory({
  title: 'Preserve the public API',
  body: 'The addition helper exposes the named export add(a, b). Keep that API stable when making changes.',
  scope: 'project',
  pinned: true,
});
runtime.agent.knowledge.store.saveMemory({
  title: 'Communication preference',
  body: 'Prefer concise explanations with file paths and actual verification results.',
  scope: 'global',
  pinned: true,
});
runtime.agent.knowledge.store.saveMemory({
  title: 'Addition verification',
  body: 'Keep the addition export stable. Command verification has not been recorded yet.',
  scope: 'project',
});
const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' });
console.log(
  JSON.stringify({
    url: `${url}/#token=${runtime.token}`,
    workspace,
    sessionId: session.id,
    skillId: skill.id,
  }),
);
const stop = async () => {
  await runtime.app.close();
  await model.close();
  process.exit();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
