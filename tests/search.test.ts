import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceFiles } from '../packages/core/src/workspace/files.js';
import { searchWorkspace } from '../packages/core/src/agent/search.js';

test(
  'text, regex and filename search exclude secrets/data and isolate pathological regex off the server thread',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'peaper-search-'));
    const data = join(directory, 'data');
    await mkdir(data);
    const files = new WorkspaceFiles(directory, data);
    try {
      await writeFile(join(directory, 'math.mjs'), 'export const add = (a, b) => a + b;\n');
      await writeFile(join(directory, '.ENV.local'), 'SECRET_TOKEN=PRIVATE_MATCH');
      await writeFile(join(data, 'private.txt'), 'PRIVATE_MATCH');
      const signal = new AbortController().signal;
      const literal = (await searchWorkspace(files, 'const add', false, undefined, signal)) as {
        matches: { path: string; line: number }[];
      };
      assert.equal(literal.matches[0]?.path, 'math.mjs');
      assert.equal(literal.matches[0]?.line, 1);
      const regex = (await searchWorkspace(files, 'a\\s*\\+\\s*b', true, undefined, signal)) as {
        matches: unknown[];
      };
      assert.equal(regex.matches.length, 1);
      const names = (await searchWorkspace(files, '', false, 'math', signal)) as {
        files: string[];
      };
      assert.deepEqual(names.files, ['math.mjs']);
      const secrets = (await searchWorkspace(files, 'PRIVATE_MATCH', false, undefined, signal)) as {
        matches: unknown[];
      };
      assert.equal(secrets.matches.length, 0);
      await writeFile(join(directory, 'slow.txt'), 'a'.repeat(20000) + '!');
      await assert.rejects(
        searchWorkspace(files, '(a+)+$', true, 'slow.txt', signal),
        /time limit/,
      );
      const aborted = new AbortController();
      aborted.abort();
      await assert.rejects(searchWorkspace(files, 'add', false, undefined, aborted.signal));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
