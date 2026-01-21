const initUi = require('./ui');
const initSearch = require('./search');
const initRouting = require('./routing');

function detectHomePageId() {
  // 首页不再固定为 "home"：以导航顺序第一项为准
  // 1) 优先从生成端注入的配置数据读取（保持与实际导航顺序一致）
  try {
    const config =
      window.MeNav && typeof window.MeNav.getConfig === 'function'
        ? window.MeNav.getConfig()
        : null;
    const injectedHomePageId =
      config && config.data && config.data.homePageId ? String(config.data.homePageId).trim() : '';
    if (injectedHomePageId) return injectedHomePageId;
    const nav =
      config && config.data && Array.isArray(config.data.navigation)
        ? config.data.navigation
        : null;
    const firstId = nav && nav[0] && nav[0].id ? String(nav[0].id).trim() : '';
    if (firstId) return firstId;
  } catch (error) {
    // 忽略解析错误，继续使用 DOM 推断
  }

  // 2) 回退到 DOM：取首个导航项的 data-page
  const firstNavItem = document.querySelector('.nav-item[data-page]');
  if (firstNavItem) {
    const id = String(firstNavItem.getAttribute('data-page') || '').trim();
    if (id) return id;
  }

  // 3) 最后兜底：取首个页面容器 id
  const firstPage = document.querySelector('.page[id]');
  if (firstPage && firstPage.id) return firstPage.id;

  return 'home';
}

document.addEventListener('DOMContentLoaded', () => {
  const homePageId = detectHomePageId();

  const state = {
    homePageId,
    currentPageId: homePageId,
    isInitialLoad: true,
    isSidebarOpen: false,
    isLightTheme: false,
    isSidebarCollapsed: false,
    pages: null,
    currentSearchEngine: 'local',
    isSearchActive: false,
    searchIndex: {
      initialized: false,
      items: [],
    },
  };

  // 获取 DOM 元素 - 基本元素
  const searchInput = document.getElementById('search');
  const searchBox = document.querySelector('.search-box');
  const searchResultsPage = document.getElementById('search-results');
  const searchSections = searchResultsPage.querySelectorAll('.search-section');

  // 搜索引擎相关元素
  const searchEngineToggle = document.querySelector('.search-engine-toggle');
  const searchEngineToggleIcon = searchEngineToggle
    ? searchEngineToggle.querySelector('.search-engine-icon')
    : null;
  const searchEngineToggleLabel = searchEngineToggle
    ? searchEngineToggle.querySelector('.search-engine-label')
    : null;
  const searchEngineDropdown = document.querySelector('.search-engine-dropdown');
  const searchEngineOptions = document.querySelectorAll('.search-engine-option');

  // 移动端元素
  const menuToggle = document.querySelector('.menu-toggle');
  const searchToggle = document.querySelector('.search-toggle');
  const sidebar = document.querySelector('.sidebar');
  const searchContainer = document.querySelector('.search-container');
  const overlay = document.querySelector('.overlay');

  // 侧边栏折叠功能
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  const content = document.querySelector('.content');

  // 主题切换元素
  const themeToggle = document.querySelector('.theme-toggle');
  const themeIcon = themeToggle.querySelector('i');

  const dom = {
    searchInput,
    searchBox,
    searchResultsPage,
    searchSections,
    searchEngineToggle,
    searchEngineToggleIcon,
    searchEngineToggleLabel,
    searchEngineDropdown,
    searchEngineOptions,
    menuToggle,
    searchToggle,
    sidebar,
    searchContainer,
    overlay,
    sidebarToggle,
    content,
    themeToggle,
    themeIcon,
  };

  const ui = initUi(state, dom);
  const search = initSearch(state, dom);

  initRouting(state, dom, { ui, search });
});
