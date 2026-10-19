import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  connectionInputSchema,
  connectionSchema,
  modelStateSchema,
  modelSchema,
  modelOptionsSchema,
  modelDefaultsSchema,
  modelPreferenceSchema,
  modelSelectionSchema,
  providerInputSchema,
  providerStatusSchema,
  availableEfforts,
  type ConnectionInput,
  type ManagedModel,
  type ModelSelection,
  type ProviderInput,
  type ProviderStatus,
  type ModelState,
} from '@peaper/shared';

const storedSchema = modelStateSchema.extend({
  version: z.literal(2),
  connections: z.array(connectionSchema.extend({ secret: z.string().nullable() })),
});
type Stored = z.infer<typeof storedSchema>;
export type ModelMetadata = Pick<
  ManagedModel,
  | 'modelId'
  | 'name'
  | 'contextWindow'
  | 'maxOutputTokens'
  | 'pricing'
  | 'supportedParameters'
  | 'toolCalling'
  | 'reasoning'
>;
export function providerURL(input: Pick<ConnectionInput, 'kind' | 'baseURL'>) {
  const url = new URL(input.baseURL);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw Object.assign(
      new Error(
        'Use HTTPS, or HTTP on a loopback host. Credentials and query strings are not allowed in the endpoint.',
      ),
      { statusCode: 400 },
    );
  const normalized = url.href.replace(/\/+$/, '');
  if (input.kind === 'openrouter' && normalized !== 'https://openrouter.ai/api/v1')
    throw Object.assign(new Error('OpenRouter uses https://openrouter.ai/api/v1.'), {
      statusCode: 400,
    });
  return normalized;
}
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
function revision(connection: Stored['connections'][number]) {
  return createHash('sha256')
    .update(JSON.stringify([connection.id, connection.kind, connection.baseURL, connection.secret]))
    .digest('hex');
}

