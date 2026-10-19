import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
  rm,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse as parsePath,
  relative,
  resolve,
  sep,
} from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Skill, SkillCatalog, SkillDetail } from '@peaper/shared';
import type { KnowledgeStore } from '../knowledge/store.js';
import { continuityError } from '../continuity/instructions.js';
import { builtinSkills } from './builtins.js';
import { inspectSkill } from './inspection.js';

const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (name) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name),
    'Choose a portable directory name.',
  );
const metadataSchema = z.object({
  name: nameSchema,
  description: z.string().trim().min(1).max(1024),
  compatibility: z.string().max(500).default(''),
});
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const excluded = (name: string) =>
  name.startsWith('.') ||
  [
    'node_modules',
    'dist',
    'provider.json',
    'provider.key',
    'peaper.sqlite',
    'id_rsa',
    'id_ed25519',
  ].includes(name.toLowerCase());
function within(root: string, target: string) {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}
async function noLinks(path: string, missing = false) {
  let cursor = parsePath(resolve(path)).root;
  for (const part of relative(cursor, resolve(path)).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw continuityError('Skill paths cannot contain symlinks or junctions.', 403);
    } catch (error) {
      if (missing && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
async function boundedFile(path: string, limit: number) {
  await noLinks(path);
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit)
      throw continuityError(`Skill resource must be a regular file under ${limit / 1024} KB.`, 400);
    const buffer = Buffer.alloc(limit + 1),
      { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw continuityError('Skill resource grew beyond its size limit.');
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}
function text(bytes: Buffer) {
  try {
    if (bytes.includes(0)) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw continuityError('This skill resource is not UTF-8 text.', 415);
  }
}
export function parseSkill(document: string, directory: string) {
  if (Buffer.byteLength(document) > 65536)
    throw continuityError('SKILL.md must be under 64 KB.', 400);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(document);
  if (!match || Buffer.byteLength(match[1]!) > 16000)
    throw continuityError('SKILL.md needs bounded YAML frontmatter followed by Markdown.', 400);
  let metadata;
  try {
    metadata = metadataSchema.parse(parse(match[1]!, { maxAliasCount: 0, uniqueKeys: true }));
  } catch {
    throw continuityError(
      'Invalid skill metadata. Supply a lowercase name, description and optional compatibility requirements.',
      400,
    );
  }
  if (metadata.name !== directory)
    throw continuityError('Skill name must match its parent directory.', 400);
  const instructions = document.slice(match[0].length).trim();
  if (!instructions) throw continuityError('Add Markdown instructions after the frontmatter.', 400);
  return { ...metadata, instructions, document, digest: digest(document) };
}
export class SkillService {
  readonly roots: { personal: string; project: string };
  constructor(
    private readonly workspace: string,
    dataDirectory: string,
    private readonly store: KnowledgeStore,
  ) {
    this.roots = {
      personal: join(dataDirectory, 'skills'),
      project: join(workspace, '.peaper', 'skills'),
    };
  }
  private preferences() {
    return new Map(
      (
        this.store.database.sqlite
          .prepare('SELECT skill_id,enabled,automatic FROM skill_preferences WHERE workspace_id=?')
          .all(this.store.workspaceId) as { skill_id: string; enabled: number; automatic: number }[]
      ).map((p) => [p.skill_id, p]),
    );
  }
  private source(id: string) {
    const [scope, name, extra] = id.split(':');
    nameSchema.parse(name);
    if (extra || !['builtin', 'personal', 'project'].includes(scope!))
      throw continuityError('Choose a skill from this workspace catalog.', 400);
    if (scope === 'builtin') {
      if (!builtinSkills[name!]) throw continuityError('Skill not found.', 404);
      return { scope: 'builtin' as const, name: name!, path: `builtin:${name}`, root: null };
    }
    const selected = scope as 'personal' | 'project';
    return {
      scope: selected,
      name: name!,
      path: join(this.roots[selected], name!, 'SKILL.md'),
      root: join(this.roots[selected], name!),
    };
  }
  private async metadata(id: string): Promise<Skill> {
    const source = this.source(id),
      preference = this.preferences().get(id);
    let document = builtinSkills[source.name];
    if (source.scope !== 'builtin') {
      await noLinks(source.path);
      const file = await open(source.path, 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 65536)
          throw continuityError('SKILL.md must be a regular file under 64 KB.');
        const bytes = Buffer.alloc(Math.min(16400, stat.size));
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        const header = bytes.subarray(0, bytesRead).toString('utf8');
        const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(header);
        if (!match) throw continuityError('Invalid or oversized YAML frontmatter.');
        document = `${match[0]}\nMetadata discovery only.`;
      } finally {
        await file.close();
      }
    }
    const parsed = parseSkill(document!, source.name);
    return {
      id,
      name: parsed.name,
      description: parsed.description,
      compatibility: parsed.compatibility,
      scope: source.scope,
      path: source.path,
      enabled: preference ? Boolean(preference.enabled) : true,
      automatic: preference ? Boolean(preference.automatic) : true,
    };
  }
  async catalog(): Promise<SkillCatalog> {
    const skills: Skill[] = [],
      errors: string[] = [];
    for (const name of Object.keys(builtinSkills))
      skills.push(await this.metadata(`builtin:${name}`));
    for (const scope of ['personal', 'project'] as const) {
      try {
        await noLinks(this.roots[scope]);
        const entries = await readdir(this.roots[scope], { withFileTypes: true });
        if (entries.length > 100)
          errors.push(`${scope}: only the first 100 skill directories are discovered.`);
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100)) {
          if (entry.name.startsWith('.')) continue;
          try {
            if (!entry.isDirectory() || entry.isSymbolicLink())
              throw continuityError('Expected a regular skill directory.');
            skills.push(await this.metadata(`${scope}:${entry.name}`));
          } catch (error) {
            errors.push(
              `${scope}:${entry.name}: ${error instanceof Error && 'publicMessage' in error ? error.message : 'Cannot read valid skill metadata.'}`,
            );
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          errors.push(`${scope}: skill root is unavailable or contains a symlink/junction.`);
      }
    }
    return { skills, errors, roots: this.roots };
  }
  async resolveName(name: string) {
    const catalog = await this.catalog();
    if (name.includes(':')) {
      const exact = catalog.skills.find((s) => s.id === name && s.enabled);
      if (exact) return exact.id;
    } else
      for (const scope of ['project', 'personal', 'builtin']) {
        const found = catalog.skills.find((s) => s.scope === scope && s.name === name && s.enabled);
        if (found) return found.id;
      }
    throw continuityError(
      'Skill is missing or disabled. Use an enabled skill from Skills Manager.',
      400,
    );
  }
  async detail(id: string, automatic = false): Promise<SkillDetail> {
    const skill = await this.metadata(id);
    if (!skill.enabled || (automatic && !skill.automatic))
      throw continuityError('This skill is disabled or is available only by manual invocation.');
    const source = this.source(id);
    const parsed = parseSkill(
      source.root ? text(await boundedFile(source.path, 65536)) : builtinSkills[source.name]!,
      source.name,
    );
    return { ...skill, ...parsed, resources: source.root ? await this.resources(source.root) : [] };
  }
  async inspect(id: string): Promise<SkillDetail> {
    const skill = await this.metadata(id),
      source = this.source(id);
    const parsed = parseSkill(
      source.root ? text(await boundedFile(source.path, 65536)) : builtinSkills[source.name]!,
      source.name,
    );
    return { ...skill, ...parsed, resources: source.root ? await this.resources(source.root) : [] };
  }
  async inspection(id: string) {
    return inspectSkill(await this.inspect(id));
  }
  private async resources(root: string) {
    const result: { path: string; bytes: number }[] = [];
    let total = 0,
      count = 0;
    const walk = async (directory: string, depth: number) => {
      if (depth > 6) throw continuityError('Skill resources exceed the six-directory depth limit.');
      await noLinks(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (excluded(entry.name)) continue;
        const location = join(directory, entry.name);
        if (entry.isSymbolicLink())
          throw continuityError('Skill resources cannot contain symlinks or junctions.');
        if (entry.isDirectory()) await walk(location, depth + 1);
        else {
          const stat = await lstat(location);
          if (!stat.isFile() || stat.size > 524288)
            throw continuityError('Each skill resource must be a regular file under 512 KB.');
          total += stat.size;
          if (total > 2097152 || ++count > 128)
            throw continuityError('Skill resources exceed 128 files or 2 MB.');
          if (entry.name !== 'SKILL.md' || directory !== root)
            result.push({ path: relative(root, location).split(sep).join('/'), bytes: stat.size });
        }
      }
    };
    await walk(root, 0);
    return result;
  }
  async preference(id: string, enabled: boolean, automatic: boolean) {
    await this.metadata(id);
    this.store.database.sqlite
      .prepare(
        'INSERT INTO skill_preferences VALUES(?,?,?,?) ON CONFLICT(workspace_id,skill_id) DO UPDATE SET enabled=excluded.enabled,automatic=excluded.automatic',
      )
      .run(this.store.workspaceId, id, +enabled, +automatic);
    this.store.changed();
    return this.catalog();
  }
  async save(
    scope: 'personal' | 'project',
    document: string,
    name: string,
    expectedDigest?: string,
  ) {
    nameSchema.parse(name);
    parseSkill(document, name);
    const source = this.source(`${scope}:${name}`),
      root = this.roots[scope];
    await noLinks(root, true);
    await mkdir(root, { recursive: true });
    await noLinks(root);
    if (!expectedDigest) {
      try {
        await mkdir(source.root!);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw continuityError('A skill with this name already exists in this scope.');
        throw error;
      }
      try {
        await writeFile(source.path, document, { flag: 'wx' });
      } catch (error) {
        await rmdir(source.root!).catch(() => {});
        throw error;
      }
    } else {
      const previous = await this.inspect(`${scope}:${name}`);
      if (previous.digest !== expectedDigest)
        throw continuityError('SKILL.md changed. Reload before saving.');
      const temporary = join(source.root!, `.edit-${randomUUID()}`);
      try {
        await writeFile(temporary, document, { flag: 'wx' });
        if (digest(await boundedFile(source.path, 65536)) !== expectedDigest)
          throw continuityError('SKILL.md changed before save. Reload it.');
        await noLinks(source.path);
        await rename(temporary, source.path);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    }
    this.store.changed();
    return this.inspect(`${scope}:${name}`);
  }
  async importFolder(sourcePath: string, scope: 'personal' | 'project') {
    if (!isAbsolute(sourcePath) || /^[/\\]{2}/.test(sourcePath))
      throw continuityError('Enter an absolute local skill folder path.', 400);
    const source = resolve(sourcePath);
    await noLinks(source);
    const canonical = await realpath(source);
    const parsed = parseSkill(
      text(await boundedFile(join(canonical, 'SKILL.md'), 65536)),
      basename(canonical),
    );
    const resources = await this.resources(canonical),
      root = resolve(this.roots[scope]);
    const destination = join(root, parsed.name);
    if (within(canonical, destination) || within(destination, canonical))
      throw continuityError('Import into a different skill folder.', 400);
    await noLinks(root, true);
    await mkdir(root, { recursive: true });
    await noLinks(root);
    const staging = join(root, `.import-${randomUUID()}`);
    if (!within(root, staging) || dirname(staging) !== root)
      throw continuityError('Invalid skill staging directory.');
    await mkdir(staging);
    try {
      await writeFile(join(staging, 'SKILL.md'), parsed.document, { flag: 'wx' });
      let copiedBytes = Buffer.byteLength(parsed.document);
      for (const resource of resources) {
        const target = join(staging, ...resource.path.split('/'));
        if (!within(staging, target)) throw continuityError('Invalid resource path.');
        const bytes = await boundedFile(join(canonical, ...resource.path.split('/')), 524288);
        copiedBytes += bytes.length;
        if (copiedBytes > 2097152)
          throw continuityError('Skill grew beyond the 2 MB import limit.');
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
      }
      try {
        await lstat(destination);
        throw continuityError('A skill with this name already exists in this scope.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await noLinks(root);
      await rename(staging, destination);
    } finally {
      const checked = resolve(staging);
      if (dirname(checked) !== root || !basename(checked).startsWith('.import-'))
        throw continuityError('Invalid cleanup path.');
      await noLinks(root);
      await rm(checked, { recursive: true, force: true });
    }
    this.store.changed();
    return this.inspect(`${scope}:${parsed.name}`);
  }
  async resource(id: string, path: string, inspection = false) {
    const skill = await (inspection ? this.inspect(id) : this.detail(id)),
      source = this.source(id);
    const parts = path.replaceAll('\\', '/').split('/');
    if (
      !source.root ||
      isAbsolute(path) ||
      path.length > 1024 ||
      parts.some(
        (part) => !part || part === '..' || part === '.' || part.includes(':') || excluded(part),
      )
    )
      throw continuityError('Choose a relative resource inside the loaded skill.', 400);
    const normalized = parts.join('/');
    if (!skill.resources.some((resource) => resource.path === normalized))
      throw continuityError('Skill resource not found.', 404);
    const location = join(source.root, ...parts),
      bytes = await boundedFile(location, 131072);
    return { skill, path: normalized, location, bytes, digest: digest(bytes) };
  }
  async readResource(id: string, path: string, inspection = false) {
    const resource = await this.resource(id, path, inspection);
    if (resource.bytes.length > 65536)
      throw continuityError('Text resources are limited to 64 KB.', 413);
    return { path: resource.path, content: text(resource.bytes), digest: resource.digest };
  }
  async script(id: string, path: string, args: string[]) {
    if (!path.replaceAll('\\', '/').startsWith('scripts/'))
      throw continuityError('Choose a script from the skill scripts directory.', 400);
    const resource = await this.resource(id, path),
      extension = extname(path).toLowerCase();
    text(resource.bytes);
    const interpreter = ['.js', '.mjs', '.cjs'].includes(extension)
      ? process.execPath
      : extension === '.py'
        ? 'python'
        : extension === '.ps1' && process.platform === 'win32'
          ? 'powershell.exe'
          : extension === '.sh' && process.platform !== 'win32'
            ? '/bin/sh'
            : null;
    if (!interpreter)
      throw continuityError(
        'Supported scripts: JavaScript, Python, PowerShell on Windows, and shell on POSIX.',
        400,
      );
    const argv =
      extension === '.ps1'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resource.location, ...args]
        : [resource.location, ...args];
    return {
      ...resource,
      program: interpreter,
      args: argv,
      command: `Program: ${interpreter}\nArguments (passed literally): ${JSON.stringify(argv)}`,
      cwd: this.workspace,
    };
  }
}
