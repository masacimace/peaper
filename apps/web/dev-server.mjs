import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export async function createDevelopmentFrontend({
  server,
  nonce,
  hmrPath,
  root = dirname(fileURLToPath(import.meta.url)),
}) {
  const vite = await createServer({
    root,
    html: { cspNonce: nonce },
    server: {
      middlewareMode: true,
      ws: { server, path: hmrPath },
    },
    appType: 'spa',
  });
  return {
    middleware: vite.middlewares,
    close: () => vite.close(),
  };
}
