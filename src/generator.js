const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { execFileSync } = require('child_process');
const Handlebars = require('handlebars');

// 导入Handlebars助手函数
const { registerAllHelpers } = require('./helpers');

// 扩展配置输出：独立静态文件（按需加载）
const MENAV_EXTENSION_CONFIG_FILE = 'menav-config.json';

// 注册Handlebars实例和辅助函数
const handlebars = Handlebars.create();
registerAllHelpers(handlebars);

// 加载和注册Handlebars模板的函数
function loadHandlebarsTemplates() {
  const templatesDir = path.join(process.cwd(), 'templates');

  // 检查基本模板目录是否存在
  if (!fs.existsSync(templatesDir)) {
    throw new Error('Templates directory not found. Cannot proceed without templates.');
  }

  // 加载布局模板
  const layoutsDir = path.join(templatesDir, 'layouts');
  if (fs.existsSync(layoutsDir)) {
    fs.readdirSync(layoutsDir)
      .filter((file) => file.endsWith('.hbs'))
      .sort()
      .forEach((file) => {
        const layoutName = path.basename(file, '.hbs');
        const layoutPath = path.join(layoutsDir, file);
        const layoutContent = fs.readFileSync(layoutPath, 'utf8');
        handlebars.registerPartial(layoutName, layoutContent);
      });
  } else {
    throw new Error('Layouts directory not found. Cannot proceed without layout templates.');
  }

  // 加载组件模板
  const componentsDir = path.join(templatesDir, 'components');
  if (fs.existsSync(componentsDir)) {
    fs.readdirSync(componentsDir)
      .filter((file) => file.endsWith('.hbs'))
      .sort()
      .forEach((file) => {
        const componentName = path.basename(file, '.hbs');
        const componentPath = path.join(componentsDir, file);
        const componentContent = fs.readFileSync(componentPath, 'utf8');
        handlebars.registerPartial(componentName, componentContent);
      });
  } else {
    throw new Error('Components directory not found. Cannot proceed without component templates.');
  }

  // 识别并检查默认布局模板是否存在
  const defaultLayoutPath = path.join(layoutsDir, 'default.hbs');
  if (!fs.existsSync(defaultLayoutPath)) {
    throw new Error('Default layout template not found. Cannot proceed without default layout.');
  }
}

/**
 * 获取默认布局模板
 * @returns {Object} 包含模板路径和编译的模板函数
 */
function getDefaultLayoutTemplate() {
  const defaultLayoutPath = path.join(process.cwd(), 'templates', 'layouts', 'default.hbs');

  // 检查默认布局模板是否存在
  if (!fs.existsSync(defaultLayoutPath)) {
    throw new Error('Default layout template not found. Cannot proceed without default layout.');
  }

  try {
    // 读取布局内容并编译模板
    const layoutContent = fs.readFileSync(defaultLayoutPath, 'utf8');
    const layoutTemplate = handlebars.compile(layoutContent);

    return {
      path: defaultLayoutPath,
      template: layoutTemplate,
    };
  } catch (error) {
    throw new Error(`Error loading default layout template: ${error.message}`);
  }
}

// 渲染Handlebars模板函数
function renderTemplate(templateName, data, useLayout = true) {
  const templatePath = path.join(process.cwd(), 'templates', 'pages', `${templateName}.hbs`);

  // 检查模板是否存在
  if (!fs.existsSync(templatePath)) {
    // 尝试使用通用模板 page.hbs
    const genericTemplatePath = path.join(process.cwd(), 'templates', 'pages', 'page.hbs');

    if (fs.existsSync(genericTemplatePath)) {
      console.log(`模板 ${templateName}.hbs 不存在，使用通用模板 page.hbs 代替`);
      const genericTemplateContent = fs.readFileSync(genericTemplatePath, 'utf8');
      const genericTemplate = handlebars.compile(genericTemplateContent);

      // 添加 pageId 到数据中，以便通用模板使用（优先保留原 pageId，避免回退时语义错位）
      const enhancedData = {
        ...data,
        pageId: data && data.pageId ? data.pageId : templateName,
      };

      // 渲染页面内容
      const pageContent = genericTemplate(enhancedData);

      // 如果不使用布局，直接返回页面内容
      if (!useLayout) {
        return pageContent;
      }

      try {
        // 使用辅助函数获取默认布局模板
        const { template: layoutTemplate } = getDefaultLayoutTemplate();

        // 准备布局数据，包含页面内容
        const layoutData = {
          ...enhancedData,
          body: pageContent,
        };

        // 渲染完整页面
        return layoutTemplate(layoutData);
      } catch (layoutError) {
        throw new Error(`Error rendering layout for ${templateName}: ${layoutError.message}`);
      }
    } else {
      throw new Error(
        `Template ${templateName}.hbs not found and generic template page.hbs not found. Cannot proceed without template.`
      );
    }
  }

  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);

    // 渲染页面内容
    const pageContent = template(data);

    // 如果不使用布局，直接返回页面内容
    if (!useLayout) {
      return pageContent;
    }

    try {
      // 使用辅助函数获取默认布局模板
      const { template: layoutTemplate } = getDefaultLayoutTemplate();

      // 准备布局数据，包含页面内容
      const layoutData = {
        ...data,
        body: pageContent,
      };

      // 渲染完整页面
      return layoutTemplate(layoutData);
    } catch (layoutError) {
      throw new Error(`Error rendering layout for ${templateName}: ${layoutError.message}`);
    }
  } catch (error) {
    throw new Error(`Error rendering template ${templateName}: ${error.message}`);
  }
}

// HTML转义函数，防止XSS攻击
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 统一处理配置文件加载错误
 * @param {string} filePath 配置文件路径
 * @param {Error} error 错误对象
 */
function handleConfigLoadError(filePath, error) {
  console.error(`Error loading configuration from ${filePath}:`, error);
}

/**
 * 安全地加载YAML配置文件
 * @param {string} filePath 配置文件路径
 * @returns {Object|null} 配置对象，如果文件不存在或加载失败则返回null
 */
function safeLoadYamlConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // 使用 loadAll 而不是 load 来支持多文档 YAML 文件
    const docs = yaml.loadAll(fileContent);

    // 如果只有一个文档，直接返回
    if (docs.length === 1) {
      return docs[0];
    }

    // 如果有多个文档，返回第一个文档（忽略后面的文档）
    if (docs.length > 1) {
      console.warn(
        `Warning: Multiple documents found in ${filePath}. Using the first document only.`
      );
      return docs[0];
    }

    return null;
  } catch (error) {
    handleConfigLoadError(filePath, error);
    return null;
  }
}

/**
 * 加载模块化配置目录
 * @param {string} dirPath 配置目录路径
 * @returns {Object|null} 配置对象，如果目录不存在或加载失败则返回null
 */
