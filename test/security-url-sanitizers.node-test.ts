const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeLinkHref } = require('../src/lib/content/markdown.ts');
const { menavSanitizeUrl } = require('../src/runtime/shared.ts');
const { getSafeUrl } = require('../src/lib/view-data/view-utils.ts');
const { isSafeUriAttribute } = require('../src/lib/security/html.ts');
const { sanitizeUrl, sanitizeUrlOrHash } = require('../src/shared/sanitize-url.ts');

const ALLOWED = ['http', 'https', 'mailto', 'tel'];

const DANGEROUS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<b>hi</b>',
  'vbscript:msgbox(1)',
  'ftp://example.com',
];

test('content/markdown sanitizeLinkHref：危险 scheme 全部降级为 #', () => {
  for (const url of DANGEROUS) {
    assert.equal(sanitizeLinkHref(url, ALLOWED), '#', url);
  }
});

test('content/markdown sanitizeLinkHref：协议相对、反斜杠与控制字符形式拦截', () => {
  assert.equal(sanitizeLinkHref('//evil.com', ALLOWED), '#');
  assert.equal(sanitizeLinkHref('/\\evil.com', ALLOWED), '#');
  assert.equal(sanitizeLinkHref('/\\t/evil.com', ALLOWED), '#');
  // WHATWG 解析前剥离 ASCII 控制字符：/\n/evil.com 剥离后为 //evil.com，仍应拦截
  assert.equal(sanitizeLinkHref('/\n/evil.com', ALLOWED), '#');
});

test('content/markdown sanitizeLinkHref：相对路径与合法 scheme 保留', () => {
  assert.equal(sanitizeLinkHref('/path', ALLOWED), '/path');
  assert.equal(sanitizeLinkHref('./x', ALLOWED), './x');
  assert.equal(sanitizeLinkHref('../x', ALLOWED), '../x');
  assert.equal(sanitizeLinkHref('?q=1', ALLOWED), '?q=1');
  assert.equal(sanitizeLinkHref('#a', ALLOWED), '#a');
  assert.equal(
    sanitizeLinkHref('https://example.com/a?b=1#c', ALLOWED),
    'https://example.com/a?b=1#c'
  );
  assert.equal(sanitizeLinkHref('mailto:a@b.com', ALLOWED), 'mailto:a@b.com');
  assert.equal(sanitizeLinkHref('tel:+123', ALLOWED), 'tel:+123');
});

test('runtime/shared menavSanitizeUrl：协议相对、反斜杠、控制字符与危险 scheme 全部降级', () => {
  assert.equal(menavSanitizeUrl('//evil.com', 't'), '#');
  assert.equal(menavSanitizeUrl('/\\evil.com', 't'), '#');
  assert.equal(menavSanitizeUrl('/\\t/evil.com', 't'), '#');
  assert.equal(menavSanitizeUrl('/\n/evil.com', 't'), '#');
  for (const url of DANGEROUS) {
    assert.equal(menavSanitizeUrl(url, 't'), '#', url);
  }
});

test('runtime/shared menavSanitizeUrl：相对路径与合法 scheme 保留，空输入降级', () => {
  assert.equal(menavSanitizeUrl('/path', 't'), '/path');
  assert.equal(menavSanitizeUrl('./x', 't'), './x');
  assert.equal(menavSanitizeUrl('../x', 't'), '../x');
  assert.equal(menavSanitizeUrl('?q=1', 't'), '?q=1');
  assert.equal(menavSanitizeUrl('#a', 't'), '#a');
  assert.equal(menavSanitizeUrl('https://example.com', 't'), 'https://example.com');
  assert.equal(menavSanitizeUrl('mailto:a@b.com', 't'), 'mailto:a@b.com');
  assert.equal(menavSanitizeUrl('tel:+123', 't'), 'tel:+123');
  assert.equal(menavSanitizeUrl(null, 't'), '#');
  assert.equal(menavSanitizeUrl(undefined, 't'), '#');
  assert.equal(menavSanitizeUrl('', 't'), '#');
});

test('安全一致性：markdown/shared/view-utils 三处消毒器对同一输入结论一致', () => {
  const cases = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '//evil.com',
    '/\\evil.com',
    '/\n/evil.com',
    'https://example.com',
    '/path',
    './x',
    '../x',
    '?q=1',
    '#a',
    'mailto:a@b.com',
    'tel:+123',
  ];
  for (const url of cases) {
    const expected = getSafeUrl(url, ALLOWED);
    assert.equal(menavSanitizeUrl(url, 't'), expected, `menavSanitizeUrl(${url})`);
    assert.equal(sanitizeLinkHref(url, ALLOWED), expected, `sanitizeLinkHref(${url})`);
  }
});

test('安全一致性：html isSafeUriAttribute 布尔谓词与字符串消毒器结论一致（含第四处）', () => {
  // isSafeUriAttribute 是布尔谓词（html 属性白名单判定），与字符串消毒器的降级结论同源：
  // 字符串『降级为 #』 ⇔ 布尔『不安全 false』；字符串『原样返回』 ⇔ 布尔『安全 true』。
  const cases = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '//evil.com',
    '/\\evil.com',
    '/\n/evil.com',
    'https://example.com',
    '/path',
    './x',
    '../x',
    '?q=1',
    'mailto:a@b.com',
    'tel:+123',
  ];
  for (const url of cases) {
    const expected = getSafeUrl(url, ALLOWED) !== '#';
    assert.equal(isSafeUriAttribute(url), expected, `isSafeUriAttribute(${url})`);
  }
});

test('shared/sanitize-url 单一入口：sanitizeUrl 返回 null 表示不安全，sanitizeUrlOrHash 降级为 #', () => {
  // 核心函数本身也应被直测，作为四份消费方的唯一语义来源
  assert.equal(sanitizeUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeUrl('//evil.com'), null);
  assert.equal(sanitizeUrlOrHash('javascript:alert(1)'), '#');
  assert.equal(sanitizeUrlOrHash('https://example.com'), 'https://example.com');
  assert.equal(sanitizeUrlOrHash(''), '#');
  assert.equal(sanitizeUrlOrHash(null), '#');
});
