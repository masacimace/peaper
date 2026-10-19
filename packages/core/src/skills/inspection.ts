import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, extname, join, posix } from 'node:path';
import type { SkillDetail, SkillInspection } from '@peaper/shared';

// Inspect declared paths only. Never execute a skill or follow references outside its manifest.
export function inspectReferences(skill: SkillDetail) {
  const paths = new Set<string>();
  const links = /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+['"][^\n]*?['"])?\s*\)/g;
  const plain = skill.instructions
    .replace(links, '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi, '');
  const candidates = [
    ...Array.from(skill.instructions.matchAll(links), (m) => m[1]!),
    ...Array.from(
      plain.matchAll(/\b(?:scripts|references|assets|examples|templates)\/[^\s`<>"'()\[\]]+/g),
      (m) => m[0],
    ),
  ];
  for (let target of candidates) {
    target = target.replace(/^<|>$/g, '').replace(/[.,;]+$/, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) continue;
    target = target.split(/[?#]/)[0]!;
    try {
      target = decodeURIComponent(target);
    } catch {
      /* Preserve malformed paths as missing. */
    }
    if (!target) continue;
    paths.add(posix.normalize(target.replaceAll('\\', '/')));
    if (paths.size > 128) break;
  }
  return {
    references: [...paths].slice(0, 128).map((path) => {
      const normalized = posix.normalize(path);
      const outside =
        normalized.startsWith('/') ||
        normalized === '..' ||
        normalized.startsWith('../') ||
        /^[a-z]:/i.test(normalized);
      const found =
        normalized === 'SKILL.md' ||
        skill.resources.some(
          (r) => r.path === normalized || r.path.startsWith(`${normalized.replace(/\/$/, '')}/`),
        );
      return {
        path,
        status: outside ? ('outside' as const) : found ? ('found' as const) : ('missing' as const),
      };
    }),
    referencesTruncated: paths.size > 128,
  };
}

async function onPath(command: string, environment: NodeJS.ProcessEnv, platform: NodeJS.Platform) {
  const extensions = platform === 'win32' ? ['', '.exe', '.com'] : [''];
  for (const directory of (environment.PATH ?? environment.Path ?? '')
    .split(delimiter)
    .filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory.replace(/^"|"$/g, ''), `${command}${extension}`);
      try {
        if (!(await stat(candidate)).isFile()) continue;
        await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
        return true;
      } catch {
        /* Continue checking PATH without launching any executable. */
      }
    }
  }
  return false;
}

export async function inspectSkill(
  skill: SkillDetail,
  environment = process.env,
  platform = process.platform,
): Promise<SkillInspection> {
  const groups = new Map<string, { command: string | null; supported: boolean; files: string[] }>();
  for (const file of skill.resources.filter((r) => r.path.startsWith('scripts/'))) {
    const extension = extname(file.path).toLowerCase();
    let name: string,
      command: string | null,
      supported = true;
    if (['.js', '.mjs', '.cjs'].includes(extension)) {
      name = 'Node.js';
      command = null;
    } else if (extension === '.py') {
      name = 'Python';
      command = 'python';
    } else if (extension === '.ps1') {
      name = 'PowerShell';
      command = 'powershell.exe';
      supported = platform === 'win32';
    } else if (extension === '.sh') {
      name = 'POSIX shell';
      command = '/bin/sh';
      supported = platform !== 'win32';
    } else if (['.bat', '.cmd', '.rb', '.ts', '.tsx'].includes(extension)) {
      name = `Unsupported ${extension} script`;
      command = null;
      supported = false;
    } else continue;
    if (!groups.has(name)) groups.set(name, { command, supported, files: [] });
    groups.get(name)!.files.push(file.path);
  }
  const runtimes: SkillInspection['runtimes'] = [];
  for (const [name, value] of groups) {
    let available = value.command === null;
    if (value.supported && value.command) {
      if (value.command === '/bin/sh') {
        try {
          await access(value.command, constants.X_OK);
          available = (await stat(value.command)).isFile();
        } catch {
          available = false;
        }
      } else available = await onPath(value.command, environment, platform);
    }
    runtimes.push({
      name,
      files: value.files,
      status: !value.supported ? 'unsupported' : available ? 'available' : 'unavailable',
    });
  }
  return { skill, ...inspectReferences(skill), runtimes, inspectedAt: new Date().toISOString() };
}