function loadModularConfig(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const config = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
    categories: [],
  };

  // 加载基础配置
  const siteConfigPath = path.join(dirPath, 'site.yml');
  const siteConfig = safeLoadYamlConfig(siteConfigPath);
  if (siteConfig) {
    // 将site.yml中的内容分配到正确的配置字段
    config.site = siteConfig;

    // 提取特殊字段到顶层配置
    if (siteConfig.fonts) config.fonts = siteConfig.fonts;
    if (siteConfig.profile) config.profile = siteConfig.profile;
    if (siteConfig.social) config.social = siteConfig.social;
    // 图标配置（icons.mode）需要作为顶层字段供模板/运行时读取
    if (siteConfig.icons) config.icons = siteConfig.icons;

    // 优先使用site.yml中的navigation配置
    if (siteConfig.navigation) {
      config.navigation = siteConfig.navigation;
      console.log('使用 site.yml 中的导航配置');
    }
  }

  // 加载页面配置
  const pagesPath = path.join(dirPath, 'pages');
  if (fs.existsSync(pagesPath)) {
    const files = fs
      .readdirSync(pagesPath)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

    files.forEach((file) => {
      const filePath = path.join(pagesPath, file);
      const fileConfig = safeLoadYamlConfig(filePath);

      if (fileConfig) {
        // 提取文件名（不含扩展名）作为配置键
        const configKey = path.basename(file, path.extname(file));

        // 将页面配置添加到主配置对象
        config[configKey] = fileConfig;
      }
    });
  }

  return config;
}

/**
 * 确保配置对象具有必要的默认值
 * @param {Object} config 配置对象
 * @returns {Object} 处理后的配置对象
 */
function ensureConfigDefaults(config) {
  // 创建一个新对象，避免修改原始配置
  const result = { ...config };

  // 确保基本结构存在
  result.site = result.site || {};
  result.navigation = result.navigation || [];

  // 字体默认值（单一字体配置）
  result.fonts = result.fonts && typeof result.fonts === 'object' ? result.fonts : {};
  result.fonts.source = result.fonts.source || 'css';
  result.fonts.family = result.fonts.family || 'LXGW WenKai';
  result.fonts.weight = result.fonts.weight || 'normal';
  result.fonts.cssUrl = result.fonts.cssUrl || 'https://fontsapi.zeoseven.com/292/main/result.css';

  result.profile = result.profile || {};
  result.social = result.social || [];
  // 图标配置默认值
  result.icons = result.icons || {};
  // icons.mode: manual | favicon, 默认 favicon
  result.icons.mode = result.icons.mode || 'favicon';
  // icons.region: com | cn, 默认 com（优先使用 gstatic.com，失败后回退到 gstatic.cn）
  result.icons.region = result.icons.region || 'com';

  // 站点基本信息默认值
  result.site.title = result.site.title || 'MeNav导航';
  result.site.description = result.site.description || '个人网络导航站';
  result.site.author = result.site.author || 'MeNav User';
  result.site.logo_text = result.site.logo_text || '导航站';
  result.site.favicon = result.site.favicon || 'menav.svg';
  result.site.logo = result.site.logo || null;
  result.site.footer = result.site.footer || '';
  result.site.theme = result.site.theme || {
    primary: '#4a89dc',
    background: '#f5f7fa',
    modeToggle: true,
  };

  // 用户资料默认值
  result.profile = result.profile || {};
  result.profile.title = result.profile.title || '欢迎使用';
  result.profile.subtitle = result.profile.subtitle || 'MeNav个人导航系统';

  // 处理站点默认值的辅助函数
  function processSiteDefaults(site) {
    site.name = site.name || '未命名站点';
    site.url = site.url || '#';
    site.description = site.description || '';
    site.icon = site.icon || 'fas fa-link';
    site.external = typeof site.external === 'boolean' ? site.external : true;
  }

  // 递归处理多级结构（categories/subcategories/groups/subgroups）下的 sites 默认值
  function processNodeSitesRecursively(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node.sites)) {
      node.sites.forEach(processSiteDefaults);
    }

    if (Array.isArray(node.subcategories)) node.subcategories.forEach(processNodeSitesRecursively);
    if (Array.isArray(node.groups)) node.groups.forEach(processNodeSitesRecursively);
    if (Array.isArray(node.subgroups)) node.subgroups.forEach(processNodeSitesRecursively);
  }

  // 处理分类默认值的辅助函数
  function processCategoryDefaults(category) {
    category.name = category.name || '未命名分类';
    category.sites = category.sites || [];
    processNodeSitesRecursively(category);
  }

  // 为所有页面配置中的类别和站点设置默认值
  Object.keys(result).forEach((key) => {
    const pageConfig = result[key];
    // 检查是否是页面配置对象
    if (!pageConfig || typeof pageConfig !== 'object') return;

    // 传统结构：categories -> sites
    if (Array.isArray(pageConfig.categories)) {
      pageConfig.categories.forEach(processCategoryDefaults);
    }

    // 扁平结构：sites（用于 friends/articles 等“无层级并列卡片”页面）
    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach(processSiteDefaults);
    }
  });

  return result;
}

/**
 * 验证配置是否有效
 * @param {Object} config 配置对象
 * @returns {boolean} 配置是否有效
 */
function validateConfig(config) {
  // 基本结构检查
  if (!config || typeof config !== 'object') {
    console.error('配置无效: 配置必须是一个对象');
    return false;
  }

  // 所有其他验证被移除，因为它们只是检查但没有实际操作
  // 配置默认值和数据修复已经在ensureConfigDefaults函数中处理

  return true;
}

/**
 * 获取导航项的子菜单数据
 * @param {Object} navItem 导航项对象
 * @param {Object} config 配置对象
 * @returns {Array|null} 子菜单数据数组或null
 */
function getSubmenuForNavItem(navItem, config) {
  if (!navItem || !navItem.id || !config) {
    return null;
  }

  // 通用处理：任意页面的子菜单生成（基于 pages/<id>.yml 的 categories）
  if (config[navItem.id] && Array.isArray(config[navItem.id].categories))
    return config[navItem.id].categories;

  return null;
}