/** Versioned local storage. Public snapshots always pass through secret-free schemas. */
export class ProviderStore {
  private readonly configPath: string;
  private readonly keyPath: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.configPath = join(directory, 'provider.json');
    this.keyPath = join(directory, 'provider.key');
  }
  private assertRegular(path: string) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('Provider storage must be a regular file.');
  }
  private read(): Stored {
    const empty: Stored = {
      version: 2,
      connections: [],
      models: [],
      defaults: { modelId: null, effort: 'default' },
    };
    if (!existsSync(this.configPath)) return empty;
    this.assertRegular(this.configPath);
    const raw = JSON.parse(readFileSync(this.configPath, 'utf8'));
    if (!raw) return empty;
    if (raw.version === 2) return storedSchema.parse(raw);
    // Preserve the original encrypted key, selected model, and capability check.
    const old = providerStatusSchema.parse(raw);
    const connectionId = randomUUID();
    const model = this.newModel(connectionId, old.model);
    model.showInChat = true;
    model.options = modelOptionsSchema.parse({
      maxOutputTokens: old.maxOutputTokens,
      temperature: old.temperature,
    });
    model.verifiedAt = old.verifiedAt;
    model.toolCalling = old.toolCalling ? true : null;
    const migrated: Stored = {
      ...empty,
      connections: [
        {
          id: connectionId,
          name: old.kind === 'openrouter' ? 'OpenRouter' : 'Custom provider',
          kind: old.kind,
          baseURL: old.baseURL,
          enabled: true,
          hasKey: old.hasKey,
          secret: typeof raw.secret === 'string' ? raw.secret : null,
          checkedAt: old.verifiedAt,
          catalogUpdatedAt: null,
          error: null,
        },
      ],
      models: [model],
      defaults: { modelId: model.id, effort: 'default' },
    };
    this.write(migrated);
    return migrated;
  }
  private write(value: Stored) {
    if (existsSync(this.configPath)) this.assertRegular(this.configPath);
    const temporary = this.configPath + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, this.configPath);
  }
  private masterKey() {
    if (!existsSync(this.keyPath))
      writeFileSync(this.keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.assertRegular(this.keyPath);
    const key = readFileSync(this.keyPath);
    if (key.length !== 32) throw new Error('Invalid provider key storage.');
    return key;
  }
  private encrypt(key: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  snapshot(): ModelState {
    return modelStateSchema.parse(this.read());
  }
  saveConnection(raw: ConnectionInput, id: string = randomUUID()) {
    const input = connectionInputSchema.parse(raw);
    const baseURL = providerURL(input);
    const data = this.read();
    const previous = data.connections.find((item) => item.id === id);
    if (!previous && data.connections.length >= 32)
      fail('A maximum of 32 connections can be saved.');
    let secret =
      previous?.kind === input.kind && previous.baseURL === baseURL ? previous.secret : null;
    if (input.apiKey !== undefined)
      secret = input.apiKey.trim() ? this.encrypt(input.apiKey.trim()) : null;
    if (input.kind === 'openrouter' && !secret) fail('An OpenRouter API key is required.', 400);
    const connection = {
      id,
      name: input.name,
      kind: input.kind,
      baseURL,
      enabled: input.enabled,
      hasKey: Boolean(secret),
      secret,
      checkedAt: previous?.checkedAt ?? null,
      catalogUpdatedAt: previous?.catalogUpdatedAt ?? null,
      error: previous?.error ?? null,
    };
    if (previous && revision(previous) !== revision(connection)) {
      connection.checkedAt = connection.catalogUpdatedAt = connection.error = null;
      data.models = data.models.map((model) =>
        model.connectionId === id
          ? { ...model, verifiedAt: null, testError: null, available: model.manual }
          : model,
      );
    }
    data.connections = [...data.connections.filter((item) => item.id !== id), connection];
    this.write(data);
    return connectionSchema.parse(connection);
  }
  connectionCredentials(id: string) {
    const connection = this.read().connections.find((item) => item.id === id);
    if (!connection) fail('Provider connection not found.', 404);
    if (!connection.enabled) fail('This provider connection is disabled.');
    let apiKey: string | undefined;
    if (connection.secret) {
      const bytes = Buffer.from(connection.secret, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', this.masterKey(), bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      apiKey = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    }
    return {
      connection: connectionSchema.parse(connection),
      apiKey,
      revision: revision(connection),
    };
  }
  private currentConnection(data: Stored, id: string, expected: string) {
    const found = data.connections.find((item) => item.id === id);
    if (!found || !found.enabled || revision(found) !== expected)
      fail('Provider changed during the request. Try again.');
    return found;
  }
  saveCatalog(id: string, expected: string, entries: ModelMetadata[]) {
    const data = this.read();
    const connection = this.currentConnection(data, id, expected);
    const ids = new Set(entries.map((item) => item.modelId));
    data.models = data.models.map((model) =>
      model.connectionId === id && !model.manual && !ids.has(model.modelId)
        ? { ...model, available: false, verifiedAt: null }
        : model,
    );
    for (const entry of entries) {
      const previous = data.models.find(
        (model) => model.connectionId === id && model.modelId === entry.modelId,
      );
      const next = modelSchema.parse({
        ...(previous ?? this.newModel(id, entry.modelId)),
        ...entry,
        manual: false,
        available: true,
      });
      if (!availableEfforts(next).includes(next.options.effort)) next.options.effort = 'default';
      if (!next.reasoning?.supportsBudget) next.options.reasoningBudget = null;
      if (next.maxOutputTokens)
        next.options.maxOutputTokens = Math.min(next.options.maxOutputTokens, next.maxOutputTokens);
      if (
        next.options.reasoningBudget !== null &&
        next.options.reasoningBudget >= next.options.maxOutputTokens
      )
        next.options.reasoningBudget = null;
      if (!next.supportedParameters.includes('temperature')) next.options.temperature = null;
      if (next.toolCalling === false) next.verifiedAt = null;
      data.models = [...data.models.filter((model) => model.id !== next.id), next];
    }
    connection.checkedAt = connection.catalogUpdatedAt = new Date().toISOString();
    connection.error = null;
    const defaultModel = data.models.find((model) => model.id === data.defaults.modelId);
    if (defaultModel && !availableEfforts(defaultModel).includes(data.defaults.effort))
      data.defaults.effort = 'default';
    this.write(data);
  }
  catalogError(id: string, expected: string, message: string) {
    const data = this.read();
    this.currentConnection(data, id, expected).error = message;
    this.write(data);
  }
  private newModel(connectionId: string, modelId: string): ManagedModel {
    return {
      id: randomUUID(),
      connectionId,
      modelId,
      name: modelId,
      contextWindow: null,
      maxOutputTokens: null,
      pricing: { input: null, output: null },
      supportedParameters: [],
      toolCalling: null,
      reasoning: null,
      manual: true,
      available: true,
      favorite: false,
      showInChat: false,
      options: modelOptionsSchema.parse({}),
      verifiedAt: null,
      testError: null,
    };
  }
  addManual(connectionId: string, modelId: string, name?: string) {
    const data = this.read();
    if (!data.connections.some((item) => item.id === connectionId))
      fail('Provider connection not found.', 404);
    if (data.models.some((item) => item.connectionId === connectionId && item.modelId === modelId))
      fail('This model is already in the catalog.', 400);
    const model = this.newModel(connectionId, modelId);
    model.name = name?.trim() || modelId;
    data.models.push(model);
    this.write(data);
    return model;
  }
  updateModel(id: string, raw: z.input<typeof modelPreferenceSchema>) {
    const input = modelPreferenceSchema.parse(raw);
    const data = this.read();
    const model = data.models.find((item) => item.id === id);
    if (!model) fail('Model not found.', 404);
    if (input.options) this.validateOptions(model, input.options);
    Object.assign(model, input);
    this.write(data);
    return model;
  }
  private validateOptions(model: ManagedModel, options: ManagedModel['options']) {
    if (!availableEfforts(model).includes(options.effort))
      fail('This reasoning effort is not supported by the model.', 400);
    if (model.maxOutputTokens && options.maxOutputTokens > model.maxOutputTokens)
      fail('Output token limit exceeds the model limit.', 400);
    if (
      options.reasoningBudget !== null &&
      (!model.reasoning?.supportsBudget ||
        options.reasoningBudget >= options.maxOutputTokens ||
        options.effort !== 'default')
    )
      fail(
        'Use a supported reasoning budget below the output limit, with effort set to Default.',
        400,
      );
    if (
      !model.manual &&
      options.temperature !== null &&
      !model.supportedParameters.includes('temperature')
    )
      fail('This model does not advertise temperature support.', 400);
  }
  resolve(selection?: ModelSelection | null) {
    const data = this.read();
    const chosen =
      selection ??
      (data.defaults.modelId
        ? { modelId: data.defaults.modelId, effort: data.defaults.effort }
        : null);
    if (!chosen) fail('Choose a model on the Models page first.');
    const model = data.models.find((item) => item.id === chosen.modelId);
    if (!model || !model.available)
      fail('The selected model is no longer available. Choose another model.');
    const credentials = this.connectionCredentials(model.connectionId);
    if (model.toolCalling === false) fail('This model does not support tool calling.');
    const options = { ...model.options, effort: chosen.effort };
    if (options.effort !== 'default') options.reasoningBudget = null;
    this.validateOptions(model, options);
    return { ...credentials, model, options, selection: modelSelectionSchema.parse(chosen) };
  }
  setDefaults(raw: z.input<typeof modelDefaultsSchema>) {
    const value = modelDefaultsSchema.parse(raw);
    if (value.modelId) this.resolve({ modelId: value.modelId, effort: value.effort });
    const data = this.read();
    data.defaults = value;
    this.write(data);
  }
  modelTested(id: string, expected: string, error: string | null) {
    const data = this.read();
    const model = data.models.find((item) => item.id === id);
    if (!model) fail('Model not found.', 404);
    const connection = this.currentConnection(data, model.connectionId, expected);
    model.verifiedAt = error ? null : new Date().toISOString();
    model.testError = error;
    if (!error) {
      model.toolCalling = true;
      connection.checkedAt = model.verifiedAt;
      connection.error = null;
    }
    this.write(data);
  }
  // Compatibility for existing local clients. New UI uses the multi-connection API.
  get(): ProviderStatus | null {
    const data = this.read();
    const model = data.models.find((item) => item.id === data.defaults.modelId);
    const connection = data.connections.find((item) => item.id === model?.connectionId);
    if (!model || !connection || !connection.enabled) return null;
    return {
      kind: connection.kind,
      baseURL: connection.baseURL,
      model: model.modelId,
      hasKey: connection.hasKey,
      verifiedAt: model.verifiedAt,
      streaming: Boolean(model.verifiedAt),
      toolCalling: Boolean(model.verifiedAt),
      maxOutputTokens: model.options.maxOutputTokens,
      temperature: model.options.temperature,
    };
  }
  save(raw: ProviderInput) {
    const input = providerInputSchema.parse(raw);
    const data = this.read();
    const current = data.models.find((item) => item.id === data.defaults.modelId);
    const connection = this.saveConnection(
      {
        ...input,
        name: input.kind === 'openrouter' ? 'OpenRouter' : 'Custom provider',
        enabled: true,
      },
      current?.connectionId,
    );
    const next = this.read();
    let model = next.models.find(
      (item) => item.connectionId === connection.id && item.modelId === input.model,
    );
    if (!model) {
      model = this.newModel(connection.id, input.model);
      next.models.push(model);
    }
    model.options = modelOptionsSchema.parse(input);
    model.showInChat = true;
    model.verifiedAt = null;
    next.defaults = { modelId: model.id, effort: 'default' };
    this.write(next);
    return this.get()!;
  }
  credentials() {
    const chosen = this.resolve();
    return { settings: this.get()!, apiKey: chosen.apiKey, revision: chosen.revision };
  }
  invalidate() {
    const data = this.read();
    const model = data.models.find((item) => item.id === data.defaults.modelId);
    if (model) {
      model.verifiedAt = null;
      this.write(data);
    }
  }
  verified(settings: ProviderStatus, expected: string) {
    if (JSON.stringify(this.get()) !== JSON.stringify(settings))
      fail('Model settings changed during the request. Try again.');
    const id = this.read().defaults.modelId;
    if (!id) fail('Choose a model first.');
    this.modelTested(id, expected, null);
    return this.get()!;
  }
  clear() {
    this.write({
      version: 2,
      connections: [],
      models: [],
      defaults: { modelId: null, effort: 'default' },
    });
  }
}
