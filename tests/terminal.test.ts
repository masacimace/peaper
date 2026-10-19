import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { TerminalManager } from '../packages/core/src/terminal/manager.js';

test(
  'a naturally exiting shell reports its exit status and releases its worker',
  { timeout: 20_000 },
  async () => {
    const manager = new TerminalManager(tmpdir());
    try {
      const { terminal } = await manager.create();
      const exit = new Promise<number>((done) => terminal.onExit(({ exitCode }) => done(exitCode)));
      terminal.write('exit 7\r');
      assert.equal(await exit, 7);
      assert.equal(manager.active, 0);
    } finally {
      await manager.close();
    }
  },
);

test(
  'stopping a Windows terminal also stops a running command beneath its shell',
  { skip: process.platform !== 'win32', timeout: 25_000 },
  async () => {
    const manager = new TerminalManager(tmpdir());
    let childPid: number | undefined;
    try {
      const { id, terminal } = await manager.create();
      const pid = new Promise<number>((done) => {
        let output = '';
        terminal.onData((data) => {
          output += data;
          const match = output.match(/PEAPER_CHILD_(\d+)/);
          if (match) done(Number(match[1]));
        });
      });
      const nodePath = process.execPath.replaceAll("'", "''");
      terminal.write(
        `& '${nodePath}' -e "console.log('PEAPER_'+'CHILD_'+process.pid);setInterval(()=>{},1000)"\r`,
      );
      childPid = await pid;
      assert.doesNotThrow(() => process.kill(childPid!, 0));
      await manager.stop(id);
      assert.equal(manager.active, 0);
      assert.throws(() => process.kill(childPid!, 0), /ESRCH/);
    } finally {
      await manager.close();
      if (childPid) {
        try {
          process.kill(childPid);
        } catch {
          /* The cleanup assertion already proved termination. */
        }
      }
    }
  },
);