function makeCategorySlugBase(name) {
  const raw = typeof name === 'string' ? name : String(name ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return 'category';

  // 规则：尽量可读、跨平台稳定；保留字母/数字/下划线/短横线，其它字符替换为短横线
  // 注意：分类名允许中文等非 ASCII 字符，Node 18+ 支持 Unicode 属性类
  const normalized = trimmed
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'category';
}

function makeUniqueSlug(base, usedSlugs) {
  const current = usedSlugs.get(base) || 0;
  const next = current + 1;
  usedSlugs.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

function assignCategorySlugs(categories, usedSlugs) {
  if (!Array.isArray(categories)) return;

  categories.forEach((category) => {
    if (!category || typeof category !== 'object') return;

    const base = makeCategorySlugBase(category.name);
    const uniqueSlug = makeUniqueSlug(base, usedSlugs);
    category.slug = uniqueSlug;

    if (Array.isArray(category.subcategories)) {
      assignCategorySlugs(category.subcategories, usedSlugs);
    }
  });
}

/**
 * 将 JSON 字符串安全嵌入到 <script> 中，避免出现 `</script>` 结束标签导致脚本块被提前终止。
 * 说明：返回值仍是合法 JSON，JSON.parse 后数据不变。
 * @param {string} jsonString JSON 字符串
 * @returns {string} 安全的 JSON 字符串
 */
function makeJsonSafeForHtmlScript(jsonString) {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(/<\/script/gi, '<\\/script');
}

/**
 * 解析页面配置文件路径（优先 user，回退 _default）
 * 注意：仅用于构建期读取文件元信息，不会把路径注入到页面/扩展配置中。
 * @param {string} pageId 页面ID（与 pages/<id>.yml 文件名对应）
 * @returns {string|null} 文件路径或 null
 */
function resolvePageConfigFilePath(pageId) {
  if (!pageId) return null;

  const candidates = [
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yaml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yaml`),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch (e) {
      // 忽略 IO 异常，继续尝试下一个候选
    }
  }

  return null;
}

/**
 * 尝试获取文件最后一次 git 提交时间（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetGitLastCommitIso(filePath) {
  if (!filePath) return null;

  try {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const output = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const raw = String(output || '').trim();
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 获取文件 mtime（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetFileMtimeIso(filePath) {
  if (!filePath) return null;

  try {
    const stats = fs.statSync(filePath);
    const mtime = stats && stats.mtime ? stats.mtime : null;
    if (!(mtime instanceof Date) || Number.isNaN(mtime.getTime())) return null;
    return mtime.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 计算页面配置文件“内容更新时间”（优先 git，回退 mtime）
 * @param {string} pageId 页面ID
 * @returns {{updatedAt: string, updatedAtSource: 'git'|'mtime'}|null}
 */
function getPageConfigUpdatedAtMeta(pageId) {
  const filePath = resolvePageConfigFilePath(pageId);
  if (!filePath) return null;

  const gitIso = tryGetGitLastCommitIso(filePath);
  if (gitIso) {
    return { updatedAt: gitIso, updatedAtSource: 'git' };
  }

  const mtimeIso = tryGetFileMtimeIso(filePath);
  if (mtimeIso) {
    return { updatedAt: mtimeIso, updatedAtSource: 'mtime' };
  }

  return null;
}

/**
 * 读取 articles 页面 RSS 缓存（Phase 2）
 * - 缓存默认放在 dev/（仓库默认 gitignore）
 * - 构建端只读缓存：缓存缺失/损坏时回退到 Phase 1（渲染来源站点分类）
 * @param {string} pageId 页面ID（用于支持多个 articles 页面的独立缓存）
 * @param {Object} config 全站配置（用于读取 site.rss.cacheDir）
 * @returns {{items: Array<Object>, meta: Object}|null}
 */
function tryLoadArticlesFeedCache(pageId, config) {
  if (!pageId) return null;

  const cacheDirFromEnv = process.env.RSS_CACHE_DIR ? String(process.env.RSS_CACHE_DIR) : '';
  const cacheDirFromConfig =
    config && config.site && config.site.rss && config.site.rss.cacheDir
      ? String(config.site.rss.cacheDir)
      : '';
  const cacheDir = cacheDirFromEnv || cacheDirFromConfig || 'dev';

  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  const cachePath = path.join(cacheBaseDir, `${pageId}.feed-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
    const items = articles
      .map((a) => {
        const title = a && a.title ? String(a.title) : '';
        const url = a && a.url ? String(a.url) : '';
        if (!title || !url) return null;

        return {
          // 兼容 site-card partial 字段
          name: title,
          url,
          icon: a && a.icon ? String(a.icon) : 'fas fa-pen',
          description: a && a.summary ? String(a.summary) : '',

          // Phase 2 文章元信息（只读展示）
          publishedAt: a && a.publishedAt ? String(a.publishedAt) : '',
          source: a && a.source ? String(a.source) : '',
          // 文章来源站点首页 URL（用于按分类聚合展示；旧缓存可能缺失）
          sourceUrl: a && a.sourceUrl ? String(a.sourceUrl) : '',

          // 文章链接通常应在新标签页打开
          external: true,
        };
      })
      .filter(Boolean);

    return {
      items,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
        total:
          parsed.stats && Number.isFinite(parsed.stats.totalArticles)
            ? parsed.stats.totalArticles
            : items.length,
      },
    };
  } catch (e) {
    console.warn(`[WARN] articles 缓存读取失败：${cachePath}（将回退 Phase 1）`);
    return null;
  }
}

function normalizeUrlKey(input) {
  if (!input) return '';
  try {
    const u = new URL(String(input));
    const origin = u.origin;
    let pathname = u.pathname || '/';
    // 统一去掉末尾斜杠（根路径除外），避免 https://a.com 与 https://a.com/ 不匹配
    if (pathname !== '/' && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    return `${origin}${pathname}`;
  } catch {
    return String(input).trim();
  }
}

function collectSitesRecursively(node, output) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node.subcategories))
    node.subcategories.forEach((child) => collectSitesRecursively(child, output));
  if (Array.isArray(node.groups))
    node.groups.forEach((child) => collectSitesRecursively(child, output));
  if (Array.isArray(node.subgroups))
    node.subgroups.forEach((child) => collectSitesRecursively(child, output));

  if (Array.isArray(node.sites)) {
    node.sites.forEach((site) => {
      if (site && typeof site === 'object') output.push(site);
    });
  }
}

/**
 * articles Phase 2：按页面配置的“分类”聚合文章展示
 * - 规则：某篇文章的 sourceUrl/source 归属到其来源站点（pages/articles.yml 中配置的站点）所在的分类
 * - 兼容：旧缓存缺少 sourceUrl 时回退使用 source（站点名称）匹配
 * @param {Array<Object>} categories 页面配置 categories（可包含更深层级）
 * @param {Array<Object>} articlesItems Phase 2 文章条目（来自缓存）
 * @returns {Array<{name: string, icon: string, items: Array<Object>}>}
 */
function buildArticlesCategoriesByPageCategories(categories, articlesItems) {
  const safeItems = Array.isArray(articlesItems) ? articlesItems : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  // 若页面未配置分类，则回退为单一分类容器
  if (safeCategories.length === 0) {
    return [
      {
        name: '最新文章',
        icon: 'fas fa-rss',
        items: safeItems,
      },
    ];
  }

  const categoryIndex = safeCategories.map((category) => {
    const sites = [];
    collectSitesRecursively(category, sites);

    const siteUrlKeys = new Set();
    const siteNameKeys = new Set();
    sites.forEach((site) => {
      const urlKey = normalizeUrlKey(site && site.url ? String(site.url) : '');
      if (urlKey) siteUrlKeys.add(urlKey);
      const nameKey = site && site.name ? String(site.name).trim().toLowerCase() : '';
      if (nameKey) siteNameKeys.add(nameKey);
    });

    return { category, siteUrlKeys, siteNameKeys };
  });

  const buckets = categoryIndex.map(() => []);
  const uncategorized = [];

  safeItems.forEach((item) => {
    const sourceUrlKey = normalizeUrlKey(item && item.sourceUrl ? String(item.sourceUrl) : '');
    const sourceNameKey = item && item.source ? String(item.source).trim().toLowerCase() : '';

    let matchedIndex = -1;
    if (sourceUrlKey) {
      matchedIndex = categoryIndex.findIndex((idx) => idx.siteUrlKeys.has(sourceUrlKey));
    }
    if (matchedIndex < 0 && sourceNameKey) {
      matchedIndex = categoryIndex.findIndex((idx) => idx.siteNameKeys.has(sourceNameKey));
    }

    if (matchedIndex < 0) {
      uncategorized.push(item);
      return;
    }

    buckets[matchedIndex].push(item);
  });

  const displayCategories = categoryIndex.map((idx, i) => ({
    name: idx.category && idx.category.name ? String(idx.category.name) : '未命名分类',
    icon: idx.category && idx.category.icon ? String(idx.category.icon) : 'fas fa-rss',
    items: buckets[i],
  }));

  if (uncategorized.length > 0) {
    displayCategories.push({
      name: '其他',
      icon: 'fas fa-ellipsis-h',
      items: uncategorized,
    });
  }

  return displayCategories;
}

