import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { PeaperDatabase, TerminalManager, ProviderStore, AgentRuntime } from '@peaper/core';
import { createSessionSchema, type Health } from '@peaper/shared';
import { EventStream } from './events.js';
import { terminalRoute } from './terminal.js';
import { fileRoutes } from './files.js';
import { agentRoutes } from './agent.js';
import { modelRoutes } from './models.js';
import { continuityRoutes } from './continuity.js';

interface DevelopmentFrontend {
  middleware: (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: Error) => void,
  ) => void;
  close: () => Promise<void>;
}

export interface ServerOptions {
  workspace: string;
  dataDirectory: string;
  distributionDirectory: string;
  version: string;
  token?: string;
  providerStore?: ProviderStore;
  createDevelopmentFrontend?: (options: {
    server: Server;
    nonce: string;
    hmrPath: string;
  }) => Promise<DevelopmentFrontend>;
}

export async function createPeaperServer(options: ServerOptions) {
  const webDirectory = join(options.distributionDirectory, 'web');
  if (!options.createDevelopmentFrontend && !existsSync(join(webDirectory, 'index.html')))
    throw new Error('Frontend assets not found. Run pnpm build before starting Peaper.');
  const database = new PeaperDatabase(
    options.dataDirectory,
    join(options.distributionDirectory, 'migrations'),
  );
  const workspace = database.workspace(options.workspace);
  database.recoverInterrupted(workspace.id);
  const terminals = new TerminalManager(workspace.path);
  const stream = new EventStream(database, workspace.id);
  const providers = options.providerStore ?? new ProviderStore(options.dataDirectory);
  const agent = new AgentRuntime(database, workspace, options.dataDirectory, providers, () =>
    stream.publish(),
  );
  const token = options.token ?? randomBytes(32).toString('hex');
  const authenticate = (candidate: string) => {
    const actual = Buffer.from(candidate);
    const expected = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const startedAt = new Date().toISOString();
  const nonce = options.createDevelopmentFrontend ? randomBytes(24).toString('base64') : '';
  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
    forceCloseConnections: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
      return reply.code(403).send({ message: 'Local access only.' });
    const origin = request.headers.origin;
    if (origin && origin !== `http://${host}`)
      return reply.code(403).send({ message: 'Origin is not allowed.' });
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; worker-src 'self' blob:; frame-src http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    );
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (
      request.url.split('?')[0] === '/api/terminal' &&
      request.headers.upgrade?.toLowerCase() === 'websocket'
    )
      return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || !authenticate(authorization.slice(7)))
      return reply
        .code(401)
        .send({ message: 'Open the complete local URL from the Peaper launcher to connect.' });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError')
      return reply.code(400).send({ message: 'Invalid request. Check the supplied fields.' });
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    return reply.code(status).send({
      message:
        status < 500 && error instanceof Error
          ? error.message
          : 'An internal error occurred. Check the local runtime.',
    });
  });

  const hmrPath = '/__peaper_hmr';
  // Fastify's WebSocket plugin handles every upgrade on its configured server.
  // Dispatch terminal upgrades separately so Vite can own the HMR path.
  const terminalUpgrades = options.createDevelopmentFrontend ? createHttpServer() : app.server;
  if (terminalUpgrades !== app.server) {
    app.server.on('upgrade', (request, socket, head) => {
      if (request.url?.split('?')[0] !== hmrPath)
        terminalUpgrades.emit('upgrade', request, socket, head);
    });
  }
  await app.register(websocket, {
    options: { maxPayload: 70_000, server: terminalUpgrades },
  });
  app.get('/api/health', (): Health => ({
    status: 'ready',
    version: options.version,
    startedAt,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    database: { status: 'ready', fts5: true, schemaVersion: database.schemaVersion },
    terminal: { shell: terminals.shell, active: terminals.active, isolation: 'host' },
    agent: providers.get()?.verifiedAt
      ? 'ready'
      : providers.get()
        ? 'configured'
        : 'not-configured',
  }));
  app.get('/api/workspace', () => workspace);
  fileRoutes(app, workspace.path, options.dataDirectory);
  agentRoutes(app, agent, providers, () => stream.publish());
  modelRoutes(app, providers, agent, () => stream.publish());
  continuityRoutes(app, agent, providers);
  app.get<{ Querystring: { q?: string } }>('/api/sessions', (request) => {
    const query = request.query.q || '';
    if (typeof query !== 'string' || query.length > 200)
      throw Object.assign(new Error('Search must be 200 characters or fewer.'), {
        statusCode: 400,
      });
    return { sessions: database.listSessions(workspace.id, query) };
  });
  app.post('/api/sessions', (request, reply) => {
    const { title } = createSessionSchema.parse(request.body);
    const { session } = database.createSession(workspace.id, title);
    const defaults = providers.snapshot().defaults;
    if (defaults.modelId)
      agent.store.select(session.id, { modelId: defaults.modelId, effort: defaults.effort });
    stream.publish();
    return reply.code(201).send(session);
  });
  app.get<{ Querystring: { after?: string } }>('/api/events', (request, reply) => {
    const raw = request.headers['last-event-id'] ?? request.query.after ?? '0';
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      return reply.code(400).send({ message: 'Invalid event cursor.' });
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    stream.attach(reply.raw, Number(raw));
  });
  terminalRoute(app, terminals, authenticate);
  app.addHook('preClose', async () => {
    await agent.close();
    stream.close();
    await terminals.close();
  });
  app.addHook('onClose', async () => {
    database.close();
  });
  if (options.createDevelopmentFrontend) {
    let frontend: DevelopmentFrontend;
    try {
      frontend = await options.createDevelopmentFrontend({ server: app.server, nonce, hmrPath });
    } catch (error) {
      await app.close();
      throw error;
    }
    app.addHook('preClose', () => frontend.close());
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ message: 'Not found.' });
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.hijack();
      frontend.middleware(request.raw, reply.raw, (error) => {
        reply.raw.statusCode = error ? 500 : 404;
        reply.raw.end(error ? 'Could not load the development frontend.' : 'Not found.');
      });
    });
  } else {
    await app.register(staticFiles, { root: webDirectory, maxAge: 0 });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.includes('.'))
        return reply.code(404).send({ message: 'Not found.' });
      return reply.sendFile('index.html');
    });
  }
  return { app, workspace, database, terminals, token, agent, providers };
}
