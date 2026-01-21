const fs = require('fs');
const path = require('path');

const { createLogger } = require('../utils/logger');

const log = createLogger('cache:projects');

function tryLoadProjectsHeatmapCache(pageId, config) {
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
  const cachePath = path.join(cacheBaseDir, `${pageId}.heatmap-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const username = parsed.username ? String(parsed.username).trim() : '';
    const html = parsed.html ? String(parsed.html) : '';
    if (!username || !html) return null;

    return {
      username,
      html,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
        sourceUrl: parsed.sourceUrl || '',
      },
    };
  } catch (e) {
    log.warn('heatmap 缓存读取失败，将降级为运行时加载', { path: cachePath });
    return null;
  }
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
    log.warn('projects 缓存读取失败，将仅展示标题与描述', { path: cachePath });
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
    const repo = parts[1].replace(/\\.git$/i, '');
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

module.exports = {
  tryLoadProjectsRepoCache,
  tryLoadProjectsHeatmapCache,
  applyRepoMetaToCategories,
  buildProjectsMeta,
};