function tryLoadProjectsRepoCache(pageId, config) {
  if (!pageId) return null;

  const cacheDirFromEnv = process.env.PROJECTS_CACHE_DIR
    ? String(process.env.PROJECTS_CACHE_DIR)
    : '';
  const cacheDirFromConfig =
    config && config.site && config.site.github && config.site.github.cacheDir
      ? String(config.site.github.cacheDir)
      : '';
  const cacheDir = cacheDirFromEnv || cacheDirFromConfig || 'dev';

  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  const cachePath = path.join(cacheBaseDir, `${pageId}.repo-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const repos = Array.isArray(parsed.repos) ? parsed.repos : [];
    const map = new Map();
    repos.forEach((r) => {
      const url = r && r.url ? String(r.url) : '';
      if (!url) return;
      map.set(url, {
        language: r && r.language ? String(r.language) : '',
        languageColor: r && r.languageColor ? String(r.languageColor) : '',
        stars: Number.isFinite(r && r.stars) ? r.stars : null,
        forks: Number.isFinite(r && r.forks) ? r.forks : null,
      });
    });

    return {
      map,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
      },
    };
  } catch (e) {
    console.warn(`[WARN] projects 缓存读取失败：${cachePath}（将仅展示标题与描述）`);
    return null;
  }
}

function normalizeGithubRepoUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url));
    if (u.hostname.toLowerCase() !== 'github.com') return '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return '';
    return `https://github.com/${owner}/${repo}`;
  } catch {
    return '';
  }
}

function applyRepoMetaToCategories(categories, repoMetaMap) {
  if (!Array.isArray(categories) || !(repoMetaMap instanceof Map)) return;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.subcategories)) node.subcategories.forEach(walk);
    if (Array.isArray(node.groups)) node.groups.forEach(walk);
    if (Array.isArray(node.subgroups)) node.subgroups.forEach(walk);

    if (Array.isArray(node.sites)) {
      node.sites.forEach((site) => {
        if (!site || typeof site !== 'object' || !site.url) return;
        const canonical = normalizeGithubRepoUrl(site.url);
        if (!canonical) return;
        const meta = repoMetaMap.get(canonical);
        if (!meta) return;

        site.language = meta.language || '';
        site.languageColor = meta.languageColor || '';
        site.stars = meta.stars;
        site.forks = meta.forks;
      });
    }
  };

  categories.forEach(walk);
}

/**
 * 计算页面实际使用的模板名（与 renderPage 的规则保持一致）
 * @param {string} pageId 页面ID
 * @param {Object} config 已标准化的配置（prepareRenderData 的 renderData）
 * @returns {string} 模板名
 */
function resolveTemplateNameForPage(pageId, config) {
  if (!pageId) return 'page';

  const pageConfig = config && config[pageId] ? config[pageId] : null;
  const explicitTemplate =
    pageConfig && typeof pageConfig.template === 'string' ? pageConfig.template.trim() : '';
  if (explicitTemplate) return explicitTemplate;

  const inferredTemplatePath = path.join(process.cwd(), 'templates', 'pages', `${pageId}.hbs`);
  if (fs.existsSync(inferredTemplatePath)) return pageId;

  return 'page';
}

/**
 * 构建“扩展专用配置”（避免把整站配置/书签数据注入到 index.html）
 * - 页面内仅注入必要元信息（版本/配置 URL/少量运行时参数）
 * - 扩展如需更多信息，可按需请求 dist/menav-config.json
 * @param {Object} renderData prepareRenderData 生成的渲染数据
 * @returns {Object} 扩展配置对象（可直接 JSON.stringify 输出到文件）
 */
function buildExtensionConfig(renderData) {
  const version =
    (renderData && renderData._meta && renderData._meta.version) ||
    process.env.npm_package_version ||
    '1.0.0';

  const pageTemplates = {};
  if (Array.isArray(renderData && renderData.navigation)) {
    renderData.navigation.forEach((navItem) => {
      const pageId = navItem && navItem.id ? String(navItem.id).trim() : '';
      if (!pageId) return;
      pageTemplates[pageId] = resolveTemplateNameForPage(pageId, renderData);
    });
  }

  const allowedSchemes =
    renderData &&
    renderData.site &&
    renderData.site.security &&
    Array.isArray(renderData.site.security.allowedSchemes)
      ? renderData.site.security.allowedSchemes
      : null;

  return {
    version,
    timestamp: new Date().toISOString(),
    icons: renderData && renderData.icons ? renderData.icons : undefined,
    data: {
      homePageId: renderData && renderData.homePageId ? renderData.homePageId : null,
      pageTemplates,
      site: allowedSchemes ? { security: { allowedSchemes } } : undefined,
    },
  };
}

/**
 * 准备渲染数据，添加模板所需的特殊属性
 * @param {Object} config 配置对象
 * @returns {Object} 增强的渲染数据
 */
function prepareRenderData(config) {
  // 创建渲染数据对象，包含原始配置
  const renderData = { ...config };

  // 添加额外渲染数据
  renderData._meta = {
    generated_at: new Date(),
    version: process.env.npm_package_version || '1.0.0',
    generator: 'MeNav',
  };

  // 确保navigation是数组
  if (!Array.isArray(renderData.navigation)) {
    renderData.navigation = [];
    // 移除警告日志，数据处理逻辑保留
  }

  // 添加导航项的活动状态标记和子菜单
  if (Array.isArray(renderData.navigation)) {
    renderData.navigation = renderData.navigation.map((item, index) => {
      const navItem = {
        ...item,
        isActive: index === 0, // 默认第一项为活动项
        id: item.id || `nav-${index}`,
        active: index === 0, // 保持旧模板兼容（由顺序决定，不读取配置的 active 字段）
      };

      // 使用辅助函数获取子菜单
      const submenu = getSubmenuForNavItem(navItem, renderData);
      if (submenu) {
        navItem.submenu = submenu;
      }

      return navItem;
    });
  }

  // 首页（默认页）规则：navigation 顺序第一项即首页
  renderData.homePageId =
    renderData.navigation && renderData.navigation[0] ? renderData.navigation[0].id : null;

  // 为每个页面的分类生成稳定锚点 slug（解决重名/空格/特殊字符导致的 hash 冲突）
  if (Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem) => {
      const pageConfig = renderData[navItem.id];
      if (pageConfig && Array.isArray(pageConfig.categories)) {
        assignCategorySlugs(pageConfig.categories, new Map());
      }
    });
  }

  // P1-7：避免把整站配置（尤其 pages/categories/sites）注入到 index.html，减少体积并明确前端暴露边界
  // - dist/menav-config.json：扩展专用配置（按需加载）
  // - menav-config-data：仅注入必要元信息（版本/配置 URL/少量运行时参数）
  const extensionConfig = buildExtensionConfig(renderData);
  renderData.extensionConfig = extensionConfig;
  renderData.extensionConfigUrl = `./${MENAV_EXTENSION_CONFIG_FILE}`;
  renderData.configJSON = makeJsonSafeForHtmlScript(
    JSON.stringify({
      ...extensionConfig,
      configUrl: renderData.extensionConfigUrl,
    })
  );

  // 为Handlebars模板特别准备navigationData数组
  renderData.navigationData = renderData.navigation;

  // 确保social数据格式正确
  if (Array.isArray(renderData.social)) {
    renderData.socialLinks = renderData.social; // 兼容模板中的不同引用名
  }

  return renderData;
}

