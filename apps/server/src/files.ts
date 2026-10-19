import type { FastifyInstance } from 'fastify';
import { WorkspaceFiles } from '@peaper/core';

export function fileRoutes(app: FastifyInstance, root: string, dataDirectory?: string) {
  const files = new WorkspaceFiles(root, dataDirectory);
  app.get<{ Querystring: { path?: string } }>('/api/files', (request) => {
    if (request.query.path !== undefined && typeof request.query.path !== 'string')
      throw Object.assign(new Error('Invalid workspace path.'), { statusCode: 400 });
    return files.list(request.query.path || '');
  });
  app.get<{ Querystring: { path?: string } }>('/api/file', (request) => {
    if (typeof request.query.path !== 'string' || !request.query.path)
      throw Object.assign(new Error('Choose a workspace file.'), { statusCode: 400 });
    return files.read(request.query.path);
  });
}
