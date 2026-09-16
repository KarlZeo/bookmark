const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseBookmarks } = require('../src/lib/bookmarks/parser.ts');
const { generateBookmarksYaml } = require('../src/lib/bookmarks/serializer.ts');
const { upsertBookmarksNavInSiteYml } = require('../src/lib/bookmarks/writer.ts');
const {
  ensureUserConfigInitialized,
  ensureUserSiteYmlExists,
} = require('../src/lib/config/init.ts');

function stripYamlComments(yamlText) {
  return yamlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .trim();
}

test('parseBookmarks：解析书签栏、根目录书签与图标映射', () => {
  const html = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><A HREF="https://github.com/">GitHub</A>
    <DT><H3>工具</H3>
    <DL><p>
      <DT><A HREF="https://www.google.com/">Google</A>
    </DL><p>
  </DL><p>
</DL><p>
`;

  const bookmarks = parseBookmarks(html);
  assert.ok(bookmarks);
  assert.ok(Array.isArray(bookmarks.categories));
  assert.ok(bookmarks.categories.length >= 2);

  // 根目录书签应该插入到首位
  assert.equal(bookmarks.categories[0].name, '根目录书签');
  assert.ok(Array.isArray(bookmarks.categories[0].sites));
  assert.equal(bookmarks.categories[0].sites[0].name, 'GitHub');
  assert.equal(bookmarks.categories[0].sites[0].icon, 'fab fa-github');

  const tools = bookmarks.categories.find((c) => c.name === '工具');
  assert.ok(tools, '应解析出“工具”分类');
  assert.ok(Array.isArray(tools.sites));
  assert.equal(tools.sites[0].name, 'Google');
});

test('parseBookmarks：解码 HTML 实体（&amp;/&#39; 等）并正确写入名称与 URL', () => {
  const html = `
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><A HREF="https://example.com/?a=1&amp;b=2">Tom &amp; Jerry</A>
    <DT><A HREF="https://example.com/it&#39;s">It&#x27;s Site</A>
    <DT><H3>工具 &amp; 资料</H3>
    <DL><p>
      <DT><A HREF="https://docs.example.com/">Docs</A>
    </DL><p>
  </DL><p>
</DL><p>
`;

  const bookmarks = parseBookmarks(html);

  const root = bookmarks.categories.find((c) => c.name === '根目录书签');
  assert.ok(root, '应解析出根目录书签分类');
  assert.equal(root.sites[0].url, 'https://example.com/?a=1&b=2');
  assert.equal(root.sites[0].name, 'Tom & Jerry');
  assert.equal(root.sites[1].url, "https://example.com/it's");
  assert.equal(root.sites[1].name, "It's Site");

  const tools = bookmarks.categories.find((c) => c.name === '工具 & 资料');
  assert.ok(tools, '文件夹名中的实体应解码');
  assert.equal(tools.sites[0].name, 'Docs');
});

test('page-data：subgroups（第4层）应保留给 Astro 页面渲染', () => {
  const { prepareTestPageData } = require('./helpers/site-model.ts');
  const config = {
    site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
    profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
    social: [],
    navigation: [{ id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' }],
    bookmarks: {
      title: '我的书签',
      subtitle: '测试 subgroups 渲染',
      template: 'bookmarks',
      icons: { mode: 'manual' },
      categories: [
        {
          name: '技术',
          icon: 'fas fa-code',
          subcategories: [
            {
              name: '前端',
              icon: 'fas fa-laptop-code',
              groups: [
                {
                  name: '框架',
                  icon: 'fas fa-cubes',
                  subgroups: [
                    {
                      name: 'React生态',
                      icon: 'fab fa-react',
                      sites: [
                        {
                          name: 'React',
                          url: 'https://reactjs.org/',
                          icon: 'fab fa-react',
                          description: 'React官方',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const page = prepareTestPageData('bookmarks', config).data;
  const subgroup = page.categories[0].subcategories[0].groups[0].subgroups[0];

  assert.equal(subgroup.name, 'React生态');
  assert.equal(subgroup.sites[0].name, 'React');
});

test('generateBookmarksYaml：生成 YAML 且可被解析', () => {
  const bookmarks = {
    categories: [
      {
        name: '示例分类',
        icon: 'fas fa-folder',
        sites: [
          { name: 'Example', url: 'https://example.com', icon: 'fas fa-link', description: '' },
        ],
      },
    ],
  };

  const yamlText = generateBookmarksYaml(bookmarks);
  assert.ok(typeof yamlText === 'string');
  assert.ok(yamlText.includes('# 自动生成的书签配置文件'));
  assert.ok(yamlText.includes('categories:'));

  const yaml = require('js-yaml');
  const parsed = yaml.load(stripYamlComments(yamlText));
  assert.equal(parsed.title, '我的书签');
  assert.ok(Array.isArray(parsed.categories));
  assert.equal(parsed.categories[0].name, '示例分类');
});

test('upsertBookmarksNavInSiteYml：无 navigation 时追加并幂等', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const filePath = path.join(tmp, 'site.yml');

  fs.writeFileSync(filePath, `title: Test Site\n`, 'utf8');

  const r1 = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(r1.updated, true);

  const updated1 = fs.readFileSync(filePath, 'utf8');
  assert.ok(updated1.includes('navigation:'));
  assert.ok(updated1.includes('- name: 书签'));
  assert.ok(updated1.includes('id: bookmarks'));

  const r2 = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(r2.updated, false);
  assert.equal(r2.reason, 'already_present');
});

test('upsertBookmarksNavInSiteYml：已有 navigation 时插入并保留注释与缩进', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const filePath = path.join(tmp, 'site.yml');

  fs.writeFileSync(
    filePath,
    [
      '# 顶部注释',
      'title: Test Site',
      'navigation:',
      '  # 常用页面',
      '  - name: 首页',
      '    icon: fas fa-home',
      '    id: common',
      'theme:',
      '  mode: system',
      '',
    ].join('\n'),
    'utf8'
  );

  const result = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(result.updated, true);
  assert.equal(result.reason, 'updated_navigation_block');

  const updated = fs.readFileSync(filePath, 'utf8');
  assert.ok(updated.includes('# 顶部注释'));
  assert.ok(updated.includes('  # 常用页面'));
  assert.match(
    updated,
    /navigation:\n  # 常用页面\n  - name: 首页[\s\S]*?  - name: 书签\n    icon: fas fa-bookmark\n    id: bookmarks\ntheme:/
  );
});

test('upsertBookmarksNavInSiteYml：已有 bookmarks 时不重复写入', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const filePath = path.join(tmp, 'site.yml');

  fs.writeFileSync(
    filePath,
    ['title: Test Site', 'navigation:', '  - name: 书签', '    id: bookmarks', ''].join('\n'),
    'utf8'
  );

  const result = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(result.updated, false);
  assert.equal(result.reason, 'already_present');
  assert.equal((fs.readFileSync(filePath, 'utf8').match(/id: bookmarks/g) || []).length, 1);
});

test('upsertBookmarksNavInSiteYml：navigation 非数组时返回诊断且不改文件', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const filePath = path.join(tmp, 'site.yml');
  const original = ['title: Test Site', 'navigation:', '  enabled: true', ''].join('\n');
  fs.writeFileSync(filePath, original, 'utf8');

  const result = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(result.updated, false);
  assert.equal(result.reason, 'navigation_not_array');
  assert.equal(fs.readFileSync(filePath, 'utf8'), original);
});

test('ensureUserConfigInitialized/ensureUserSiteYmlExists：可在空目录初始化用户配置', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const originalCwd = process.cwd();
  process.chdir(tmp);

  try {
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.writeFileSync('config/_default/site.yml', 'title: Default\n', 'utf8');
    fs.writeFileSync('config/_default/pages/common.yml', 'categories: []\n', 'utf8');

    const init = ensureUserConfigInitialized();
    assert.equal(init.initialized, true);
    assert.ok(fs.existsSync('config/user/site.yml'));
    assert.ok(fs.existsSync('config/user/pages/common.yml'));

    // 若 site.yml 已存在，应直接返回 true
    assert.equal(ensureUserSiteYmlExists(), true);
  } finally {
    process.chdir(originalCwd);
  }
});

test('parseBookmarks：超过 4 层嵌套被截断并保留前 4 层', () => {
  const html = `
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><H3>L1</H3>
    <DL><p>
      <DT><H3>L2</H3>
      <DL><p>
        <DT><H3>L3</H3>
        <DL><p>
          <DT><H3>L4</H3>
          <DL><p>
            <DT><A HREF="https://deep.example.com/">Deep</A>
            <DT><H3>L5</H3>
            <DL><p>
              <DT><A HREF="https://deeper.example.com/">Deeper</A>
            </DL><p>
          </DL><p>
        </DL><p>
      </DL><p>
    </DL><p>
  </DL><p>
</DL><p>
`;
  const bookmarks = parseBookmarks(html);
  const l1 = bookmarks.categories.find((c) => c.name === 'L1');
  assert.ok(l1, 'L1 应保留');
  const l2 = l1.subcategories.find((c) => c.name === 'L2');
  assert.ok(l2, 'L2 应保留');
  const l3 = l2.groups.find((c) => c.name === 'L3');
  assert.ok(l3, 'L3 应保留');
  const l4 = l3.subgroups.find((c) => c.name === 'L4');
  assert.ok(l4, 'L4 应保留');
  assert.ok(
    l4.sites.some((s) => s.name === 'Deep'),
    'L4 直接书签应保留'
  );
  assert.ok(!l4.subgroups || l4.subgroups.length === 0, 'L5 应被截断');
  assert.ok(!JSON.stringify(bookmarks).includes('Deeper'), 'L5 内容不应被解析');
});

test('parseBookmarks：嵌套文件夹内书签 URL 与名称解码实体', () => {
  const html = `
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><H3>工具</H3>
    <DL><p>
      <DT><A HREF="https://example.com/?q=a&amp;b=1">R&amp;D</A>
      <DT><A HREF="https://example.com/it&#39;s">It&#x27;s</A>
    </DL><p>
  </DL><p>
</DL><p>
`;
  const bookmarks = parseBookmarks(html);
  const tools = bookmarks.categories.find((c) => c.name === '工具');
  assert.ok(tools, '应解析出“工具”分类');
  assert.equal(tools.sites[0].url, 'https://example.com/?q=a&b=1');
  assert.equal(tools.sites[0].name, 'R&D');
  assert.equal(tools.sites[1].url, "https://example.com/it's");
  assert.equal(tools.sites[1].name, "It's");
});

test('inferBookmarkIcon：子域专属图标优先于父域（长度降序）', () => {
  const { inferBookmarkIcon } = require('../src/lib/bookmarks/icons.ts');
  assert.equal(inferBookmarkIcon('https://drive.google.com/'), 'fab fa-google-drive');
  assert.equal(inferBookmarkIcon('https://docs.google.com/'), 'fas fa-file-alt');
  assert.equal(inferBookmarkIcon('https://www.google.com/'), 'fab fa-google');
  assert.equal(inferBookmarkIcon('https://github.com/'), 'fab fa-github');
  assert.equal(inferBookmarkIcon('https://unknown-example.com/'), 'fas fa-link');
});

test('upsertBookmarksNavInSiteYml：flow 风格 navigation（含换行）返回诊断且不改文件', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-flow-test-'));
  const filePath = path.join(tmp, 'site.yml');
  const cases = ['title: T\nnavigation: []\n', 'title: T\nnavigation:\n  [{name: a, id: a}]\n'];
  try {
    for (const content of cases) {
      fs.writeFileSync(filePath, content, 'utf8');
      const result = upsertBookmarksNavInSiteYml(filePath);
      assert.equal(result.updated, false);
      assert.equal(result.reason, 'flow_navigation_not_supported');
      assert.equal(fs.readFileSync(filePath, 'utf8'), content, 'flow 写法下文件应保持不变');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