// 读取配置文件
function loadConfig() {
  // 初始化空配置对象
  let config = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
  };

  // 检查模块化配置来源是否存在
  const hasUserModularConfig = fs.existsSync('config/user');
  const hasDefaultModularConfig = fs.existsSync('config/_default');

  // 根据优先级顺序选择最高优先级的配置
  if (hasUserModularConfig) {
    // 配置采用“完全替换”策略：一旦存在 config/user/，将不会回退到 config/_default/
    if (!fs.existsSync('config/user/site.yml')) {
      console.error('[ERROR] 检测到 config/user/ 目录，但缺少 config/user/site.yml。');
      console.error(
        '[ERROR] 由于配置采用“完全替换”策略，系统不会从 config/_default/ 补齐缺失配置。'
      );
      console.error('[ERROR] 解决方法：先完整复制 config/_default/ 到 config/user/，再按需修改。');
      process.exit(1);
    }

    if (!fs.existsSync('config/user/pages')) {
      console.warn(
        '[WARN] 检测到 config/user/ 目录，但缺少 config/user/pages/。部分页面内容可能为空。'
      );
      console.warn('[WARN] 建议：复制 config/_default/pages/ 到 config/user/pages/，再按需修改。');
    }

    // 1. 最高优先级: config/user/ 目录
    config = loadModularConfig('config/user');
  } else if (hasDefaultModularConfig) {
    // 2. 次高优先级: config/_default/ 目录
    config = loadModularConfig('config/_default');
  } else {
    console.error('[ERROR] 未找到可用配置：缺少 config/user/ 或 config/_default/。');
    console.error('[ERROR] 本版本已不再支持旧版单文件配置（config.yml / config.yaml）。');
    console.error(
      '[ERROR] 解决方法：使用模块化配置目录（建议从 config/_default/ 复制到 config/user/ 再修改）。'
    );
    process.exit(1);
  }

  // 确保配置有默认值并通过验证
  config = ensureConfigDefaults(config);

  if (!validateConfig(config)) {
    // 移除警告日志，保留函数调用
  }

  // 准备渲染数据
  const renderData = prepareRenderData(config);

  return renderData;
}

// 生成导航菜单
function generateNavigation(navigation, config) {
  return navigation
    .map((nav) => {
      // 根据页面ID获取对应的子菜单项（分类）
      let submenuItems = '';

      // 使用辅助函数获取子菜单数据
      const submenu = getSubmenuForNavItem(nav, config);

      // 如果存在子菜单，生成HTML
      if (submenu && Array.isArray(submenu)) {
        submenuItems = `
                <div class="submenu">
                    ${submenu
                      .map(
                        (category) => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `
                      )
                      .join('')}
                </div>`;
      }

      return `
                <div class="nav-item-wrapper">
                    <a href="#" class="nav-item${nav.active ? ' active' : ''}" data-page="${escapeHtml(nav.id)}">
                        <div class="icon-container">
                            <i class="${escapeHtml(nav.icon)}"></i>
                        </div>
                        <span class="nav-text">${escapeHtml(nav.name)}</span>
                        ${submenuItems ? '<i class="fas fa-chevron-down submenu-toggle"></i>' : ''}
                    </a>
                    ${submenuItems}
                </div>`;
    })
    .join('\n');
}

// 生成网站卡片HTML
function generateSiteCards(sites) {
  if (!sites || !Array.isArray(sites) || sites.length === 0) {
    return `<p class="empty-sites">暂无网站</p>`;
  }

  return sites
    .map(
      (site) => `
                        <a href="${escapeHtml(site.url)}" class="site-card" title="${escapeHtml(site.name)} - ${escapeHtml(site.description || '')}">
                            <i class="${escapeHtml(site.icon || 'fas fa-link')}"></i>
                            <h3>${escapeHtml(site.name || '未命名站点')}</h3>
                            <p>${escapeHtml(site.description || '')}</p>
                        </a>`
    )
    .join('\n');
}

// 生成分类板块
function generateCategories(categories) {
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return `
                <section class="category">
                    <h2><i class="fas fa-info-circle"></i> 暂无分类</h2>
                    <p>请在配置文件中添加分类</p>
                </section>`;
  }

  return categories
    .map(
      (category) => `
                <section class="category" id="${escapeHtml(category.name)}">
                    <h2><i class="${escapeHtml(category.icon)}"></i> ${escapeHtml(category.name)}</h2>
                    <div class="sites-grid">
                        ${generateSiteCards(category.sites)}
                    </div>
                </section>`
    )
    .join('\n');
}

// 生成社交链接HTML
function generateSocialLinks(social) {
  if (!social || !Array.isArray(social) || social.length === 0) {
    return '';
  }

  // 尝试使用Handlebars模板
  try {
    const socialLinksPath = path.join(process.cwd(), 'templates', 'components', 'social-links.hbs');
    if (fs.existsSync(socialLinksPath)) {
      const templateContent = fs.readFileSync(socialLinksPath, 'utf8');
      const template = handlebars.compile(templateContent);
      // 确保数据格式正确
      return template(social); // 社交链接模板直接接收数组
    }
  } catch (error) {
    console.error('Error rendering social-links template:', error);
    // 出错时回退到原始生成方法
  }

  // 回退到原始生成方法
  return social
    .map(
      (link) => `
                    <a href="${escapeHtml(link.url)}" class="social-icon" target="_blank" rel="noopener" title="${escapeHtml(link.name || '社交链接')}" aria-label="${escapeHtml(link.name || '社交链接')}" data-type="social-link" data-name="${escapeHtml(link.name || '社交链接')}" data-url="${escapeHtml(link.url)}" data-icon="${escapeHtml(link.icon || 'fas fa-link')}">
                        <i class="${escapeHtml(link.icon || 'fas fa-link')}" aria-hidden="true"></i>
                        <span class="nav-text visually-hidden" data-editable="social-link-name">${escapeHtml(link.name || '社交链接')}</span>
                    </a>`
    )
    .join('\n');
}

// 生成页面内容（包括首页和其他页面）
function generatePageContent(pageId, data) {
  // 确保数据对象存在
  if (!data) {
    console.error(`Missing data for page: ${pageId}`);
    return `
                <div class="welcome-section">
                    <div class="welcome-section-main">
                        <h2>页面未配置</h2>
                        <p class="subtitle">请配置 ${pageId} 页面</p>
                    </div>
                </div>`;
  }

  // 首页使用profile数据，其他页面使用自身数据
  if (pageId === 'home') {
    const profile = data.profile || {};

    return `
                <div class="welcome-section">
                    <div class="welcome-section-main">
                        <h2>${escapeHtml(profile.title || '欢迎使用')}</h2>
                        <h3>${escapeHtml(profile.subtitle || '个人导航站')}</h3>
                    </div>
                </div>
${generateCategories(data.categories)}`;
  } else {
    // 其他页面使用通用结构
    const title = data.title || `${pageId} 页面`;
    const subtitle = data.subtitle || '';
    const categories = data.categories || [];

    return `
                <div class="welcome-section">
                    <div class="welcome-section-main">
                        <h2>${escapeHtml(title)}</h2>
                        <p class="subtitle">${escapeHtml(subtitle)}</p>
                    </div>
                </div>
                ${generateCategories(categories)}`;
  }
}

// 生成搜索结果页面
function generateSearchResultsPage(config) {
  // 获取所有导航页面ID
  const pageIds = config.navigation.map((nav) => nav.id);

  // 生成所有页面的搜索结果区域
  const searchSections = pageIds
    .map((pageId) => {
      // 根据页面ID获取对应的图标和名称
      const navItem = config.navigation.find((nav) => nav.id === pageId);
      const icon = navItem ? navItem.icon : 'fas fa-file';
      const name = navItem ? navItem.name : pageId;

      return `
                <section class="category search-section" data-section="${escapeHtml(pageId)}" style="display: none;">
                    <h2><i class="${escapeHtml(icon)}"></i> ${escapeHtml(name)}匹配项</h2>
                    <div class="sites-grid"></div>
                </section>`;
    })
    .join('\n');

  return `
            <!-- 搜索结果页 -->
            <div class="page" id="search-results">
                <div class="welcome-section">
                    <div class="welcome-section-main">
                        <h2>搜索结果</h2>
                        <p class="subtitle">在所有页面中找到的匹配项</p>
                    </div>
                </div>
${searchSections}
            </div>`;
}

/**
 * 将 CSS 文本安全嵌入到 <style> 中，避免出现 `</style>` 结束标签导致样式块被提前终止。
 * @param {string} cssText CSS 文本
 * @returns {string} 安全的 CSS 文本
 */
function makeCssSafeForHtmlStyleTag(cssText) {
  if (typeof cssText !== 'string') {
    return '';
  }

  return cssText.replace(/<\/style/gi, '<\\/style');
}

function normalizeFontWeight(input) {
  if (input === undefined || input === null) return 'normal';

  if (typeof input === 'number' && Number.isFinite(input)) {
    return String(input);
  }

  const raw = String(input).trim();
  if (!raw) return 'normal';

  if (/^(normal|bold|bolder|lighter)$/i.test(raw)) return raw.toLowerCase();
  if (/^[1-9]00$/.test(raw)) return raw;

  return raw;
}

function normalizeFontFamilyForCss(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const generics = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
  ]);

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const unquoted = part.replace(/^['"]|['"]$/g, '').trim();
      if (!unquoted) return '';
      if (generics.has(unquoted)) return unquoted;

      const needsQuotes = /\s/.test(unquoted);
      if (!needsQuotes) return unquoted;

      return `"${unquoted.replace(/"/g, '\\"')}"`;
    })
    .filter(Boolean)
    .join(', ');
}

