function ensureConfigDefaults(config) {
  const result = { ...config };

  result.site = result.site || {};
  result.navigation = result.navigation || [];

  result.fonts = result.fonts && typeof result.fonts === 'object' ? result.fonts : {};
  result.fonts.source = result.fonts.source || 'css';
  result.fonts.family = result.fonts.family || 'LXGW WenKai';
  result.fonts.weight = result.fonts.weight || 'normal';
  result.fonts.cssUrl = result.fonts.cssUrl || 'https://fontsapi.zeoseven.com/292/main/result.css';

  result.profile = result.profile || {};
  result.social = result.social || [];

  result.icons = result.icons || {};
  result.icons.mode = result.icons.mode || 'favicon';
  result.icons.region = result.icons.region || 'com';

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

  result.profile.title = result.profile.title || '欢迎使用';
  result.profile.subtitle = result.profile.subtitle || 'MeNav个人导航系统';

  function processSiteDefaults(site) {
    site.name = site.name || '未命名站点';
    site.url = site.url || '#';
    site.description = site.description || '';
    site.icon = site.icon || 'fas fa-link';
    site.external = typeof site.external === 'boolean' ? site.external : true;
  }

  function processNodeSitesRecursively(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node.sites)) {
      node.sites.forEach(processSiteDefaults);
    }

    if (Array.isArray(node.subcategories)) node.subcategories.forEach(processNodeSitesRecursively);
    if (Array.isArray(node.groups)) node.groups.forEach(processNodeSitesRecursively);
    if (Array.isArray(node.subgroups)) node.subgroups.forEach(processNodeSitesRecursively);
  }

  function processCategoryDefaults(category) {
    category.name = category.name || '未命名分类';
    category.sites = category.sites || [];
    processNodeSitesRecursively(category);
  }

  Object.keys(result).forEach((key) => {
    const pageConfig = result[key];
    if (!pageConfig || typeof pageConfig !== 'object') return;

    if (Array.isArray(pageConfig.categories)) {
      pageConfig.categories.forEach(processCategoryDefaults);
    }

    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach(processSiteDefaults);
    }
  });

  return result;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    const { createLogger } = require('../utils/logger');
    createLogger('config').error('配置无效：配置必须是对象');
    return false;
  }

  return true;
}

module.exports = {
  ensureConfigDefaults,
  validateConfig,
};
