import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProviderStore } from '../../packages/core/src/providers/store.js';
import { probeModel, providerModel } from '../../packages/core/src/providers/model.js';

const directory = process.argv[2];
if (!directory) throw new Error('Pass the configured Peaper data directory.');
const { settings, apiKey } = new ProviderStore(resolve(directory)).credentials();
// Exercise the compatible adapter against the user's chosen endpoint. No credential is copied,
// persisted, printed, or sent to a different destination; the active configuration is unchanged.
await probeModel(providerModel({ ...settings, kind: 'compatible' }, apiKey));
const report = {
  date: new Date().toISOString(),
  adapter: 'OpenAI-compatible',
  endpoint: settings.baseURL,
  model: settings.model,
  streaming: true,
  toolCalling: true,
};
await writeFile('artifacts/m2-compatible-live-validation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