function normalizeFontSource(input) {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (raw === 'css' || raw === 'google' || raw === 'system') return raw;
  return 'system';
}

function getNormalizedFontsConfig(config) {
  const fonts = config && config.fonts && typeof config.fonts === 'object' ? config.fonts : {};

  return {
    source: normalizeFontSource(fonts.source),
    family: normalizeFontFamilyForCss(fonts.family),
    weight: normalizeFontWeight(fonts.weight),
    cssUrl: String(fonts.cssUrl || fonts.href || '').trim(),
    preload: Boolean(fonts.preload),
  };
}

function tryGetUrlOrigin(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

function buildStylesheetLinkTag(href, preload) {
  const safeHref = escapeHtml(href);
  if (!preload) return `<link rel="stylesheet" href="${safeHref}">`;

  return [
    `<link rel="preload" href="${safeHref}" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    `<noscript><link rel="stylesheet" href="${safeHref}"></noscript>`,
  ].join('\n');
}

// 生成字体相关 <link>
function generateFontLinks(config) {
  const fonts = getNormalizedFontsConfig(config);
  const links = [];

  // 全站基础字体：按配置加载
  if (fonts.source === 'css' && fonts.cssUrl) {
    const origin = tryGetUrlOrigin(fonts.cssUrl);
    if (origin) {
      links.push(`<link rel="preconnect" href="${escapeHtml(origin)}" crossorigin>`);
    }
    links.push(buildStylesheetLinkTag(fonts.cssUrl, fonts.preload));
  }

  if (fonts.source === 'google' && fonts.family) {
    links.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    links.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');

    const familyNoQuotes = fonts.family.replace(/["']/g, '').split(',')[0].trim();
    const weight = /^[1-9]00$/.test(fonts.weight) ? fonts.weight : '400';
    const familyParam = encodeURIComponent(familyNoQuotes).replace(/%20/g, '+');
    links.push(
      buildStylesheetLinkTag(
        `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weight}&display=swap`,
        fonts.preload
      )
    );
  }

  return links.join('\n');
}

// 生成字体 CSS 变量（单一字体配置）
function generateFontCss(config) {
  const fonts = getNormalizedFontsConfig(config);
  const family = fonts.family || 'system-ui, sans-serif';
  const weight = fonts.weight || 'normal';

  const css = `:root {\n  --font-body: ${family};\n  --font-weight-body: ${weight};\n}\n`;
  return makeCssSafeForHtmlStyleTag(css);
}

function normalizeGithubHeatmapColor(input) {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  const color = raw.toLowerCase();
  if (/^[0-9a-f]{6}$/.test(color)) return color;
  if (/^[0-9a-f]{3}$/.test(color)) return color;
  return '339af0';
}

function getGithubUsernameFromConfig(config) {
  const username =
    config && config.site && config.site.github && config.site.github.username
      ? String(config.site.github.username).trim()
      : '';
  return username;
}

function buildProjectsMeta(config) {
  const username = getGithubUsernameFromConfig(config);
  if (!username) return null;

  const color = normalizeGithubHeatmapColor(
    config && config.site && config.site.github && config.site.github.heatmapColor
      ? config.site.github.heatmapColor
      : '339af0'
  );

  return {
    heatmap: {
      username,
      profileUrl: `https://github.com/${username}`,
      imageUrl: `https://ghchart.rshah.org/${color}/${username}`,
    },
  };
}

/**
 * 渲染单个页面
 * @param {string} pageId 页面ID
 * @param {Object} config 配置数据
 * @returns {string} 渲染后的HTML
 */
