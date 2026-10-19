import { providerAdapters } from './adapters.js';
import type { ProviderStore } from './store.js';

export async function refreshCatalog(store: ProviderStore, id: string) {
  const { connection, apiKey, revision } = store.connectionCredentials(id);
  try {
    const models = await providerAdapters[connection.kind].listModels(connection, apiKey);
    store.saveCatalog(id, revision, models);
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null;
    const message =
      status === 401 || status === 403
        ? 'Provider authentication failed. Check this connection’s API key and access.'
        : status === 404 || status === 405
          ? 'This endpoint does not expose a model catalog. Add a Model ID manually, then test that model.'
          : 'Could not refresh models. Check the endpoint, network, or provider response. The previous catalog is retained.';
    store.catalogError(id, revision, message);
    throw Object.assign(new Error(message), { statusCode: 422 });
  }
  return store.snapshot();
}
