import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMessage } from '../src/features/agent/AssistantMessage.js';

test('model Markdown renders code and lists without executing HTML, unsafe links, or automatic image requests', () => {
  const html = renderToStaticMarkup(
    <AssistantMessage
      text={
        '**Verified**\n\n- one test\n\n```js\nconst sum = a + b;\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![private](https://example.test/collect)\n\n[docs](https://example.test/docs)'
      }
    />,
  );
  assert.match(html, /<strong>Verified<\/strong>/);
  assert.match(html, /<li>one test<\/li>/);
  assert.match(html, /<code class="[^"]*\blanguage-js\b[^"]*">/);
  assert.ok(!html.includes('<script') && !html.includes('javascript:'));
  assert.ok(!html.includes('<img') && !html.includes('/collect'));
  assert.match(html, /rel="noopener noreferrer"/);
});