function renderPage(pageId, config) {
  // 准备页面数据
  const data = {
    ...(config || {}),
    currentPage: pageId,
    pageId, // 同时保留pageId字段，用于通用模板
  };

  // 确保navigation是数组
  if (!Array.isArray(config.navigation)) {
    console.warn('Warning: config.navigation is not an array in renderPage. Using empty array.');
    data.navigation = [];
  } else {
    // 设置当前页面为活动页，其他页面为非活动
    data.navigation = config.navigation.map((nav) => {
      const navItem = {
        ...nav,
        isActive: nav.id === pageId,
        active: nav.id === pageId, // 兼容原有逻辑
      };

      // 使用辅助函数获取子菜单
      const submenu = getSubmenuForNavItem(navItem, config);
      if (submenu) {
        navItem.submenu = submenu;
      }

      return navItem;
    });
  }

  // 确保socialLinks字段存在
  data.socialLinks = Array.isArray(config.social) ? config.social : [];

  // 确保navigationData可用（针对模板使用）
  data.navigationData = data.navigation;

  // 页面特定的额外数据
  if (config[pageId]) {
    // 使用已经经过ensureConfigDefaults处理的配置数据
    Object.assign(data, config[pageId]);
  }

  // 页面配置缺失时也尽量给出可用的默认值，避免渲染空标题/undefined
  if (data.title === undefined) {
    const navItem = Array.isArray(config.navigation)
      ? config.navigation.find((nav) => nav.id === pageId)
      : null;
    if (navItem && navItem.name !== undefined) data.title = navItem.name;
  }
  if (data.subtitle === undefined) data.subtitle = '';
  if (!Array.isArray(data.categories)) data.categories = [];

  // 检查页面配置中是否指定了模板（用于派生字段与渲染）
  const explicitTemplate = typeof data.template === 'string' ? data.template.trim() : '';
  let templateName = explicitTemplate || pageId;
  // 未显式指定模板时：若 pages/<pageId>.hbs 不存在，则默认使用通用 page 模板（避免依赖回退日志）
  if (!explicitTemplate) {
    const inferredTemplatePath = path.join(
      process.cwd(),
      'templates',
      'pages',
      `${templateName}.hbs`
    );
    if (!fs.existsSync(inferredTemplatePath)) {
      templateName = 'page';
    }
  }

  // 页面级卡片风格开关（用于差异化）
  if (templateName === 'projects') {
    data.siteCardStyle = 'repo';
    data.projectsMeta = buildProjectsMeta(config);
    if (Array.isArray(data.categories)) {
      const repoCache = tryLoadProjectsRepoCache(pageId, config);
      if (repoCache && repoCache.map) {
        applyRepoMetaToCategories(data.categories, repoCache.map);
      }
    }
  }

  // friends/articles：允许顶层 sites（历史/兼容），自动转换为一个分类容器以保持页面结构一致
  // 注意：模板名可能被统一为 page（例如 friends/home 取消专属模板后），因此这里同时按 pageId 判断。
  const isFriendsPage = pageId === 'friends' || templateName === 'friends';
  const isArticlesPage = pageId === 'articles' || templateName === 'articles';
  if (
    (isFriendsPage || isArticlesPage) &&
    (!Array.isArray(data.categories) || data.categories.length === 0) &&
    Array.isArray(data.sites) &&
    data.sites.length > 0
  ) {
    const implicitName = isFriendsPage ? '全部友链' : '全部来源';
    data.categories = [
      {
        name: implicitName,
        icon: 'fas fa-link',
        sites: data.sites,
      },
    ];
  }

  // articles 模板页面：Phase 2 若存在 RSS 缓存，则注入 articlesItems（缓存缺失/损坏则回退 Phase 1）
  if (templateName === 'articles') {
    const cache = tryLoadArticlesFeedCache(pageId, config);
    data.articlesItems = cache && Array.isArray(cache.items) ? cache.items : [];
    data.articlesMeta = cache ? cache.meta : null;
    // Phase 2：按页面配置分类聚合展示（用于模板渲染只读文章列表）
    data.articlesCategories = data.articlesItems.length
      ? buildArticlesCategoriesByPageCategories(data.categories, data.articlesItems)
      : [];
  }

  // bookmarks 模板页面：注入配置文件“内容更新时间”（优先 git，回退 mtime）
  if (templateName === 'bookmarks') {
    const updatedAtMeta = getPageConfigUpdatedAtMeta(pageId);
    if (updatedAtMeta) {
      data.pageMeta = { ...updatedAtMeta };
    }
  }

  // 首页标题规则：使用 site.yml 的 profile 覆盖首页（导航第一项）的 title/subtitle 显示
  const homePageId =
    config.homePageId ||
    (Array.isArray(config.navigation) && config.navigation[0] ? config.navigation[0].id : null) ||
    'home';
  // 供模板判断“当前是否首页”
  data.homePageId = homePageId;
  if (pageId === homePageId && config.profile) {
    if (config.profile.title !== undefined) data.title = config.profile.title;
    if (config.profile.subtitle !== undefined) data.subtitle = config.profile.subtitle;
  }

  // 分类锚点：为当前页面分类生成稳定 slug（用于 id/hash，避免重名/特殊字符冲突）
  if (Array.isArray(data.categories) && data.categories.length > 0) {
    assignCategorySlugs(data.categories, new Map());
  }

  if (config[pageId] && config[pageId].template) {
    console.log(`页面 ${pageId} 使用指定模板: ${templateName}`);
  }

  // 直接渲染页面内容，不使用layout布局（因为layout会在generateHTML中统一应用）
  return renderTemplate(templateName, data, false);
}

/**
 * 生成所有页面的HTML内容
 * @param {Object} config 配置对象
 * @returns {Object} 包含所有页面HTML的对象
 */
function generateAllPagesHTML(config) {
  // 页面内容集合
  const pages = {};

  // 渲染配置中定义的所有页面
  if (Array.isArray(config.navigation)) {
    config.navigation.forEach((navItem) => {
      const pageId = navItem.id;

      // 渲染页面内容
      pages[pageId] = renderPage(pageId, config);
    });
  }

  // 确保搜索结果页存在
  if (!pages['search-results']) {
    pages['search-results'] = renderPage('search-results', config);
  }

  return pages;
}

/**
 * 生成完整的HTML
 * @param {Object} config 配置对象
 * @returns {string} 完整HTML
 */
function generateHTML(config) {
  // 获取所有页面内容
  const pages = generateAllPagesHTML(config);

  // 获取当前年份
  const currentYear = new Date().getFullYear();

  // 准备导航数据，添加submenu字段
  const navigationData = config.navigation.map((nav) => {
    const navItem = { ...nav };

    // 使用辅助函数获取子菜单
    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) {
      navItem.submenu = submenu;
    }

    return navItem;
  });

  // 准备字体链接与 CSS 变量
  const fontLinks = generateFontLinks(config);
  const fontCss = generateFontCss(config);

  // 准备社交链接
  const socialLinks = generateSocialLinks(config.social);

  // 使用主布局模板
  const layoutData = {
    ...config,
    pages,
    fontLinks,
    fontCss,
    navigationData,
    currentYear,
    socialLinks,
    navigation: generateNavigation(config.navigation, config), // 兼容旧版
    social: Array.isArray(config.social) ? config.social : [], // 兼容旧版

    // 确保配置数据可用于浏览器扩展
    configJSON: config.configJSON, // 从prepareRenderData函数中获取的配置数据
  };

  try {
    // 使用辅助函数获取默认布局模板
    const { template: layoutTemplate } = getDefaultLayoutTemplate();

    // 渲染模板
    return layoutTemplate(layoutData);
  } catch (error) {
    console.error('Error rendering main HTML template:', error);
    throw error;
  }
}

function tryMinifyStaticAsset(srcPath, destPath, loader) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
    return false;
  }

  try {
    const source = fs.readFileSync(srcPath, 'utf8');
    const result = esbuild.transformSync(source, {
      loader,
      minify: true,
      charset: 'utf8',
    });
    fs.writeFileSync(destPath, result.code);
    return true;
  } catch (error) {
    console.error(`Error minifying ${srcPath}:`, error);
    return false;
  }
}

