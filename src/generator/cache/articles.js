const fs = require('fs');
const path = require('path');

const { collectSitesRecursively, normalizeUrlKey } = require('../utils/sites');
const { createLogger } = require('../utils/logger');

const log = createLogger('cache:articles');

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
    log.warn('articles 缓存读取失败，将回退 Phase 1', { path: cachePath });
    return null;
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

module.exports = {
  tryLoadArticlesFeedCache,
  buildArticlesCategoriesByPageCategories,
};
