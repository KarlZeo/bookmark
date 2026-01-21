const test = require('node:test');
const assert = require('node:assert/strict');

const { generate404Html } = require('../src/generator.js');

test('P1-5：404.html 回跳应将 /<id> 转为 ?page=<id>（并支持仓库前缀）', () => {
  const html = generate404Html({ site: { title: 'Test Site' } });

  assert.ok(typeof html === 'string' && html.length > 0);
  assert.ok(html.includes('?page='), '应包含 ?page= 形态');
  assert.ok(html.includes('encodeURIComponent(pageId)'), '应对 pageId 做 URL 编码');
  assert.ok(html.includes('segments.length === 1'), '应支持用户站点 /<id>');
  assert.ok(html.includes('segments.length === 2'), '应支持仓库站点 /<repo>/<id>');
  assert.ok(html.includes('l.replace(target)'), '应使用 location.replace 执行回跳');
});
