import assert from 'node:assert/strict';
import test from 'node:test';
import { compactArticleHtml } from '../shared/utils/article-html.ts';

test('公众号正文解析前移除大型页面脚本外壳', () => {
  const rawHtml = `<!DOCTYPE html>
    <html>
      <body>
        <div id="js_article">
          <h1>测试标题</h1>
          <div id="js_content" style="visibility:hidden">
            <p>这是需要保留的公众号正文。</p>
            <img data-src="https://example.com/image.png">
          </div>
          <div id="js_pc_qr_code">二维码区域</div>
        </div>
        <script>${'x'.repeat(2_000_000)}</script>
      </body>
    </html>`;

  const compacted = compactArticleHtml(rawHtml);

  assert.ok(compacted.length < 1_000);
  assert.match(compacted, /测试标题/);
  assert.match(compacted, /这是需要保留的公众号正文/);
  assert.doesNotMatch(compacted, /二维码区域/);
  assert.doesNotMatch(compacted, /x{100}/);
});

test('缺少文章边界时保持原始 HTML', () => {
  const rawHtml = '<html><body><p>普通页面</p></body></html>';
  assert.equal(compactArticleHtml(rawHtml), rawHtml);
});
