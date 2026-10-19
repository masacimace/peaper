import { lstat, mkdir, readFile, realpath, rename, writeFile, unlink } from 'node:fs/promises';
import { isAbsolute, dirname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileChange } from '@peaper/shared';
import { WorkspaceFiles, workspacePathExcluded } from './files.js';

export class WorkspaceEdits {
  readonly files: WorkspaceFiles;
  constructor(
    private readonly root: string,
    private readonly protectedDirectory: string,
  ) {
    this.files = new WorkspaceFiles(root, protectedDirectory);
  }
  private async target(path: string) {
    const parts = path.replaceAll('\\', '/').split('/');
    if (
      !path ||
      path.length > 2048 ||
      path.includes('\0') ||
      isAbsolute(path) ||
      parts.some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          part.includes(':') ||
          (process.platform === 'win32' && /[. ]$/.test(part)),
      ) ||
      workspacePathExcluded(parts)
    )
      throw new Error('Choose an editable file within this workspace.');
    const root = await realpath(this.root);
    const target = resolve(root, ...parts);
    const withinData = relative(await realpath(this.protectedDirectory), target);
    if (!isAbsolute(withinData) && withinData !== '..' && !withinData.startsWith(`..${sep}`))
      throw new Error('Peaper runtime data cannot be edited.');
    let cursor = root;
    for (let index = 0; index < parts.length; index++) {
      cursor = resolve(cursor, parts[index]!);
      try {
        const stat = await lstat(cursor);
        if (
          stat.isSymbolicLink() ||
          (index < parts.length - 1 && !stat.isDirectory()) ||
          (index === parts.length - 1 && !stat.isFile())
        )
          throw new Error(
            'Edits require regular files and directories; symlinks and junctions are excluded.',
          );
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
    return target;
  }
  async prepare(path: string, after: string, expected?: string | null): Promise<FileChange> {
    await this.target(path);
    if (Buffer.byteLength(after) > 128 * 1024 || after.includes('\0'))
      throw new Error('Edits are limited to 128 KB of UTF-8 text.');
    let before: string | null = null;
    try {
      before = (await this.files.read(path)).content;
    } catch (error) {
      if (!(error instanceof Error && 'statusCode' in error && error.statusCode === 404))
        throw error;
    }
    if (expected !== undefined && expected !== before)
      throw new Error('File changed since it was read. Read the current file before editing.');
    if (before === after) throw new Error('The proposed edit does not change the file.');
    return { id: randomUUID(), path, before, after };
  }
  async apply(change: FileChange) {
    const target = await this.target(change.path);
    let current: string | null = null;
    try {
      current = await readFile(target, 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    if (current !== change.before)
      throw new Error(
        'File changed while approval was pending. The edit was not applied. Read it again.',
      );
    await mkdir(dirname(target), { recursive: true });
    await this.target(change.path);
    const temporary = target + `.peaper-${randomUUID()}.tmp`;
    try {
      const mode = change.before === null ? 0o644 : (await lstat(target)).mode;
      await writeFile(temporary, change.after, { flag: 'wx', mode });
      if (change.before === null) {
        // Exclusive creation prevents a newly created user file from being replaced.
        await writeFile(target, change.after, { flag: 'wx', mode });
      } else {
        if ((await readFile(target, 'utf8')) !== change.before)
          throw new Error('File changed before commit. Edit was not applied.');
        await rename(temporary, target);
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { path: change.path, bytes: Buffer.byteLength(change.after), applied: true };
  }
  async restore(path: string, expected: string | null, content: string | null) {
    if (content !== null) {
      if (content === expected) return;
      return this.apply(await this.prepare(path, content, expected));
    }
    const target = await this.target(path);
    if ((await readFile(target, 'utf8')) !== expected)
      throw new Error('File changed before restore.');
    await this.target(path);
    await unlink(target);
  }
}
