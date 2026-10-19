import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { themes, normalizeTheme, defaultTheme } from '../apps/web/src/theme/themes.js';

const palettes = await readFile('apps/web/src/styles/themes.css', 'utf8');
function palette(id: string) {
  const start = palettes.indexOf(`[data-theme-preview='${id}'] {`);
  assert.ok(start >= 0, `Missing palette: ${id}`);
  const block = palettes.slice(start, palettes.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]+);/gi)].map((match) => [match[1]!, match[2]!]),
  );
}
function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('five complete palettes supply readable text, syntax, status, and selected controls', () => {
  assert.equal(themes.filter((theme) => theme.mode === 'dark').length, 3);
  assert.equal(themes.filter((theme) => theme.mode === 'light').length, 2);
  const tokens = Object.keys(palette(defaultTheme)).sort();
  const pairs = [
    ['text', 'canvas'],
    ['text', 'surface'],
    ['text-secondary', 'surface'],
    ['text-tertiary', 'surface-raised'],
    ['text', 'surface-selected'],
    ['text', 'selection'],
    ['accent-foreground', 'accent'],
    ['success', 'success-soft'],
    ['warning', 'warning-soft'],
    ['danger', 'danger-soft'],
    ...['comment', 'keyword', 'string', 'number', 'type', 'delimiter'].map((token) => [
      `syntax-${token}`,
      'editor',
    ]),
  ];
  for (const theme of themes) {
    const colors = palette(theme.id);
    assert.deepEqual(Object.keys(colors).sort(), tokens, theme.name);
    for (const [foreground, background] of pairs) {
      const ratio = contrast(colors[foreground!]!, colors[background!]!);
      assert.ok(
        ratio >= 4.5,
        `${theme.name}: ${foreground} on ${background} has contrast ${ratio.toFixed(2)}`,
      );
    }
  }
});

test('global styles and Tailwind aliases use declared semantic tokens', async () => {
  const app = await readFile('apps/web/src/styles/base.css', 'utf8');
  const tokens = await readFile('apps/web/src/styles/tokens.css', 'utf8');
  const declared = new Set(
    // Browser integrations can declare scoped state, such as animated scrollbar visibility.
    [...`${palettes}\n${tokens}\n${app}`.matchAll(/(--[\w-]+):/g)].map((match) => match[1]),
  );
  declared.add('--navigation-width'); // Supplied by the workspace layout.
  assert.ok(!/#[\da-f]{3,8}\b/i.test(app));
  for (const match of `${app}\n${tokens}`.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(declared.has(match[1]), `Undeclared token: ${match[1]}`);
  }
});

test('the pre-paint bootstrap restores every theme and falls back safely on invalid or blocked storage', async () => {
  const script = await readFile('apps/web/public/theme-init.js', 'utf8');
  for (const saved of [...themes.map((theme) => theme.id), 'unknown', null, '{broken']) {
    const document = { documentElement: { dataset: {} as { theme?: string } } };
    runInNewContext(script, { document, localStorage: { getItem: () => saved } });
    assert.equal(document.documentElement.dataset.theme, normalizeTheme(saved));
  }
  const document = { documentElement: { dataset: {} as { theme?: string } } };
  runInNewContext(script, {
    document,
    localStorage: {
      getItem() {
        throw new Error('Blocked');
      },
    },
  });
  assert.equal(document.documentElement.dataset.theme, defaultTheme);
});
