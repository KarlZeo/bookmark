const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadHandlebarsTemplates, renderTemplate } = require('../src/generator.js');

function withRepoCwd(callback) {
  const originalCwd = process.cwd();
  const repoRoot = path.join(__dirname, '..');
  try {
    process.chdir(repoRoot);
    callback();
  } finally {
    process.chdir(originalCwd);
  }
}

function renderBookmarksWithSite(site) {
  loadHandlebarsTemplates();
  return renderTemplate(
    'bookmarks',
    {
      pageId: 'bookmarks',
      homePageId: 'bookmarks',
      title: '书签',
      subtitle: '测试',
      siteCardStyle: '',
      icons: { mode: 'favicon', region: 'com' },
      categories: [
        {
          name: '分类',
          icon: 'fas fa-folder',
          sites: [site],
        },
      ],
    },
    false
  );
}

test('站点配置包含 faviconUrl（本地 assets 路径）时，渲染 bookmarks 不应崩溃', () => {
  withRepoCwd(() => {
    const html = renderBookmarksWithSite({
      name: '内部系统',
      url: 'https://intranet.example/',
      faviconUrl: 'assets/menav.svg',
      icon: 'fas fa-link',
      external: true,
    });

    assert.match(html, /data-favicon-url="assets\/menav\.svg"/);
    assert.match(html, /src="assets\/menav\.svg"/);
  });
});

test('站点配置包含 faviconUrl（在线 ico）时，渲染 bookmarks 不应崩溃', () => {
  withRepoCwd(() => {
    const html = renderBookmarksWithSite({
      name: 'WebCull',
      url: 'https://example.com/',
      faviconUrl: 'https://content.webcull.com/images/websites/icons/470/695/b788b0.ico',
      icon: 'fas fa-link',
      external: true,
    });

    assert.match(
      html,
      /data-favicon-url="https:\/\/content\.webcull\.com\/images\/websites\/icons\/470\/695\/b788b0\.ico"/
    );
    assert.match(
      html,
      /src="https:\/\/content\.webcull\.com\/images\/websites\/icons\/470\/695\/b788b0\.ico"/
    );
  });
});
