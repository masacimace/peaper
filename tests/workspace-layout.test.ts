import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout, readLayout, resizeLayout } from '../apps/web/src/layout/layout.js';
import { normalizePreviewUrl } from '../apps/web/src/features/preview/preview-url.js';

test('layout preferences restore panel choices and recover from corrupt or unsupported storage', () => {
  const layout = {
    ...structuredClone(defaultLayout),
    sidebarCollapsed: true,
    maximized: 'preview',
    visible: { files: false, agent: true, terminal: false, preview: true },
  };
  assert.deepEqual(readLayout(JSON.stringify(layout)), layout);
  assert.deepEqual(readLayout('{broken'), defaultLayout);
  assert.deepEqual(readLayout(JSON.stringify({ ...layout, version: 99 })), defaultLayout);
  assert.deepEqual(readLayout(JSON.stringify({ ...layout, sizes: { files: -1 } })), defaultLayout);
});

test('resizing remains bounded and does not mutate another workspace layout', () => {
  const original = structuredClone(defaultLayout);
  const resized = resizeLayout(original, 'files', 5000);
  assert.equal(resized.sizes.files, 360);
  assert.equal(original.sizes.files, 192);
  assert.equal(resizeLayout(original, 'agent', -5000).sizes.agent, 270);
  assert.equal(resizeLayout(original, 'bottomSplit', -1).sizes.bottomSplit, 0.25);
  assert.equal(resizeLayout(original, 'bottom', Number.NaN), original);
});

test('manual live preview accepts only local app URLs and rejects the Peaper origin and credentials', () => {
  const origin = 'http://127.0.0.1:4317';
  assert.equal(
    normalizePreviewUrl(' http://localhost:3000/dashboard ', origin),
    'http://localhost:3000/dashboard',
  );
  assert.equal(normalizePreviewUrl('https://127.0.0.1:8000', origin), 'https://127.0.0.1:8000/');
  for (const address of [
    'javascript:alert(1)',
    'file:///C:/test',
    'https://example.com',
    'http://localhost.evil.test',
    'http://username:password@localhost:3000',
    'http://localhost:4317',
    'not a URL',
  ])
    assert.throws(() => normalizePreviewUrl(address, origin));
});
