const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadHandlebarsTemplates, generateAllPagesHTML } = require('../src/generator.js');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('P1-2：分类 slug 应稳定且可去重', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [{ id: 'home', name: '首页', icon: 'fas fa-home' }],
      home: {
        title: 'HOME',
        subtitle: 'HOME_SUB',
        template: 'page',
        categories: [
          { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
          { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
          { name: '含 空格/特殊#字符', icon: 'fas fa-tag', sites: [] },
        ],
      },
    };

    const pages = generateAllPagesHTML(config);
    assert.ok(typeof pages.home === 'string' && pages.home.length > 0);

    assert.ok(pages.home.includes('id="重复-分类"'), '首个重复分类应生成稳定 slug');
    assert.ok(pages.home.includes('id="重复-分类-2"'), '重复分类应通过后缀去重');
    assert.ok(pages.home.includes('id="含-空格-特殊-字符"'), '空格/特殊字符应被规范化为可用 slug');

    assert.ok(pages.home.includes('data-id="重复-分类"'));
    assert.ok(pages.home.includes('data-id="重复-分类-2"'));
  });
});
