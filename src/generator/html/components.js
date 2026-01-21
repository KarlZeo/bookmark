const fs = require('fs');
const path = require('path');

const { handlebars } = require('../template/engine');
const { getSubmenuForNavItem } = require('../config');
const { escapeHtml } = require('../utils/html');
const { createLogger, isVerbose } = require('../utils/logger');

const log = createLogger('render');

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

  // 尝试使用 Handlebars 模板
  try {
    const socialLinksPath = path.join(process.cwd(), 'templates', 'components', 'social-links.hbs');
    if (fs.existsSync(socialLinksPath)) {
      const templateContent = fs.readFileSync(socialLinksPath, 'utf8');
      const template = handlebars.compile(templateContent);
      // 确保数据格式正确
      return template(social); // 社交链接模板直接接收数组
    }
  } catch (error) {
    log.warn('渲染 social-links 模板失败，已回退到内置渲染', {
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
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
    log.warn('页面数据缺失，已回退为占位页面', { page: pageId });
    return `
                <div class="welcome-section">
                    <div class="welcome-section-main">
                        <h2>页面未配置</h2>
                        <p class="subtitle">请配置 ${pageId} 页面</p>
                    </div>
                </div>`;
  }

  // 首页使用 profile 数据，其他页面使用自身数据
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
  const sections = pageIds
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
${sections}
            </div>`;
}

module.exports = {
  generateNavigation,
  generateSiteCards,
  generateCategories,
  generateSocialLinks,
  generatePageContent,
  generateSearchResultsPage,
};
