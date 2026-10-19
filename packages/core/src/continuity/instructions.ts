import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import type { ActiveInstruction } from '@peaper/shared';

export function continuityError(message: string, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode, publicMessage: true });
}
export class InstructionLoader {
  constructor(
    private readonly root: string,
    private readonly dataDirectory: string,
    private readonly globalPath = join(homedir(), '.peaper', 'PEAPER.md'),
  ) {}
  async load(path?: string | null): Promise<ActiveInstruction[]> {
    const sources: { path: string; scope: ActiveInstruction['scope'] }[] = [
      { path: this.globalPath, scope: 'global' },
      { path: join(this.root, 'PEAPER.md'), scope: 'project' },
    ];
    if (path) {
      const parts = path.replaceAll('\\', '/').split('/');
      if (
        isAbsolute(path) ||
        parts.some((part) => part === '..' || part.includes(':')) ||
        path.includes('\0')
      )
        throw continuityError('Instruction scope must stay inside the workspace.', 400);
      const target = resolve(this.root, ...parts);
      let directory = dirname(target);
      try {
        if ((await lstat(target)).isDirectory()) directory = target;
      } catch {
        /* A new file uses its parent scope. */
      }
      const directories: string[] = [];
      while (directory !== this.root) {
        const within = relative(this.root, directory);
        if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
          throw continuityError('Instruction scope is outside the workspace.', 400);
        directories.unshift(directory);
        directory = dirname(directory);
      }
      for (const directory of directories)
        sources.push({ path: join(directory, 'PEAPER.md'), scope: 'directory' });
    }
    const result: ActiveInstruction[] = [];
    let total = 0;
    for (const source of sources) {
      let stat;
      try {
        stat = await lstat(source.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw continuityError('An instruction file could not be read.');
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768)
        throw continuityError(
          `Instruction file must be a regular UTF-8 file under 32 KB: ${source.path}`,
        );
      if (source.scope !== 'global') {
        const canonical = await realpath(source.path);
        const within = relative(await realpath(this.root), canonical);
        const inData = relative(await realpath(this.dataDirectory), canonical);
        if (
          isAbsolute(within) ||
          within.startsWith('..') ||
          (!isAbsolute(inData) && inData !== '..' && !inData.startsWith(`..${sep}`))
        )
          throw continuityError(
            'An instruction file resolves outside the permitted workspace scope.',
          );
        // Reject junctions in the path, even when their target happens to be inside the root.
        let cursor = this.root;
        for (const part of relative(this.root, source.path).split(sep)) {
          cursor = join(cursor, part);
          if ((await lstat(cursor)).isSymbolicLink())
            throw continuityError('Instruction paths cannot contain symlinks or junctions.');
        }
      }
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(source.path));
      } catch {
        throw continuityError(`Instruction file is not readable UTF-8: ${source.path}`);
      }
      total += Buffer.byteLength(content);
      if (total > 98304 || content.includes('\0'))
        throw continuityError('Active instructions exceed the 96 KB text limit.');
      result.push({
        ...source,
        content,
        digest: createHash('sha256').update(content).digest('hex'),
      });
    }
    return result;
  }
}
