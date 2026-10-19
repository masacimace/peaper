import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, IconButton } from '../src/components/ui/Button.js';
import { cn } from '../src/components/ui/cn.js';

test('semantic font sizes and colors compose independently with predictable overrides', () => {
  assert.equal(cn('text-caption text-muted', 'text-label text-danger'), 'text-label text-danger');
  assert.equal(
    cn('bg-editor px-2 py-1', false && 'hidden', 'bg-surface-panel px-3'),
    'py-1 bg-surface-panel px-3',
  );
  assert.equal(cn('hover:bg-surface-hover', 'hover:bg-accent'), 'hover:bg-accent');
});

test('shared controls preserve explicit form submission and avoid accidental icon submissions', () => {
  const html = renderToStaticMarkup(
    <form>
      <IconButton aria-label="Dismiss" />
      <Button variant="primary" type="submit" disabled>
        Save
      </Button>
    </form>,
  );
  assert.match(html, /<button type="button"[^>]+aria-label="Dismiss"/);
  assert.match(html, /<button type="submit"[^>]+disabled=""/);
});
