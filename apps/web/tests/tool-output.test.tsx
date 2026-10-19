import type { ToolActivity } from '@peaper/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityOutput, activityStatus } from '../src/features/agent/tool-output.js';

test('command status uses the runner result and never infers success from streamed stdout', () => {
  const activity: ToolActivity = {
    id: 'test',
    name: 'run_command',
    input: {},
    status: 'running',
    output: '{"exitCode":0}',
  };
  assert.equal(activityStatus(activity), 'running');
  activity.status = 'completed';
  activity.output = JSON.stringify({
    exitCode: 1,
    output: 'ASSERTION_FAILED',
    timedOut: false,
    truncated: false,
    cancelled: false,
  });
  assert.equal(activityStatus(activity), 'exit 1');
  assert.match(activityOutput(activity), /ASSERTION_FAILED\nExit code: 1/);
  activity.output = JSON.stringify({
    exitCode: null,
    output: '',
    timedOut: true,
    truncated: true,
    cancelled: false,
  });
  assert.equal(activityStatus(activity), 'timed out');
  assert.match(activityOutput(activity), /truncated/);
});
