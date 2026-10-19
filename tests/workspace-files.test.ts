import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceFiles } from '../packages/core/src/workspace/files.js';

test('workspace browser reads real UTF-8 files, sorts directories, and omits generated and secret content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'peaper-files-'));
  try {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'src', 'main.ts'), 'export const greeting = "Halo Peaper";\n');
    await writeFile(join(root, 'README.md'), '# Local workspace\n');
    await writeFile(join(root, '.env'), 'EXAMPLE_SECRET=not-a-real-key');
    await writeFile(join(root, '.env.example'), 'EXAMPLE_SECRET=');
    const files = new WorkspaceFiles(root);
    const directory = await files.list();
    assert.equal(directory.entries[0]?.kind, 'directory');
    assert.ok(!directory.entries.some((entry) => ['node_modules', '.env'].includes(entry.name)));
    assert.ok(directory.entries.some((entry) => entry.name === '.env.example'));
    const source = await files.read('src/main.ts');
    assert.equal(source.language, 'typescript');
    assert.match(source.content, /Halo Peaper/);
    await assert.rejects(files.read('.env'), { statusCode: 403 });
    await assert.rejects(files.read('../outside.txt'), { statusCode: 400 });
    await assert.rejects(files.read('src/main.ts:stream'), { statusCode: 400 });
    await assert.rejects(files.read('missing.ts'), { statusCode: 404 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('workspace file limits reject binary, oversized, and outside-junction targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'peaper-file-limits-'));
  const outside = await mkdtemp(join(tmpdir(), 'peaper-outside-'));
  try {
    await writeFile(join(root, 'binary.dat'), Buffer.from([1, 0, 3]));
    await writeFile(join(root, 'large.txt'), 'a'.repeat(512 * 1024 + 1));
    await writeFile(join(outside, 'private.txt'), 'not inside this workspace');
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const files = new WorkspaceFiles(root);
    await assert.rejects(files.read('binary.dat'), { statusCode: 415 });
    await assert.rejects(files.read('large.txt'), { statusCode: 413 });
    await assert.rejects(files.read('linked/private.txt'), { statusCode: 403 });
    assert.ok(!(await files.list()).entries.some((entry) => entry.name === 'linked'));
  } finally {
    // Remove the junction itself before the two explicitly created temporary directories.
    await rm(join(root, 'linked'), { force: true, recursive: false }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
