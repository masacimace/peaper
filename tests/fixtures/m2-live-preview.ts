import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProviderStore } from '../../packages/core/src/providers/store.js';
import { createPeaperServer } from '../../apps/server/src/index.js';

// Explicit live QA: reuse the user's configured backend store without copying or printing a key.
const providerDirectory = process.argv[2];
if (!providerDirectory) throw new Error('Pass the configured Peaper data directory.');
const providerStore = new ProviderStore(resolve(providerDirectory));
if (!providerStore.get()?.verifiedAt)
  throw new Error('Save and test the model connection in Peaper first.');
const directory = await mkdtemp(join(tmpdir(), 'peaper-m2-live-'));
const workspace = join(directory, 'addition-live-check');
await mkdir(workspace);
await writeFile(join(workspace, 'math.mjs'), 'export function add(a, b) { return a - b; }\n');
await writeFile(
  join(workspace, 'check.mjs'),
  "import { add } from './math.mjs';\nimport assert from 'node:assert/strict';\nassert.equal(add(2, 3), 5);\nassert.equal(add(-4, 7), 3);\nassert.equal(add(0, 0), 0);\nconsole.log('ADDITION_LIVE_OK: all 3 assertions passed');\n",
);
const runtime = await createPeaperServer({
  workspace,
  dataDirectory: join(directory, 'data'),
  distributionDirectory: resolve('dist'),
  version: 'M2-live-validation',
  providerStore,
});
const url = await runtime.app.listen({ port: 0, host: '127.0.0.1' });
console.log(
  JSON.stringify({
    url: `${url}/#token=${runtime.token}`,
    workspace,
    model: providerStore.get()?.model,
  }),
);
const stop = async () => {
  await runtime.app.close();
  process.exit();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
