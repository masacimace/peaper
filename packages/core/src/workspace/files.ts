import { readdir, realpath, open } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { WorkspaceEntry, WorkspaceFile } from '@peaper/shared';

const omitted = new Set([
  '.git',
  'node_modules',
  'dist',
  'artifacts',
  '.codex-remote-attachments',
  '.peaper-local',
  '.peaper',
  '.next',
  '.pnpm-store',
]);
const limit = 512 * 1024;
function excluded(parts: string[]) {
  return parts.some(
    (part) =>
      omitted.has(part) ||
      (part.startsWith('.env') && part !== '.env.example') ||
      part === '.npmrc',
  );
}
function unavailable(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
const languageByExtension: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.svg': 'xml',
  '.md': 'markdown',
  '.txt': 'plaintext',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.py': 'python',
  '.rs': 'rust',
  '.sh': 'shell',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.toml': 'ini',
};

/** A bounded, read-only workspace browser; it never follows a path outside its root. */
export class WorkspaceFiles {
  constructor(private readonly root: string) {}

  private async locate(path: string) {
    const parts = path.replaceAll('\\', '/').split('/');
    if (
      path.length > 2048 ||
      path.includes('\0') ||
      isAbsolute(path) ||
      parts.some((part) => part === '..' || part.includes(':'))
    )
      throw unavailable('Choose a path within this workspace.');
    if (excluded(parts))
      throw unavailable('This file is excluded from the workspace browser.', 403);
    const canonicalRoot = await realpath(this.root);
    let canonical: string;
    try {
      canonical = await realpath(resolve(canonicalRoot, ...parts));
    } catch {
      throw unavailable('File or directory was not found.', 404);
    }
    const within = relative(canonicalRoot, canonical);
    if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within))
      throw unavailable('Choose a path within this workspace.', 403);
    if (excluded(within.split(sep)))
      throw unavailable('This file is excluded from the workspace browser.', 403);
    return canonical;
  }

  async list(path = '') {
    const directory = await this.locate(path);
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      throw unavailable('This directory cannot be opened.', 404);
    }
    const entries: WorkspaceEntry[] = children
      .filter(
        (entry) =>
          !omitted.has(entry.name) &&
          !entry.isSymbolicLink() &&
          (entry.isDirectory() || entry.isFile()) &&
          !(entry.name.startsWith('.env') && entry.name !== '.env.example') &&
          entry.name !== '.npmrc',
      )
      .map((entry) => ({
        name: entry.name,
        path: [path, entry.name].filter(Boolean).join('/'),
        kind: entry.isDirectory() ? ('directory' as const) : ('file' as const),
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
      );
    return { path, entries: entries.slice(0, 400), truncated: entries.length > 400 };
  }

  async read(path: string): Promise<WorkspaceFile> {
    const location = await this.locate(path);
    const file = await open(location, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw unavailable('Choose a text file.');
      if (stat.size > limit)
        throw unavailable('This file is larger than the 512 KB preview limit.', 413);
      const buffer = Buffer.alloc(limit + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > limit)
        throw unavailable('This file is larger than the 512 KB preview limit.', 413);
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.includes(0))
        throw unavailable('Binary files cannot be displayed in the text editor.', 415);
      let content;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw unavailable('This file is not UTF-8 text.', 415);
      }
      return {
        path,
        name: basename(location),
        content,
        bytes: bytesRead,
        language: languageByExtension[extname(location)] || 'plaintext',
      };
    } finally {
      await file.close();
    }
  }
}
