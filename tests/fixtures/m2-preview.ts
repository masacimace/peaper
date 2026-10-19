import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPeaperServer } from '../../apps/server/src/index.js';
import { modelFixture, codingScenario } from '../helpers/model-fixture.js';

// Browser QA only: the provider is deterministic; file edits and test commands are real.
const directory = await mkdtemp(join(tmpdir(), 'peaper-m2-ui-'));
const workspace = join(directory, 'addition-fixture');
await mkdir(workspace);
await writeFile(join(workspace, 'math.mjs'), 'export const add = (a, b) => a - b;\n');
await writeFile(
  join(workspace, 'check.mjs'),
  "import { add } from './math.mjs';\nif (add(2, 3) !== 5) { console.error('ADDITION_FAILED'); process.exit(1); }\nconsole.log('ADDITION_OK');\n",
);
const model = await modelFixture(codingScenario, undefined, {
  data: [
    {
      id: 'fixture-model',
      name: 'Fixture Coding',
      context_length: 128000,
      supported_parameters: ['tools', 'reasoning', 'temperature'],
      reasoning: {
        supported_efforts: ['high', 'medium', 'low'],
        default_effort: 'medium',
        mandatory: true,
      },
      pricing: { prompt: '0.000001', completion: '0.000002' },
      top_provider: { max_completion_tokens: 8192 },
    },
    {
      id: 'fixture-fast',
      name: 'Fixture Fast',
      context_length: 32000,
      supported_parameters: ['tools'],
      pricing: { prompt: '0', completion: '0' },
    },
    { id: 'fixture-chat', name: 'Fixture Chat Only', supported_parameters: ['temperature'] },
  ],
});
const runtime = await createPeaperServer({
  workspace,
  dataDirectory: join(directory, 'data'),
  distributionDirectory: resolve('dist'),
  version: 'M2-browser-fixture',
});
const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' });
console.log(
  JSON.stringify({ url: `${url}/#token=${runtime.token}`, fixtureProvider: model.url, workspace }),
);
const stop = async () => {
  await runtime.app.close();
  await model.close();
  process.exit();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