// 复制静态文件
function copyStaticFiles(config) {
  // 确保dist目录存在
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // 复制CSS文件
  try {
    if (!tryMinifyStaticAsset('assets/style.css', 'dist/style.css', 'css')) {
      fs.copyFileSync('assets/style.css', 'dist/style.css');
    }
  } catch (e) {
    console.error('Error copying style.css:', e);
  }

  try {
    if (!tryMinifyStaticAsset('assets/pinyin-match.js', 'dist/pinyin-match.js', 'js')) {
      fs.copyFileSync('assets/pinyin-match.js', 'dist/pinyin-match.js');
    }
  } catch (e) {
    console.error('Error copying pinyin-match.js:', e);
  }

  // 复制JavaScript文件
  try {
    if (!tryMinifyStaticAsset('src/script.js', 'dist/script.js', 'js')) {
      fs.copyFileSync('src/script.js', 'dist/script.js');
    }
  } catch (e) {
    console.error('Error copying script.js:', e);
  }

  // faviconUrl（站点级自定义图标）：若使用本地路径（建议以 assets/ 开头），则复制到 dist 下同路径
  try {
    const copied = new Set();

    const copyLocalAsset = (rawUrl) => {
      const raw = String(rawUrl || '').trim();
      if (!raw) return;
      if (/^https?:\/\//i.test(raw)) return;

      const rel = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
      if (!rel.startsWith('assets/')) return;

      const normalized = path.posix.normalize(rel);
      if (!normalized.startsWith('assets/')) return;
      if (copied.has(normalized)) return;
      copied.add(normalized);

      const srcPath = path.join(process.cwd(), normalized);
      const destPath = path.join(process.cwd(), 'dist', normalized);
      if (!fs.existsSync(srcPath)) {
        console.warn(`[WARN] faviconUrl 本地文件不存在：${normalized}`);
        return;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    };

    if (config && Array.isArray(config.navigation)) {
      config.navigation.forEach((navItem) => {
        const pageId = navItem && navItem.id ? String(navItem.id) : '';
        if (!pageId) return;
        const pageConfig = config[pageId];
        if (!pageConfig || typeof pageConfig !== 'object') return;

        if (Array.isArray(pageConfig.sites)) {
          pageConfig.sites.forEach((site) => {
            if (!site || typeof site !== 'object') return;
            copyLocalAsset(site.faviconUrl);
          });
        }

        if (Array.isArray(pageConfig.categories)) {
          const sites = [];
          pageConfig.categories.forEach((category) => collectSitesRecursively(category, sites));
          sites.forEach((site) => {
            if (!site || typeof site !== 'object') return;
            copyLocalAsset(site.faviconUrl);
          });
        }
      });
    }
  } catch (e) {
    console.error('Error copying faviconUrl assets:', e);
  }

  // 如果配置了favicon，确保文件存在并复制
  if (config.site.favicon) {
    try {
      if (fs.existsSync(`assets/${config.site.favicon}`)) {
        fs.copyFileSync(
          `assets/${config.site.favicon}`,
          `dist/${path.basename(config.site.favicon)}`
        );
      } else if (fs.existsSync(config.site.favicon)) {
        fs.copyFileSync(config.site.favicon, `dist/${path.basename(config.site.favicon)}`);
      } else {
        console.warn(`Warning: Favicon file not found: ${config.site.favicon}`);
      }
    } catch (e) {
      console.error('Error copying favicon:', e);
    }
  }
}

// 生成 GitHub Pages 的 404 回跳页：将 /<id> 形式的路径深链接转换为 /?page=<id>
function generate404Html(config) {
  const siteTitle =
    config && config.site && typeof config.site.title === 'string' ? config.site.title : 'MeNav';
  const safeTitle = escapeHtml(siteTitle);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${safeTitle} - 页面未找到</title>
    <style>
      body {
        margin: 0;
        padding: 40px 16px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
          Arial, 'Noto Sans', 'Liberation Sans', sans-serif;
        color: #111;
        background: #fff;
      }
      .container {
        max-width: 720px;
        margin: 0 auto;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
        line-height: 1.3;
      }
      p {
        margin: 8px 0;
        line-height: 1.6;
      }
      a {
        color: #2563eb;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
          'Courier New', monospace;
      }
    </style>
    <script>
      (function () {
        var l = window.location;
        var pathname = (l && l.pathname) || '';
        var hash = (l && l.hash) || '';
        var search = (l && l.search) || '';

        // 清理首尾 /，并分割路径段
        var segments = pathname.replace(/^\\/+|\\/+$/g, '').split('/').filter(Boolean);

        // 仅处理两种常见形态：
        // - 用户站点：/<id>
        // - 仓库站点：/<repo>/<id>
        var base = '/';
        var pageId = '';

        if (segments.length === 1) {
          pageId = segments[0];
        } else if (segments.length === 2) {
          base = '/' + segments[0] + '/';
          pageId = segments[1];
        } else {
          return;
        }

        // 过滤明显不是“页面 id”的情况（静态资源/404 本身）
        if (!pageId || pageId === '404.html' || pageId.indexOf('.') !== -1) return;

        try {
          pageId = decodeURIComponent(pageId);
        } catch (e) {
          // 保持原值
        }

        // 将原 search 附加到目标 URL（去掉可能存在的 page 参数，避免冲突）
        var extra = '';
        if (search && search.length > 1) {
          try {
            var params = new URLSearchParams(search);
            params.delete('page');
            var rest = params.toString();
            if (rest) extra = '&' + rest;
          } catch (e) {
            // URLSearchParams 不可用时直接忽略
          }
        }

        var target = base + '?page=' + encodeURIComponent(pageId) + extra + hash;
        l.replace(target);
      })();
    </script>
  </head>
  <body>
    <div class="container">
      <h1>页面未找到</h1>
      <p>若你访问的是“页面路径深链接”，系统将自动回跳到 <code>?page=</code> 形式的可用地址。</p>
      <p><a href="./">返回首页</a></p>
    </div>
  </body>
</html>
`;
}

// 主函数
function main() {
  const config = loadConfig();

  try {
    // 确保dist目录存在
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist', { recursive: true });
    }

    // 初始化Handlebars模板系统
    loadHandlebarsTemplates();

    // 使用generateHTML函数生成完整的HTML
    const htmlContent = generateHTML(config);

    // 生成HTML
    fs.writeFileSync('dist/index.html', htmlContent);

    // 扩展专用配置：独立静态文件（按需加载）
    try {
      const extensionConfig =
        config && config.extensionConfig ? JSON.stringify(config.extensionConfig, null, 2) : '';
      if (extensionConfig) {
        fs.writeFileSync(path.join('dist', MENAV_EXTENSION_CONFIG_FILE), extensionConfig);
      }
    } catch (error) {
      console.error('Error writing extension config file:', error);
    }

    // GitHub Pages 静态路由回退：用于支持 /<id> 形式的路径深链接
    fs.writeFileSync('dist/404.html', generate404Html(config));

    // 复制静态文件
    copyStaticFiles(config);
  } catch (e) {
    console.error('Error in main function:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

// 导出供测试使用的函数
module.exports = {
  loadConfig,
  generateHTML,
  generate404Html,
  copyStaticFiles,
  generateNavigation,
  generateCategories,
  loadHandlebarsTemplates,
  renderTemplate,
  generateAllPagesHTML,
};
