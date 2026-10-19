import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPeaperServer } from '../../apps/server/src/index.js';
import { testProvider } from '../../packages/core/src/providers/model.js';
import { modelFixture, type FixtureReply } from '../helpers/model-fixture.js';

// Isolated browser QA: local deterministic model, real file approvals and persistence.
const directory = await mkdtemp(join(tmpdir(), 'peaper-m3-ui-'));
const workspace = join(directory, 'continuity-fixture');
await mkdir(workspace);
await writeFile(join(workspace, 'math.mjs'), 'export const add = (a, b) => a - b;\n');
await writeFile(
  join(workspace, 'PEAPER.md'),
  '# Project instructions\nKeep changes focused. Inspect math.mjs before editing. Report what was actually verified.\n',
);
const planText =
  '# Fix addition\n\n1. Inspect `math.mjs` and preserve its exported API.\n2. Replace subtraction with addition after approval.\n3. Review the diff and report the resulting implementation.\n\nFile: `math.mjs`. No dependencies or external services are needed.';
const model = await modelFixture((request) => {
  if (request.messages.some((m) => m.content?.includes('PEAPER_COMPACTION')))
    return {
      text: 'The project exposes add(a, b) in math.mjs. Earlier discussion agreed to preserve its API. No changes were applied during research. Continue by inspecting current contents.',
    };
  const index = request.messages
    .slice(request.messages.findLastIndex((m) => m.role === 'user') + 1)
    .filter((m) => m.role === 'tool').length;
  const plan = request.messages.some(
    (m) => m.role === 'system' && m.content?.includes('PLAN MODE:'),
  );
  const steps: FixtureReply[] = plan
    ? [
        { tool: 'read_file', input: { path: 'math.mjs' } },
        { tool: 'propose_plan', input: { plan: planText } },
        {
          text: 'The plan is ready for review. `math.mjs` currently subtracts the inputs. No files were changed and no commands were run. Review the plan before starting Build.',
        },
      ]
    : [
        { tool: 'read_file', input: { path: 'math.mjs' } },
        { tool: 'edit_file', input: { path: 'math.mjs', oldText: 'a - b', newText: 'a + b' } },
        {
          text: 'Updated `math.mjs` to add the two inputs after approval. The exported API is unchanged. The reviewed diff is recorded below; no test command was requested.',
        },
      ];
  return steps[index] ?? { text: 'Task complete.' };
});
const runtime = await createPeaperServer({
  workspace,
  dataDirectory: join(directory, 'data'),
  distributionDirectory: resolve('dist'),
  version: 'M3-browser-fixture',
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
const session = runtime.database.createSession(runtime.workspace.id, 'Addition research').session;
for (const [prompt, text] of [
  ['What does this project expose?', 'A small add(a, b) export in math.mjs.'],
  ['Should we change the API?', 'Preserve the existing named export and argument order.'],
  [
    'What is the next step?',
    'Inspect the implementation, propose a plan, then request approval before any edit.',
  ],
]) {
  const run = runtime.agent.store.create(session.id, prompt!, 'fixture-model');
  run.status = 'completed';
  run.text = text!;
  runtime.agent.store.save(run, [
    { role: 'user', content: prompt! },
    { role: 'assistant', content: text! },
  ]);
}
runtime.database.createSession(runtime.workspace.id, 'Independent notes');
const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' });
console.log(
  JSON.stringify({ url: `${url}/#token=${runtime.token}`, workspace, sessionId: session.id }),
);
const stop = async () => {
  await runtime.app.close();
  await model.close();
  process.exit();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
