const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadHandlebarsTemplates, generateHTML } = require('../src/generator.js');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('P1-2：子菜单锚点应使用分类 slug（href + data-category-id）', () => {
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
        ],
      },
    };

    const html = generateHTML(config);

    assert.ok(html.includes('class="submenu-item"'), '应输出子菜单项');
    assert.ok(html.includes('href="?page=home#重复-分类"'), '子菜单 href 应支持 ?page=<id>#<slug>');
    assert.ok(html.includes('data-category-id="重复-分类"'), '子菜单应携带 data-category-id');
    assert.ok(html.includes('class="nav-item'), '应输出导航项');
    assert.ok(html.includes('href="?page=home"'), '导航项 href 应支持 ?page=<id> 深链接');
  });
});
