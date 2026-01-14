function menavExtractDomain(url) {
  if (!url) return '';

  try {
    // 移除协议部分 (http://, https://, etc.)
    let domain = String(url).replace(/^[a-zA-Z]+:\/\//, '');

    // 移除路径、查询参数和锚点
    domain = domain.split('/')[0].split('?')[0].split('#')[0];

    // 移除端口号（如果有）
    domain = domain.split(':')[0];

    return domain;
  } catch (e) {
    return String(url);
  }
}

// URL 安全策略：默认仅允许 http/https（可加 mailto/tel）与相对链接；其他 scheme 降级为 '#'
function menavGetAllowedUrlSchemes() {
  try {
    const cfg =
      window.MeNav && typeof window.MeNav.getConfig === 'function'
        ? window.MeNav.getConfig()
        : null;
    const fromConfig =
      cfg &&
      cfg.data &&
      cfg.data.site &&
      cfg.data.site.security &&
      cfg.data.site.security.allowedSchemes;
    if (Array.isArray(fromConfig) && fromConfig.length > 0) {
      return fromConfig
        .map((s) =>
          String(s || '')
            .trim()
            .toLowerCase()
            .replace(/:$/, '')
        )
        .filter(Boolean);
    }
  } catch (e) {
    // 忽略，回退默认
  }
  return ['http', 'https', 'mailto', 'tel'];
}

function menavIsRelativeUrl(url) {
  const s = String(url || '').trim();
  return (
    s.startsWith('#') ||
    s.startsWith('/') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('?')
  );
}

function menavSanitizeUrl(rawUrl, contextLabel) {
  if (rawUrl === undefined || rawUrl === null) return '#';
  const url = String(rawUrl).trim();
  if (!url) return '#';

  if (menavIsRelativeUrl(url)) return url;

  // 明确拒绝协议相对 URL（//example.com），避免意外绕过策略
  if (url.startsWith('//')) {
    console.warn(`[MeNav][安全] 已拦截不安全 URL（协议相对形式）：${contextLabel || ''}`, url);
    return '#';
  }

  try {
    const parsed = new URL(url);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    const allowed = menavGetAllowedUrlSchemes();
    if (allowed.includes(scheme)) return url;
    console.warn(`[MeNav][安全] 已拦截不安全 URL scheme：${contextLabel || ''}`, url);
    return '#';
  } catch (e) {
    // 既不是可识别的绝对 URL，也不是允许的相对 URL
    console.warn(`[MeNav][安全] 已拦截无法解析的 URL：${contextLabel || ''}`, url);
    return '#';
  }
}

// class token 清洗：仅允许字母/数字/下划线/中划线与空格分隔，避免属性/事件注入
function menavSanitizeClassList(rawClassList, contextLabel) {
  const input = String(rawClassList || '').trim();
  if (!input) return '';

  const tokens = input
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/[^\w-]/g, ''))
    .filter(Boolean);

  const sanitized = tokens.join(' ');
  if (sanitized !== input) {
    console.warn(`[MeNav][安全] 已清洗不安全的 icon class：${contextLabel || ''}`, rawClassList);
  }
  return sanitized;
}

// 版本号统一来源：优先读取 meta[menav-version]，回退到 menav-config-data.version
function menavDetectVersion() {
  try {
    const meta = document.querySelector('meta[name="menav-version"]');
    const v = meta ? String(meta.getAttribute('content') || '').trim() : '';
    if (v) return v;
  } catch (e) {
    // 忽略
  }

  try {
    const configData = document.getElementById('menav-config-data');
    const raw = configData ? String(configData.textContent || '').trim() : '';
    if (!raw) return '1.0.0';
    const parsed = JSON.parse(raw);
    const v = parsed && parsed.version ? String(parsed.version).trim() : '';
    return v || '1.0.0';
  } catch (e) {
    return '1.0.0';
  }
}

// 修复移动端 `100vh` 视口高度问题：用实际可视高度驱动布局，避免侧边栏/内容区底部被浏览器 UI 遮挡
function menavUpdateAppHeight() {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

menavUpdateAppHeight();
window.addEventListener('resize', menavUpdateAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', menavUpdateAppHeight);
}

// 配置数据缓存：避免浏览器扩展/站点脚本频繁 JSON.parse
let menavConfigCacheReady = false;
let menavConfigCacheRaw = null;
let menavConfigCacheValue = null;

// 全局MeNav对象 - 用于浏览器扩展
window.MeNav = {
  version: menavDetectVersion(),

  // 获取配置数据
  getConfig: function (options) {
    const configData = document.getElementById('menav-config-data');
    if (!configData) return null;

    const raw = configData.textContent || '';
    if (!menavConfigCacheReady || menavConfigCacheRaw !== raw) {
      menavConfigCacheValue = JSON.parse(raw);
      menavConfigCacheRaw = raw;
      menavConfigCacheReady = true;
    }

    if (options && options.clone) {
      if (typeof structuredClone === 'function') {
        return structuredClone(menavConfigCacheValue);
      }
      return JSON.parse(JSON.stringify(menavConfigCacheValue));
    }

    return menavConfigCacheValue;
  },

  // 获取元素的唯一标识符
  _getElementId: function (element) {
    const type = element.getAttribute('data-type');
    if (type === 'nav-item') {
      return element.getAttribute('data-id');
    } else if (type === 'social-link') {
      return element.getAttribute('data-url');
    } else {
      // 优先使用 data-id（例如分类 slug），回退 data-name（兼容旧扩展/旧页面）
      return element.getAttribute('data-id') || element.getAttribute('data-name');
    }
  },

  // 根据类型和ID查找元素
  _findElement: function (type, id) {
    let selector;
    if (type === 'nav-item') {
      selector = `[data-type="${type}"][data-id="${id}"]`;
    } else if (type === 'social-link') {
      selector = `[data-type="${type}"][data-url="${id}"]`;
    } else if (type === 'site') {
      // 站点：优先用 data-url（更稳定），回退 data-id/data-name
      return (
        document.querySelector(`[data-type="${type}"][data-url="${id}"]`) ||
        document.querySelector(`[data-type="${type}"][data-id="${id}"]`) ||
        document.querySelector(`[data-type="${type}"][data-name="${id}"]`)
      );
    } else {
      // 其他：优先 data-id（例如分类 slug），回退 data-name（兼容旧扩展/旧页面）
      return (
        document.querySelector(`[data-type="${type}"][data-id="${id}"]`) ||
        document.querySelector(`[data-type="${type}"][data-name="${id}"]`)
      );
    }
    return document.querySelector(selector);
  },

  // 更新DOM元素
  updateElement: function (type, id, newData) {
    const element = this._findElement(type, id);
    if (!element) return false;

    if (type === 'site') {
      // 更新站点卡片
      if (newData.url) {
        const safeUrl = menavSanitizeUrl(newData.url, 'updateElement(site).url');
        element.setAttribute('href', safeUrl);
        // 保留原始 URL 供扩展/调试读取，但点击行为以 href 的安全降级为准
        element.setAttribute('data-url', String(newData.url).trim());
      }
      if (newData.name) {
        element.querySelector('h3').textContent = newData.name;
        element.setAttribute('data-name', newData.name);
      }
      if (newData.description) {
        element.querySelector('p').textContent = newData.description;
        element.setAttribute('data-description', newData.description);
      }
      if (newData.icon) {
        const iconElement =
          element.querySelector('i.icon-fallback') ||
          element.querySelector('i.site-icon') ||
          element.querySelector('.site-card-icon i') ||
          element.querySelector('i');

        if (iconElement) {
          const nextIconClass = menavSanitizeClassList(newData.icon, 'updateElement(site).icon');
          const preservedClasses = [];

          if (iconElement.classList.contains('icon-fallback')) {
            preservedClasses.push('icon-fallback');
          }
          if (iconElement.classList.contains('site-icon')) {
            preservedClasses.push('site-icon');
          }

          if (nextIconClass) {
            iconElement.className = nextIconClass;
            preservedClasses.forEach((cls) => iconElement.classList.add(cls));
          }
        }
        element.setAttribute(
          'data-icon',
          menavSanitizeClassList(newData.icon, 'updateElement(site).data-icon')
        );
      }
      if (newData.title) element.title = newData.title;

      // 触发元素更新事件
      this.events.emit('elementUpdated', {
        id: id,
        type: 'site',
        data: newData,
      });

      return true;
    } else if (type === 'category') {
      // 更新分类
      if (newData.name) {
        const titleElement = element.querySelector('h2');
        if (titleElement) {
          const iconElement = titleElement.querySelector('i');
          const iconClass = iconElement ? iconElement.className : '';
          const nextIcon = menavSanitizeClassList(
            newData.icon || iconClass,
            'updateElement(category).icon'
          );

          // 用 DOM API 重建标题，避免 innerHTML 注入
          titleElement.textContent = '';
          const nextIconEl = document.createElement('i');
          if (nextIcon) nextIconEl.className = nextIcon;
          titleElement.appendChild(nextIconEl);
          titleElement.appendChild(document.createTextNode(' ' + String(newData.name)));
        }
        element.setAttribute('data-name', newData.name);
      }
      if (newData.icon) {
        element.setAttribute(
          'data-icon',
          menavSanitizeClassList(newData.icon, 'updateElement(category).data-icon')
        );
      }

      // 触发元素更新事件
      this.events.emit('elementUpdated', {
        id: id,
        type: 'category',
        data: newData,
      });

      return true;
    } else if (type === 'nav-item') {
      // 更新导航项
      if (newData.name) {
        const textElement = element.querySelector('.nav-text');
        if (textElement) {
          textElement.textContent = newData.name;
        }
        element.setAttribute('data-name', newData.name);
      }
      if (newData.icon) {
        const iconElement = element.querySelector('i');
        if (iconElement) {
          iconElement.className = menavSanitizeClassList(
            newData.icon,
            'updateElement(nav-item).icon'
          );
        }
        element.setAttribute(
          'data-icon',
          menavSanitizeClassList(newData.icon, 'updateElement(nav-item).data-icon')
        );
      }

      // 触发元素更新事件
      this.events.emit('elementUpdated', {
        id: id,
        type: 'nav-item',
        data: newData,
      });

      return true;
    } else if (type === 'social-link') {
      // 更新社交链接
      if (newData.url) {
        const safeUrl = menavSanitizeUrl(newData.url, 'updateElement(social-link).url');
        element.setAttribute('href', safeUrl);
        // 保留原始 URL 供扩展/调试读取，但点击行为以 href 的安全降级为准
        element.setAttribute('data-url', String(newData.url).trim());
      }
      if (newData.name) {
        const textElement = element.querySelector('.nav-text');
        if (textElement) {
          textElement.textContent = newData.name;
        }
        element.setAttribute('data-name', newData.name);
      }
      if (newData.icon) {
        const iconElement = element.querySelector('i');
        if (iconElement) {
          iconElement.className = menavSanitizeClassList(
            newData.icon,
            'updateElement(social-link).icon'
          );
        }
        element.setAttribute(
          'data-icon',
          menavSanitizeClassList(newData.icon, 'updateElement(social-link).data-icon')
        );
      }

      // 触发元素更新事件
      this.events.emit('elementUpdated', {
        id: id,
        type: 'social-link',
        data: newData,
      });

      return true;
    }

    return false;
  },

  // 添加新元素
  addElement: function (type, parentId, data) {
    let parent;

    if (type === 'site') {
      // 查找父级分类
      parent = document.querySelector(`[data-type="category"][data-name="${parentId}"]`);
      if (!parent) return null;

      // 添加站点卡片到分类
      const sitesGrid = parent.querySelector('[data-container="sites"]');
      if (!sitesGrid) return null;

      // 站点卡片样式：根据“页面模板”决定（friends/articles/projects 等）
      let siteCardStyle = '';
      try {
        const pageEl = parent.closest('.page');
        const pageId = pageEl && pageEl.id ? String(pageEl.id) : '';
        let templateName = pageId;

        const cfg =
          window.MeNav && typeof window.MeNav.getConfig === 'function'
            ? window.MeNav.getConfig()
            : null;
        const pageTemplates =
          cfg && cfg.data && cfg.data.pageTemplates && typeof cfg.data.pageTemplates === 'object'
            ? cfg.data.pageTemplates
            : null;

        const templateFromMap =
          pageTemplates && pageId && pageTemplates[pageId]
            ? String(pageTemplates[pageId]).trim()
            : '';

        // 兼容旧版：cfg.data[pageId].template
        const legacyPageConfig = cfg && cfg.data && pageId ? cfg.data[pageId] : null;
        const templateFromLegacy =
          legacyPageConfig && legacyPageConfig.template
            ? String(legacyPageConfig.template).trim()
            : '';

        if (templateFromMap) {
          templateName = templateFromMap;
        } else if (templateFromLegacy) {
          templateName = templateFromLegacy;
        }

        // projects 模板使用代码仓库风格卡片（与生成端 templates/components/site-card.hbs 保持一致）
        if (templateName === 'projects') siteCardStyle = 'repo';
      } catch (e) {
        siteCardStyle = '';
      }

      // 创建新的站点卡片
      const newSite = document.createElement('a');
      newSite.className = siteCardStyle ? `site-card site-card-${siteCardStyle}` : 'site-card';

      const siteName = data.name || '未命名站点';
      const siteUrl = data.url || '#';
      const siteIcon = data.icon || 'fas fa-link';
      const siteDescription = data.description || (data.url ? menavExtractDomain(data.url) : '');
      const siteFaviconUrl = data && data.faviconUrl ? String(data.faviconUrl).trim() : '';
      const siteForceIconModeRaw =
        data && data.forceIconMode ? String(data.forceIconMode).trim() : '';
      const siteForceIconMode =
        siteForceIconModeRaw === 'manual' || siteForceIconModeRaw === 'favicon'
          ? siteForceIconModeRaw
          : '';

      const safeSiteUrl = menavSanitizeUrl(siteUrl, 'addElement(site).url');
      const safeSiteIcon = menavSanitizeClassList(siteIcon, 'addElement(site).icon');

      newSite.setAttribute('href', safeSiteUrl);
      newSite.title = siteName + (siteDescription ? ' - ' + siteDescription : '');
      newSite.setAttribute(
        'data-tooltip',
        siteName + (siteDescription ? ' - ' + siteDescription : '')
      ); // 添加自定义 tooltip
      if (/^https?:\/\//i.test(safeSiteUrl)) {
        newSite.target = '_blank';
        newSite.rel = 'noopener';
      }

      // 设置数据属性
      newSite.setAttribute('data-type', 'site');
      newSite.setAttribute('data-name', siteName);
      // 保留原始 URL（data-url）供扩展/调试读取；href 仍会做安全降级
      newSite.setAttribute('data-url', String(data.url || '').trim());
      newSite.setAttribute('data-icon', safeSiteIcon);
      if (siteFaviconUrl) newSite.setAttribute('data-favicon-url', siteFaviconUrl);
      if (siteForceIconMode) newSite.setAttribute('data-force-icon-mode', siteForceIconMode);
      newSite.setAttribute('data-description', siteDescription);

      // projects repo 风格：与模板中的 repo 结构保持一致（不走 favicon 逻辑）
      if (siteCardStyle === 'repo') {
        const repoHeader = document.createElement('div');
        repoHeader.className = 'repo-header';

        const repoIcon = document.createElement('i');
        repoIcon.className = `${safeSiteIcon || 'fas fa-code'} repo-icon`;
        repoIcon.setAttribute('aria-hidden', 'true');

        const repoTitle = document.createElement('div');
        repoTitle.className = 'repo-title';
        repoTitle.textContent = siteName;

        repoHeader.appendChild(repoIcon);
        repoHeader.appendChild(repoTitle);

        const repoDesc = document.createElement('div');
        repoDesc.className = 'repo-desc';
        repoDesc.textContent = siteDescription;

        newSite.appendChild(repoHeader);
        newSite.appendChild(repoDesc);

        const hasStats = data && (data.language || data.stars || data.forks || data.issues);

        if (hasStats) {
          const repoStats = document.createElement('div');
          repoStats.className = 'repo-stats';

          if (data.language) {
            const languageItem = document.createElement('div');
            languageItem.className = 'stat-item';

            const langDot = document.createElement('span');
            langDot.className = 'lang-dot';
            langDot.style.backgroundColor = data.languageColor || '#909296';

            languageItem.appendChild(langDot);
            languageItem.appendChild(document.createTextNode(String(data.language)));
            repoStats.appendChild(languageItem);
          }

          if (data.stars) {
            const starsItem = document.createElement('div');
            starsItem.className = 'stat-item';

            const starIcon = document.createElement('i');
            starIcon.className = 'far fa-star';
            starIcon.setAttribute('aria-hidden', 'true');
            starsItem.appendChild(starIcon);
            starsItem.appendChild(document.createTextNode(` ${data.stars}`));
            repoStats.appendChild(starsItem);
          }

          if (data.forks) {
            const forksItem = document.createElement('div');
            forksItem.className = 'stat-item';

            const forkIcon = document.createElement('i');
            forkIcon.className = 'fas fa-code-branch';
            forkIcon.setAttribute('aria-hidden', 'true');
            forksItem.appendChild(forkIcon);
            forksItem.appendChild(document.createTextNode(` ${data.forks}`));
            repoStats.appendChild(forksItem);
          }

          if (data.issues) {
            const issuesItem = document.createElement('div');
            issuesItem.className = 'stat-item';

            const issueIcon = document.createElement('i');
            issueIcon.className = 'fas fa-exclamation-circle';
            issueIcon.setAttribute('aria-hidden', 'true');
            issuesItem.appendChild(issueIcon);
            issuesItem.appendChild(document.createTextNode(` ${data.issues}`));
            repoStats.appendChild(issuesItem);
          }

          newSite.appendChild(repoStats);
        }
      } else {
        // 添加内容（根据图标模式渲染，避免 innerHTML 注入）
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'site-card-icon';
        iconWrapper.setAttribute('aria-hidden', 'true');

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'site-card-content';

        const titleEl = document.createElement('h3');
        titleEl.textContent = siteName;

        const descEl = document.createElement('p');
        descEl.textContent = siteDescription;

        contentWrapper.appendChild(titleEl);
        contentWrapper.appendChild(descEl);

        let iconsMode = 'favicon';
        let iconsRegion = 'com';
        try {
          const cfg =
            window.MeNav && typeof window.MeNav.getConfig === 'function'
              ? window.MeNav.getConfig()
              : null;
          iconsMode = (cfg && (cfg.data?.icons?.mode || cfg.icons?.mode)) || 'favicon';
          iconsRegion = (cfg && (cfg.data?.icons?.region || cfg.icons?.region)) || 'com';
        } catch (e) {
          iconsMode = 'favicon';
          iconsRegion = 'com';
        }

        const shouldUseCustomFavicon = Boolean(siteFaviconUrl);
        const effectiveIconsMode = siteForceIconMode || iconsMode;

        if (shouldUseCustomFavicon) {
          const iconContainer = document.createElement('div');
          iconContainer.className = 'icon-container';

          const placeholder = document.createElement('i');
          placeholder.className = 'fas fa-circle-notch fa-spin icon-placeholder';
          placeholder.setAttribute('aria-hidden', 'true');

          const fallback = document.createElement('i');
          fallback.className = `${safeSiteIcon} icon-fallback`;
          fallback.setAttribute('aria-hidden', 'true');

          const favicon = document.createElement('img');
          favicon.className = 'favicon-icon';
          favicon.src = siteFaviconUrl;
          favicon.alt = `${siteName} favicon`;
          favicon.loading = 'lazy';

          // 超时处理：5秒后如果还没加载成功，显示回退图标
          let loadTimeout = setTimeout(() => {
            if (!favicon.classList.contains('loaded')) {
              favicon.classList.add('error');
              placeholder.classList.add('hidden');
              fallback.classList.add('visible');
            }
          }, 5000);

          favicon.addEventListener('load', () => {
            clearTimeout(loadTimeout);
            favicon.classList.add('loaded');
            placeholder.classList.add('hidden');
          });
          favicon.addEventListener('error', () => {
            clearTimeout(loadTimeout);
            favicon.classList.add('error');
            placeholder.classList.add('hidden');
            fallback.classList.add('visible');
          });

          iconContainer.appendChild(placeholder);
          iconContainer.appendChild(favicon);
          iconContainer.appendChild(fallback);
          iconWrapper.appendChild(iconContainer);
        } else if (
          effectiveIconsMode === 'favicon' &&
          safeSiteUrl &&
          /^https?:\/\//i.test(safeSiteUrl)
        ) {
          // 根据 icons.region 配置决定优先使用哪个域名
          const faviconUrlPrimary =
            iconsRegion === 'cn'
              ? `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(safeSiteUrl)}&size=32`
              : `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(safeSiteUrl)}&size=32`;
          const faviconUrlFallback =
            iconsRegion === 'cn'
              ? `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(safeSiteUrl)}&size=32`
              : `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(safeSiteUrl)}&size=32`;

          const iconContainer = document.createElement('div');
          iconContainer.className = 'icon-container';

          const placeholder = document.createElement('i');
          placeholder.className = 'fas fa-circle-notch fa-spin icon-placeholder';
          placeholder.setAttribute('aria-hidden', 'true');

          const fallback = document.createElement('i');
          fallback.className = `${safeSiteIcon} icon-fallback`;
          fallback.setAttribute('aria-hidden', 'true');

          const favicon = document.createElement('img');
          favicon.className = 'favicon-icon';
          favicon.src = faviconUrlPrimary;
          favicon.alt = `${siteName} favicon`;
          favicon.loading = 'lazy';
          let faviconFallbackTried = false;
          let loadTimeout = null;

          // 超时处理：3秒后如果还没加载成功，尝试回退 URL 或显示 Font Awesome 图标
          const startTimeout = () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            loadTimeout = setTimeout(() => {
              if (!favicon.classList.contains('loaded')) {
                if (!faviconFallbackTried) {
                  faviconFallbackTried = true;
                  favicon.src = faviconUrlFallback;
                  startTimeout(); // 为 fallback URL 也设置超时
                } else {
                  favicon.classList.add('error');
                  placeholder.classList.add('hidden');
                  fallback.classList.add('visible');
                }
              }
            }, 3000);
          };
          startTimeout();

          favicon.addEventListener('load', () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            favicon.classList.add('loaded');
            placeholder.classList.add('hidden');
          });
          favicon.addEventListener('error', () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            if (!faviconFallbackTried) {
              faviconFallbackTried = true;
              favicon.src = faviconUrlFallback;
              startTimeout(); // 为 fallback URL 也设置超时
              return;
            }

            favicon.classList.add('error');
            placeholder.classList.add('hidden');
            fallback.classList.add('visible');
          });

          iconContainer.appendChild(placeholder);
          iconContainer.appendChild(favicon);
          iconContainer.appendChild(fallback);
          iconWrapper.appendChild(iconContainer);
        } else {
          const iconEl = document.createElement('i');
          iconEl.className = `${safeSiteIcon} site-icon`;
          iconEl.setAttribute('aria-hidden', 'true');
          iconWrapper.appendChild(iconEl);
        }

        newSite.appendChild(iconWrapper);
        newSite.appendChild(contentWrapper);
      }

      // 添加到DOM
      sitesGrid.appendChild(newSite);

      // 移除"暂无网站"提示（如果存在）
      const emptyMessage = sitesGrid.querySelector('.empty-sites');
      if (emptyMessage) {
        emptyMessage.remove();
      }

      // 触发元素添加事件
      this.events.emit('elementAdded', {
        id: siteName,
        type: 'site',
        parentId: parentId,
        data: data,
      });

      return siteName;
    } else if (type === 'category') {
      // 查找父级页面容器
      parent = document.querySelector(`[data-container="categories"]`);
      if (!parent) return null;

      // 创建新的分类
      const newCategory = document.createElement('section');
      newCategory.className = 'category';

      // 设置数据属性
      newCategory.setAttribute('data-type', 'category');
      newCategory.setAttribute('data-name', data.name || '未命名分类');
      newCategory.setAttribute(
        'data-icon',
        menavSanitizeClassList(data.icon || 'fas fa-folder', 'addElement(category).data-icon')
      );
      newCategory.setAttribute('data-container', 'categories');

      // 添加内容（用 DOM API 构建，避免 innerHTML 注入）
      const titleEl = document.createElement('h2');
      titleEl.setAttribute('data-editable', 'category-name');
      const iconEl = document.createElement('i');
      iconEl.className = menavSanitizeClassList(
        data.icon || 'fas fa-folder',
        'addElement(category).icon'
      );
      titleEl.appendChild(iconEl);
      titleEl.appendChild(document.createTextNode(' ' + String(data.name || '未命名分类')));

      const sitesGrid = document.createElement('div');
      sitesGrid.className = 'sites-grid';
      sitesGrid.setAttribute('data-container', 'sites');
      const emptyEl = document.createElement('p');
      emptyEl.className = 'empty-sites';
      emptyEl.textContent = '暂无网站';
      sitesGrid.appendChild(emptyEl);

      newCategory.appendChild(titleEl);
      newCategory.appendChild(sitesGrid);

      // 添加到DOM
      parent.appendChild(newCategory);

      // 触发元素添加事件
      this.events.emit('elementAdded', {
        id: data.name,
        type: 'category',
        data: data,
      });

      return data.name;
    }

    return null;
  },

  // 删除元素
  removeElement: function (type, id) {
    const element = this._findElement(type, id);
    if (!element) return false;

    // 获取父级容器（如果是站点卡片）
    let parentId = null;
    if (type === 'site') {
      const categoryElement = element.closest('[data-type="category"]');
      if (categoryElement) {
        parentId = categoryElement.getAttribute('data-name');
      }
    }

    // 删除元素
    element.remove();

    // 触发元素删除事件
    this.events.emit('elementRemoved', {
      id: id,
      type: type,
      parentId: parentId,
    });

    return true;
  },

  // 获取所有元素
  getAllElements: function (type) {
    return Array.from(document.querySelectorAll(`[data-type="${type}"]`)).map((el) => {
      const id = this._getElementId(el);
      return {
        id: id,
        type: type,
        element: el,
      };
    });
  },

  // 事件系统
  events: {
    listeners: {},

    // 添加事件监听器
    on: function (event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
      return this;
    },

    // 触发事件
    emit: function (event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach((callback) => callback(data));
      }
      return this;
    },

    // 移除事件监听器
    off: function (event, callback) {
      if (this.listeners[event]) {
        if (callback) {
          this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
        } else {
          delete this.listeners[event];
        }
      }
      return this;
    },
  },
};

// 多层级嵌套书签功能
function getCollapsibleNestedContainers(root) {
  if (!root) return [];
  const headers = root.querySelectorAll(
    '.category > .category-header[data-toggle="category"], .group > .group-header[data-toggle="group"]'
  );
  return Array.from(headers)
    .map((header) => header.parentElement)
    .filter(Boolean);
}

function isNestedContainerCollapsible(container) {
  if (!container) return false;

  if (container.classList.contains('category')) {
    return Boolean(container.querySelector(':scope > .category-header[data-toggle="category"]'));
  }

  if (container.classList.contains('group')) {
    return Boolean(container.querySelector(':scope > .group-header[data-toggle="group"]'));
  }

  return false;
}

window.MeNav.expandAll = function () {
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    getCollapsibleNestedContainers(activePage).forEach((element) => {
      element.classList.remove('collapsed');
      saveToggleState(element, 'expanded');
    });
  }
};

window.MeNav.collapseAll = function () {
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    getCollapsibleNestedContainers(activePage).forEach((element) => {
      element.classList.add('collapsed');
      saveToggleState(element, 'collapsed');
    });
  }
};

// 智能切换分类展开/收起状态
window.MeNav.toggleCategories = function () {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;

  const allElements = getCollapsibleNestedContainers(activePage);
  const collapsedElements = allElements.filter((element) =>
    element.classList.contains('collapsed')
  );
  if (allElements.length === 0) return;

  // 如果收起的数量 >= 总数的一半，执行展开；否则执行收起
  if (collapsedElements.length >= allElements.length / 2) {
    window.MeNav.expandAll();
    updateCategoryToggleIcon('up');
  } else {
    window.MeNav.collapseAll();
    updateCategoryToggleIcon('down');
  }
};

// 更新分类切换按钮图标
function updateCategoryToggleIcon(state) {
  const toggleBtn = document.getElementById('category-toggle');
  if (!toggleBtn) return;

  const icon = toggleBtn.querySelector('i');
  if (!icon) return;

  if (state === 'up') {
    icon.className = 'fas fa-angle-double-up';
    toggleBtn.setAttribute('aria-label', '收起分类');
  } else {
    icon.className = 'fas fa-angle-double-down';
    toggleBtn.setAttribute('aria-label', '展开分类');
  }
}

window.MeNav.toggleCategory = function (
  categoryName,
  subcategoryName = null,
  groupName = null,
  subgroupName = null
) {
  let selector = `[data-name="${categoryName}"]`;

  if (subcategoryName) selector += ` [data-name="${subcategoryName}"]`;
  if (groupName) selector += ` [data-name="${groupName}"]`;
  if (subgroupName) selector += ` [data-name="${subgroupName}"]`;

  const element = document.querySelector(selector);
  if (element) {
    toggleNestedElement(element);
  }
};

window.MeNav.getNestedStructure = function () {
  // 返回完整的嵌套结构数据
  const categories = [];
  document.querySelectorAll('.category-level-1').forEach((cat) => {
    categories.push(extractNestedData(cat));
  });
  return categories;
};

// 切换嵌套元素
function toggleNestedElement(container) {
  if (!isNestedContainerCollapsible(container)) return;
  const isCollapsed = container.classList.contains('collapsed');

  if (isCollapsed) {
    container.classList.remove('collapsed');
    saveToggleState(container, 'expanded');
  } else {
    container.classList.add('collapsed');
    saveToggleState(container, 'collapsed');
  }

  // 触发自定义事件
  const event = new CustomEvent('nestedToggle', {
    detail: {
      element: container,
      type: container.dataset.type,
      name: container.dataset.name,
      isCollapsed: !isCollapsed,
    },
  });
  document.dispatchEvent(event);
}

// 保存切换状态
function saveToggleState(element, state) {
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  localStorage.setItem(key, state);
}

// 恢复切换状态
function restoreToggleState(element) {
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  const savedState = localStorage.getItem(key);

  if (savedState === 'collapsed') {
    element.classList.add('collapsed');
  }
}

// 初始化嵌套分类
function initializeNestedCategories() {
  // 为所有可折叠元素添加切换功能
  document.querySelectorAll('[data-toggle="category"], [data-toggle="group"]').forEach((header) => {
    header.addEventListener('click', function (e) {
      e.stopPropagation();
      const container = this.parentElement;
      toggleNestedElement(container);
    });

    // 恢复保存的状态
    restoreToggleState(header.parentElement);
  });
}

// 提取嵌套数据
function extractNestedData(element) {
  const data = {
    name: element.dataset.name,
    type: element.dataset.type,
    level: element.dataset.level,
    isCollapsed: element.classList.contains('collapsed'),
  };

  // 提取子元素数据
  const subcategories = element.querySelectorAll(
    ':scope > .category-content > .subcategories-container > .category'
  );
  if (subcategories.length > 0) {
    data.subcategories = Array.from(subcategories).map((sub) => extractNestedData(sub));
  }

  const groups = element.querySelectorAll(
    ':scope > .category-content > .groups-container > .group'
  );
  if (groups.length > 0) {
    data.groups = Array.from(groups).map((group) => extractNestedData(group));
  }

  const subgroups = element.querySelectorAll(
    ':scope > .group-content > .subgroups-container > .group'
  );
  if (subgroups.length > 0) {
    data.subgroups = Array.from(subgroups).map((subgroup) => extractNestedData(subgroup));
  }

  const sites = element.querySelectorAll(
    ':scope > .category-content > .sites-grid > .site-card, :scope > .group-content > .sites-grid > .site-card'
  );
  if (sites.length > 0) {
    data.sites = Array.from(sites).map((site) => ({
      name: site.dataset.name,
      url: site.dataset.url,
      icon: site.dataset.icon,
      description: site.dataset.description,
    }));
  }

  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  // 先声明所有状态变量
  let isSearchActive = false;
  // 首页不再固定为 "home"：以导航顺序第一项为准
  const homePageId = (() => {
    // 1) 优先从生成端注入的配置数据读取（保持与实际导航顺序一致）
    try {
      const config =
        window.MeNav && typeof window.MeNav.getConfig === 'function'
          ? window.MeNav.getConfig()
          : null;
      const injectedHomePageId =
        config && config.data && config.data.homePageId
          ? String(config.data.homePageId).trim()
          : '';
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
  })();

  let currentPageId = homePageId;
  let isInitialLoad = true;
  let isSidebarOpen = false;
  let isLightTheme = false; // 主题状态
  let isSidebarCollapsed = false; // 侧边栏折叠状态
  let pages; // 页面元素的全局引用
  let currentSearchEngine = 'local'; // 当前选择的搜索引擎

  // 搜索索引，用于提高搜索效率
  let searchIndex = {
    initialized: false,
    items: [],
  };

  // 搜索引擎配置
  const searchEngines = {
    local: {
      name: '本地搜索',
      iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false"><path fill="#616161" d="M29.171,32.001L32,29.172l12.001,12l-2.828,2.828L29.171,32.001z"></path><path fill="#616161" d="M36,20c0,8.837-7.163,16-16,16S4,28.837,4,20S11.163,4,20,4S36,11.163,36,20"></path><path fill="#37474f" d="M32.476,35.307l2.828-2.828l8.693,8.693L41.17,44L32.476,35.307z"></path><path fill="#64b5f6" d="M7,20c0-7.18,5.82-13,13-13s13,5.82,13,13s-5.82,13-13,13S7,27.18,7,20"></path></svg>`,
      url: null, // 本地搜索不需要URL
    },
    google: {
      name: 'Google搜索',
      iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>`,
      url: 'https://www.google.com/search?q=',
    },
    bing: {
      name: 'Bing搜索',
      iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" focusable="false"><g fill="#2877fb" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal"><g transform="scale(5.12,5.12)"><path d="M45,26.10156v-5.10156c0,-0.89844 -0.60156,-1.69922 -1.39844,-1.89844l-4.60156,-1.40234c-5.30078,-1.59766 -10.30078,-3 -15.60156,-4.69922h-0.09766c-0.80078,-0.19922 -1.60156,0.69922 -1.19922,1.5c1.89844,3.89844 3.89844,9.5 3.89844,9.5l6.69922,2.60156c-0.30078,0 -21.69922,11.39844 -21.69922,11.39844l9,-8v-23c0,-0.89844 -0.60156,-1.80078 -1.39844,-2c0,0 -4.90234,-1.89844 -8,-2.89844c-0.20312,-0.10156 -0.40234,-0.10156 -0.60156,-0.10156c-0.39844,0 -0.80078,0.10156 -1.19922,0.39844c-0.5,0.40234 -0.80078,1 -0.80078,1.60156v34.69922c0,0.69922 0.30078,1.30078 0.89844,1.60156c2.10156,1.5 4.30078,3 6.40234,4.5l3,2.09766c0.30078,0.20313 0.69922,0.40234 1.09766,0.40234c0.40234,0 0.70313,-0.10156 1,-0.30078c4.30078,-2.60156 8.70313,-5.19922 13,-7.80078l10.60156,-6.30078c0.60156,-0.39844 1,-1 1,-1.69922z"></path></g></g></svg>`,
      url: 'https://www.bing.com/search?q=',
    },
    duckduckgo: {
      name: 'DuckDuckGo搜索',
      shortName: 'duckgo',
      // DuckDuckGo 使用内联 SVG，避免依赖不存在的 Font Awesome 品牌图标
      iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 40 40" focusable="false"><path fill="#ff3d00" d="M44,24c0,11-9,20-20,20S4,35,4,24S13,4,24,4S44,13,44,24z"></path><path fill="#fff" d="M26,16.2c-0.6-0.6-1.5-0.9-2.5-1.1c-0.4-0.5-1-1-1.9-1.5c-1.6-0.8-3.5-1.2-5.3-0.9h-0.4 c-0.1,0-0.2,0.1-0.4,0.1c0.2,0,1,0.4,1.6,0.6c-0.3,0.2-0.8,0.2-1.1,0.4c0,0,0,0-0.1,0L15.7,14c-0.1,0.2-0.2,0.4-0.2,0.5 c1.3-0.1,3.2,0,4.6,0.4C19,15,18,15.3,17.3,15.7c-0.5,0.3-1,0.6-1.3,1.1c-1.2,1.3-1.7,3.5-1.3,5.9c0.5,2.7,2.4,11.4,3.4,16.3 l0.3,1.6c0,0,3.5,0.4,5.6,0.4c1.2,0,3.2,0.3,3.7-0.2c-0.1,0-0.6-0.6-0.8-1.1c-0.5-1-1-1.9-1.4-2.6c-1.2-2.5-2.5-5.9-1.9-8.1 c0.1-0.4,0.1-2.1,0.4-2.3c2.6-1.7,2.4-0.1,3.5-0.8c0.5-0.4,1-0.9,1.2-1.5C29.4,22.1,27.8,18,26,16.2z"></path><path fill="#fff" d="M24,42c-9.9,0-18-8.1-18-18c0-9.9,8.1-18,18-18c9.9,0,18,8.1,18,18C42,33.9,33.9,42,24,42z M24,8 C15.2,8,8,15.2,8,24s7.2,16,16,16s16-7.2,16-16S32.8,8,24,8z"></path><path fill="#0277bd" d="M19,21.1c-0.6,0-1.2,0.5-1.2,1.2c0,0.6,0.5,1.2,1.2,1.2c0.6,0,1.2-0.5,1.2-1.2 C20.1,21.7,19.6,21.1,19,21.1z M19.5,22.2c-0.2,0-0.3-0.1-0.3-0.3c0-0.2,0.1-0.3,0.3-0.3s0.3,0.1,0.3,0.3 C19.8,22.1,19.6,22.2,19.5,22.2z M26.8,20.6c-0.6,0-1,0.5-1,1c0,0.6,0.5,1,1,1c0.6,0,1-0.5,1-1S27.3,20.6,26.8,20.6z M27.2,21.5 c-0.1,0-0.3-0.1-0.3-0.3c0-0.1,0.1-0.3,0.3-0.3c0.1,0,0.3,0.1,0.3,0.3S27.4,21.5,27.2,21.5z M19.3,18.9c0,0-0.9-0.4-1.7,0.1 c-0.9,0.5-0.8,1.1-0.8,1.1s-0.5-1,0.8-1.5C18.7,18.1,19.3,18.9,19.3,18.9 M27.4,18.8c0,0-0.6-0.4-1.1-0.4c-1,0-1.3,0.5-1.3,0.5 s0.2-1.1,1.5-0.9C27.1,18.2,27.4,18.8,27.4,18.8"></path><path fill="#8bc34a" d="M23.3,35.7c0,0-4.3-2.3-4.4-1.4c-0.1,0.9,0,4.7,0.5,5s4.1-1.9,4.1-1.9L23.3,35.7z M25,35.6 c0,0,2.9-2.2,3.6-2.1c0.6,0.1,0.8,4.7,0.2,4.9c-0.6,0.2-3.9-1.2-3.9-1.2L25,35.6z"></path><path fill="#689f38" d="M22.5,35.7c0,1.5-0.2,2.1,0.4,2.3c0.6,0.1,1.9,0,2.3-0.3c0.4-0.3,0.1-2.2-0.1-2.6 C25,34.8,22.5,35.1,22.5,35.7"></path><path fill="#ffca28" d="M22.3,26.8c0.1-0.7,2-2.1,3.3-2.2c1.3-0.1,1.7-0.1,2.8-0.3c1.1-0.3,3.9-1,4.7-1.3 c0.8-0.4,4.1,0.2,1.8,1.5c-1,0.6-3.7,1.6-5.7,2.2c-1.9,0.6-3.1-0.6-3.8,0.4c-0.5,0.8-0.1,1.8,2.2,2c3.1,0.3,6.2-1.4,6.5-0.5 c0.3,0.9-2.7,2-4.6,2.1c-1.8,0-5.6-1.2-6.1-1.6C22.9,28.7,22.2,27.8,22.3,26.8"></path></svg>`,
      url: 'https://duckduckgo.com/?q=',
    },
  };

  // 获取DOM元素 - 基本元素
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

  // 移除预加载类，允许CSS过渡效果
  document.documentElement.classList.remove('preload');

  // 应用从localStorage读取的主题设置
  if (document.documentElement.classList.contains('theme-preload')) {
    document.documentElement.classList.remove('theme-preload');
    document.body.classList.add('light-theme');
    isLightTheme = true;
  }

  // 应用从localStorage读取的侧边栏状态
  if (document.documentElement.classList.contains('sidebar-collapsed-preload')) {
    document.documentElement.classList.remove('sidebar-collapsed-preload');
    sidebar.classList.add('collapsed');
    content.classList.add('expanded');
    isSidebarCollapsed = true;
  }

  // 即时移除loading类，确保侧边栏可见
  document.body.classList.remove('loading');
  document.body.classList.add('loaded');

  // 侧边栏折叠功能
  function toggleSidebarCollapse() {
    // 仅在交互时启用布局相关动画，避免首屏闪烁
    document.documentElement.classList.add('with-anim');

    isSidebarCollapsed = !isSidebarCollapsed;

    // 使用 requestAnimationFrame 确保平滑过渡
    requestAnimationFrame(() => {
      sidebar.classList.toggle('collapsed', isSidebarCollapsed);
      content.classList.toggle('expanded', isSidebarCollapsed);

      // 保存折叠状态到localStorage
      localStorage.setItem('sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
    });
  }

  // 初始化侧边栏折叠状态 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initSidebarState() {
    // 从localStorage获取侧边栏状态
    const savedState = localStorage.getItem('sidebarCollapsed');

    // 图标状态与折叠状态保持一致
    if (savedState === 'true' && !isMobile()) {
      isSidebarCollapsed = true;
    } else {
      isSidebarCollapsed = false;
    }
  }

  // 侧边栏折叠按钮点击事件
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebarCollapse);
  }

  // 主题切换功能
  function toggleTheme() {
    isLightTheme = !isLightTheme;
    document.body.classList.toggle('light-theme', isLightTheme);

    // 更新图标
    if (isLightTheme) {
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    } else {
      themeIcon.classList.remove('fa-sun');
      themeIcon.classList.add('fa-moon');
    }

    // 保存主题偏好到localStorage
    localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
  }

  // 初始化主题 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initTheme() {
    // 从localStorage获取主题偏好
    const savedTheme = localStorage.getItem('theme');

    // 更新图标状态以匹配当前主题
    if (savedTheme === 'light') {
      isLightTheme = true;
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    } else {
      isLightTheme = false;
      themeIcon.classList.remove('fa-sun');
      themeIcon.classList.add('fa-moon');
    }
  }

  // 主题切换按钮点击事件
  themeToggle.addEventListener('click', toggleTheme);

  // 初始化搜索索引
  function initSearchIndex() {
    if (searchIndex.initialized) return;

    searchIndex.items = [];

    try {
      // 为每个页面创建索引
      if (!pages) {
        pages = document.querySelectorAll('.page');
      }

      pages.forEach((page) => {
        if (page.id === 'search-results') return;

        const pageId = page.id;

        page.querySelectorAll('.site-card').forEach((card) => {
          try {
            // 排除“扩展写回影子结构”等不应参与搜索的卡片
            if (card.closest('[data-search-exclude="true"]')) return;

            // 兼容不同页面/卡片样式：优先取可见文本，其次回退到 data-*（确保 projects repo 卡片也能被搜索）
            const dataTitle = card.dataset?.name || card.getAttribute('data-name') || '';
            const dataDescription =
              card.dataset?.description || card.getAttribute('data-description') || '';

            const titleText =
              card.querySelector('h3')?.textContent ||
              card.querySelector('.repo-title')?.textContent ||
              dataTitle;
            const descriptionText =
              card.querySelector('p')?.textContent ||
              card.querySelector('.repo-desc')?.textContent ||
              dataDescription;

            const title = String(titleText || '').toLowerCase();
            const description = String(descriptionText || '').toLowerCase();
            const url = card.href || card.getAttribute('href') || '#';
            const icon =
              card.querySelector('i.icon-fallback')?.className ||
              card.querySelector('i')?.className ||
              '';

            // 将卡片信息添加到索引中
            searchIndex.items.push({
              pageId,
              title,
              description,
              url,
              icon,
              element: card,
              // 预先计算搜索文本，提高搜索效率
              searchText: (title + ' ' + description).toLowerCase(),
            });
          } catch (cardError) {
            console.error('Error processing card:', cardError);
          }
        });
      });

      searchIndex.initialized = true;
    } catch (error) {
      console.error('Error initializing search index:', error);
      searchIndex.initialized = true; // 防止反复尝试初始化
    }
  }

  // 移动端菜单切换
  function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    sidebar.classList.toggle('active', isSidebarOpen);
    overlay.classList.toggle('active', isSidebarOpen);
  }

  // 移动端：搜索框常驻显示（CSS 控制），无需“搜索面板”开关；点击仅聚焦输入框
  function toggleSearch() {
    searchInput && searchInput.focus();
  }

  // 关闭所有移动端面板
  function closeAllPanels() {
    if (isSidebarOpen) {
      toggleSidebar();
    }
  }

  // 移动端事件监听
  menuToggle.addEventListener('click', toggleSidebar);
  searchToggle.addEventListener('click', toggleSearch);
  overlay.addEventListener('click', closeAllPanels);

  // 全局快捷键：Ctrl/Cmd + K 聚焦搜索
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    if (key !== 'k') return;
    if ((!e.ctrlKey && !e.metaKey) || e.altKey) return;

    const target = e.target;
    const isTypingTarget =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isTypingTarget && target !== searchInput) return;

    e.preventDefault();

    searchInput && searchInput.focus();
  });

  // 检查是否是移动设备
  function isMobile() {
    return window.innerWidth <= 768;
  }

  // 窗口大小改变时处理
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      sidebar.classList.remove('active');
      searchContainer.classList.remove('active');
      overlay.classList.remove('active');
      isSidebarOpen = false;
    } else {
      // 在移动设备下，重置侧边栏折叠状态
      sidebar.classList.remove('collapsed');
      content.classList.remove('expanded');
    }
  });

  // 页面切换功能
  function showPage(pageId, skipSearchReset = false) {
    if (currentPageId === pageId && !skipSearchReset && !isInitialLoad) return;

    currentPageId = pageId;

    // 使用 RAF 确保动画流畅
    requestAnimationFrame(() => {
      if (!pages) {
        pages = document.querySelectorAll('.page');
      }

      pages.forEach((page) => {
        const shouldBeActive = page.id === pageId;
        if (shouldBeActive !== page.classList.contains('active')) {
          page.classList.toggle('active', shouldBeActive);
        }
      });

      // 初始加载完成后设置标志
      if (isInitialLoad) {
        isInitialLoad = false;
        document.body.classList.add('loaded');
      }
    });

    // 重置滚动位置并更新进度条
    content.scrollTop = 0;

    // 只有在非搜索状态下才重置搜索
    if (!skipSearchReset) {
      searchInput.value = '';
      resetSearch();
    }
  }

  // 搜索功能
  function performSearch(searchTerm) {
    // 确保搜索索引已初始化
    if (!searchIndex.initialized) {
      initSearchIndex();
    }

    searchTerm = searchTerm.toLowerCase().trim();

    // 如果搜索框为空，重置所有内容
    if (!searchTerm) {
      resetSearch();
      return;
    }

    if (!isSearchActive) {
      isSearchActive = true;
    }

    try {
      // 使用搜索索引进行搜索
      const searchResults = new Map();
      let hasResults = false;

      // 使用更高效的搜索算法
      const matchedItems = searchIndex.items.filter((item) => {
        return (
          item.searchText.includes(searchTerm) || PinyinMatch.match(item.searchText, searchTerm)
        );
      });

      // 按页面分组结果
      matchedItems.forEach((item) => {
        if (!searchResults.has(item.pageId)) {
          searchResults.set(item.pageId, []);
        }
        // 克隆元素以避免修改原始DOM
        searchResults.get(item.pageId).push(item.element.cloneNode(true));
        hasResults = true;
      });

      // 使用requestAnimationFrame批量更新DOM，减少重排重绘
      requestAnimationFrame(() => {
        try {
          // 清空并隐藏所有搜索区域
          searchSections.forEach((section) => {
            try {
              const grid = section.querySelector('.sites-grid');
              if (grid) {
                grid.innerHTML = ''; // 使用innerHTML清空，比removeChild更高效
              }
              section.style.display = 'none';
            } catch (sectionError) {
              console.error('Error clearing search section');
            }
          });

          // 使用DocumentFragment批量添加DOM元素，减少重排
          searchResults.forEach((matches, pageId) => {
            const section = searchResultsPage.querySelector(`[data-section="${pageId}"]`);
            if (section) {
              try {
                const grid = section.querySelector('.sites-grid');
                if (grid) {
                  const fragment = document.createDocumentFragment();

                  matches.forEach((card) => {
                    // 高亮匹配文本
                    highlightSearchTerm(card, searchTerm);
                    fragment.appendChild(card);
                  });

                  grid.appendChild(fragment);
                  section.style.display = 'block';
                }
              } catch (gridError) {
                console.error('Error updating search results grid');
              }
            }
          });

          // 更新搜索结果页面状态
          const subtitle = searchResultsPage.querySelector('.subtitle');
          if (subtitle) {
            subtitle.textContent = hasResults
              ? `在所有页面中找到 ${matchedItems.length} 个匹配项`
              : '未找到匹配的结果';
          }

          // 显示搜索结果页面
          if (currentPageId !== 'search-results') {
            currentPageId = 'search-results';
            pages.forEach((page) => {
              page.classList.toggle('active', page.id === 'search-results');
            });
          }

          // 更新搜索状态样式
          searchBox.classList.toggle('has-results', hasResults);
          searchBox.classList.toggle('no-results', !hasResults);
        } catch (uiError) {
          console.error('Error updating search UI');
        }
      });
    } catch (searchError) {
      console.error('Error performing search');
    }
  }

  // 高亮搜索匹配文本
  function highlightSearchTerm(card, searchTerm) {
    if (!card || !searchTerm) return;

    try {
      // 兼容 projects repo 卡片：title/desc 不一定是 h3/p
      const titleElement = card.querySelector('h3') || card.querySelector('.repo-title');
      const descriptionElement = card.querySelector('p') || card.querySelector('.repo-desc');

      const hasPinyinMatch =
        typeof PinyinMatch !== 'undefined' &&
        PinyinMatch &&
        typeof PinyinMatch.match === 'function';

      const applyRangeHighlight = (element, start, end) => {
        const text = element.textContent || '';
        const safeStart = Math.max(0, Math.min(text.length, start));
        const safeEnd = Math.max(safeStart, Math.min(text.length - 1, end));

        const fragment = document.createDocumentFragment();
        fragment.appendChild(document.createTextNode(text.slice(0, safeStart)));

        const span = document.createElement('span');
        span.className = 'highlight';
        span.textContent = text.slice(safeStart, safeEnd + 1);
        fragment.appendChild(span);

        fragment.appendChild(document.createTextNode(text.slice(safeEnd + 1)));

        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        element.appendChild(fragment);
      };

      const highlightInElement = (element) => {
        if (!element) return;

        const rawText = element.textContent || '';
        const lowerText = rawText.toLowerCase();
        if (!rawText) return;

        if (lowerText.includes(searchTerm)) {
          const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let match;

          while ((match = regex.exec(rawText)) !== null) {
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(rawText.substring(lastIndex, match.index))
              );
            }

            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = match[0];
            fragment.appendChild(span);

            lastIndex = match.index + match[0].length;

            // 防止无限循环
            if (regex.lastIndex === 0) break;
          }

          if (lastIndex < rawText.length) {
            fragment.appendChild(document.createTextNode(rawText.substring(lastIndex)));
          }

          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
          element.appendChild(fragment);
          return;
        }

        if (hasPinyinMatch) {
          const arr = PinyinMatch.match(rawText, searchTerm);
          if (Array.isArray(arr) && arr.length >= 2) {
            const [start, end] = arr;
            applyRangeHighlight(element, start, end);
          }
        }
      };

      highlightInElement(titleElement);
      highlightInElement(descriptionElement);
    } catch (error) {
      console.error('Error highlighting search term');
    }
  }

  // 转义正则表达式特殊字符
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 重置搜索状态
  function resetSearch() {
    if (!isSearchActive) return;

    isSearchActive = false;

    try {
      requestAnimationFrame(() => {
        try {
          // 清空搜索结果
          searchSections.forEach((section) => {
            try {
              const grid = section.querySelector('.sites-grid');
              if (grid) {
                while (grid.firstChild) {
                  grid.removeChild(grid.firstChild);
                }
              }
              section.style.display = 'none';
            } catch (sectionError) {
              console.error('Error clearing search section');
            }
          });

          // 移除搜索状态样式
          searchBox.classList.remove('has-results', 'no-results');

          // 恢复到当前激活的页面
          const currentActiveNav = document.querySelector('.nav-item.active');
          if (currentActiveNav) {
            const targetPageId = currentActiveNav.getAttribute('data-page');

            if (targetPageId && currentPageId !== targetPageId) {
              currentPageId = targetPageId;
              pages.forEach((page) => {
                page.classList.toggle('active', page.id === targetPageId);
              });
            }
          } else {
            // 如果没有激活的导航项，默认显示首页
            currentPageId = homePageId;
            pages.forEach((page) => {
              page.classList.toggle('active', page.id === homePageId);
            });
          }
        } catch (resetError) {
          console.error('Error resetting search UI');
        }
      });
    } catch (error) {
      console.error('Error in resetSearch');
    }
  }

  // 搜索输入事件（使用防抖）
  const debounce = (fn, delay) => {
    let timer = null;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    };
  };

  const debouncedSearch = debounce(performSearch, 300);

  searchInput.addEventListener('input', (e) => {
    // 只有在选择了本地搜索时，才在输入时实时显示本地搜索结果
    if (currentSearchEngine === 'local') {
      debouncedSearch(e.target.value);
    } else {
      // 对于非本地搜索，重置之前的本地搜索结果（如果有）
      if (isSearchActive) {
        resetSearch();
      }
    }
  });

  // 初始化搜索引擎设置
  function initSearchEngine() {
    // 从本地存储获取上次选择的搜索引擎
    const savedEngine = localStorage.getItem('searchEngine');
    if (savedEngine && searchEngines[savedEngine]) {
      currentSearchEngine = savedEngine;
    }

    // 设置当前搜索引擎的激活状态及图标
    updateSearchEngineUI();

    // 初始化搜索引擎下拉菜单事件
    const toggleEngineDropdown = () => {
      if (!searchEngineDropdown) return;
      const next = !searchEngineDropdown.classList.contains('active');
      searchEngineDropdown.classList.toggle('active', next);
      if (searchBox) {
        searchBox.classList.toggle('dropdown-open', next);
      }
      if (searchEngineToggle) {
        searchEngineToggle.setAttribute('aria-expanded', String(next));
      }
    };

    if (searchEngineToggle) {
      searchEngineToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEngineDropdown();
      });

      // 键盘可访问性：Enter/Space 触发
      searchEngineToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleEngineDropdown();
        }
      });
    }

    // 点击搜索引擎选项
    searchEngineOptions.forEach((option) => {
      // 初始化激活状态
      if (option.getAttribute('data-engine') === currentSearchEngine) {
        option.classList.add('active');
      }

      option.addEventListener('click', (e) => {
        e.stopPropagation();

        // 获取选中的搜索引擎
        const engine = option.getAttribute('data-engine');

        // 更新当前搜索引擎
        if (engine && searchEngines[engine]) {
          // 如果搜索引擎变更，且之前有活跃的本地搜索结果，重置搜索状态
          if (currentSearchEngine !== engine && isSearchActive) {
            resetSearch();
          }

          currentSearchEngine = engine;
          localStorage.setItem('searchEngine', engine);

          // 更新UI显示
          updateSearchEngineUI();

          // 关闭下拉菜单
          if (searchEngineDropdown) {
            searchEngineDropdown.classList.remove('active');
          }
          if (searchBox) {
            searchBox.classList.remove('dropdown-open');
          }
        }
      });
    });

    // 点击页面其他位置关闭下拉菜单
    document.addEventListener('click', () => {
      if (!searchEngineDropdown) return;
      searchEngineDropdown.classList.remove('active');
      if (searchBox) {
        searchBox.classList.remove('dropdown-open');
      }
    });
  }

  // 更新搜索引擎UI显示
  function updateSearchEngineUI() {
    // 移除所有选项的激活状态
    searchEngineOptions.forEach((option) => {
      option.classList.remove('active');

      // 如果是当前选中的搜索引擎，添加激活状态
      if (option.getAttribute('data-engine') === currentSearchEngine) {
        option.classList.add('active');
      }
    });

    // 更新搜索引擎按钮（方案B：前缀按钮显示当前引擎）
    const engine = searchEngines[currentSearchEngine];
    if (!engine) return;
    const displayName = engine.shortName || engine.name.replace(/搜索$/, '');

    if (searchEngineToggleIcon) {
      if (engine.iconSvg) {
        searchEngineToggleIcon.className = 'search-engine-icon search-engine-icon-svg';
        searchEngineToggleIcon.innerHTML = engine.iconSvg;
      } else {
        searchEngineToggleIcon.innerHTML = '';
        searchEngineToggleIcon.className = `search-engine-icon ${engine.icon}`;
      }
    }
    if (searchEngineToggleLabel) {
      searchEngineToggleLabel.textContent = displayName;
    }
    if (searchEngineToggle) {
      searchEngineToggle.setAttribute('aria-label', `当前搜索引擎：${engine.name}，点击切换`);
    }
  }

  // 执行搜索（根据选择的搜索引擎）
  function executeSearch(searchTerm) {
    if (!searchTerm.trim()) return;

    // 根据当前搜索引擎执行搜索
    if (currentSearchEngine === 'local') {
      // 执行本地搜索
      performSearch(searchTerm);
    } else {
      // 使用外部搜索引擎
      const engine = searchEngines[currentSearchEngine];
      if (engine && engine.url) {
        // 打开新窗口进行搜索
        window.open(engine.url + encodeURIComponent(searchTerm), '_blank');
      }
    }
  }

  // 搜索框事件处理
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      resetSearch();
    } else if (e.key === 'Enter') {
      executeSearch(searchInput.value);
    }
  });

  // 阻止搜索框的回车默认行为
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  });

  // 初始化
  window.addEventListener('load', () => {
    // 获取可能在HTML生成后才存在的DOM元素
    const siteCards = document.querySelectorAll('.site-card');
    const categories = document.querySelectorAll('.category');
    const navItems = document.querySelectorAll('.nav-item');
    const navItemWrappers = document.querySelectorAll('.nav-item-wrapper');
    const submenuItems = document.querySelectorAll('.submenu-item');
    pages = document.querySelectorAll('.page');

    // 方案 A：用 ?page=<id> 作为页面深链接（兼容 GitHub Pages 静态托管）
    const normalizeText = (value) =>
      String(value === null || value === undefined ? '' : value).trim();

    const isValidPageId = (pageId) => {
      const id = normalizeText(pageId);
      if (!id) return false;
      const el = document.getElementById(id);
      return Boolean(el && el.classList && el.classList.contains('page'));
    };

    const getRawPageIdFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        return normalizeText(url.searchParams.get('page'));
      } catch (error) {
        return '';
      }
    };

    const getPageIdFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        const pageId = normalizeText(url.searchParams.get('page'));
        return isValidPageId(pageId) ? pageId : '';
      } catch (error) {
        return '';
      }
    };

    const setUrlState = (next, options = {}) => {
      const { replace = true } = options;
      try {
        const url = new URL(window.location.href);

        if (next && typeof next.pageId === 'string') {
          const pageId = normalizeText(next.pageId);
          if (pageId) {
            url.searchParams.set('page', pageId);
          } else {
            url.searchParams.delete('page');
          }
        }

        if (next && Object.prototype.hasOwnProperty.call(next, 'hash')) {
          const hash = normalizeText(next.hash);
          url.hash = hash ? `#${hash}` : '';
        }

        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        const fn = replace ? history.replaceState : history.pushState;
        fn.call(history, null, '', nextUrl);
      } catch (error) {
        // 忽略 URL/History API 异常，避免影响主流程
      }
    };

    const setActiveNavByPageId = (pageId) => {
      const id = normalizeText(pageId);
      let activeItem = null;

      navItems.forEach((nav) => {
        const isActive = nav.getAttribute('data-page') === id;
        nav.classList.toggle('active', isActive);
        if (isActive) activeItem = nav;
      });

      // 同步子菜单展开状态：只展开当前激活项
      navItemWrappers.forEach((wrapper) => {
        const nav = wrapper.querySelector('.nav-item');
        if (!nav) return;
        const hasSubmenu = Boolean(wrapper.querySelector('.submenu'));
        const shouldExpand = hasSubmenu && nav === activeItem;
        wrapper.classList.toggle('expanded', shouldExpand);
      });
    };

    const escapeSelector = (value) => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(text);
      // 回退：尽量避免打断选择器（不追求完全覆盖所有边界字符）
      return text.replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, '\\$&');
    };

    const escapeAttrValue = (value) => {
      if (value === null || value === undefined) return '';
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };

    const getHashFromUrl = () => {
      const rawHash = window.location.hash ? String(window.location.hash).slice(1) : '';
      if (!rawHash) return '';
      try {
        return decodeURIComponent(rawHash).trim();
      } catch (error) {
        return rawHash.trim();
      }
    };

    const scrollToCategoryInPage = (pageId, options = {}) => {
      const id = normalizeText(pageId);
      if (!id) return false;

      const targetPage = document.getElementById(id);
      if (!targetPage) return false;

      const categoryId = normalizeText(options.categoryId);
      const categoryName = normalizeText(options.categoryName);

      let targetCategory = null;

      // 优先使用 slug/data-id 精准定位（解决重复命名始终命中第一个的问题）
      if (categoryId) {
        const escapedId = escapeSelector(categoryId);
        targetCategory =
          targetPage.querySelector(`#${escapedId}`) ||
          targetPage.querySelector(
            `[data-type="category"][data-id="${escapeAttrValue(categoryId)}"]`
          );
      }

      // 回退：旧逻辑按文本包含匹配（兼容旧页面/旧数据）
      if (!targetCategory && categoryName) {
        targetCategory = Array.from(targetPage.querySelectorAll('.category h2')).find((heading) =>
          heading.textContent.trim().includes(categoryName)
        );
      }

      if (!targetCategory) return false;

      // 优化的滚动实现：滚动到使目标分类位于视口1/4处（更靠近顶部位置）
      try {
        // 直接获取所需元素和属性，减少重复查询
        const contentElement = document.querySelector('.content');

        if (contentElement && contentElement.scrollHeight > contentElement.clientHeight) {
          // 获取目标元素相对于内容区域的位置
          const rect = targetCategory.getBoundingClientRect();
          const containerRect = contentElement.getBoundingClientRect();

          // 计算目标应该在视口中的位置（视口高度的1/4处）
          const desiredPosition = containerRect.height / 4;

          // 计算需要滚动的位置
          const scrollPosition =
            contentElement.scrollTop + rect.top - containerRect.top - desiredPosition;

          // 执行滚动
          contentElement.scrollTo({
            top: scrollPosition,
            behavior: 'smooth',
          });
        } else {
          // 回退到基本滚动方式
          targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        console.error('Error during scroll:', error);
        // 回退到基本滚动方式
        targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      return true;
    };

    // 初始化主题
    initTheme();

    // 初始化侧边栏状态
    initSidebarState();

    // 初始化搜索引擎选择
    initSearchEngine();

    // 初始化MeNav对象版本信息
    try {
      const config = window.MeNav.getConfig();
      if (config && config.version) {
        window.MeNav.version = config.version;
        console.log('MeNav API initialized with version:', config.version);
      }
    } catch (error) {
      console.error('Error initializing MeNav API:', error);
    }

    // 立即执行初始化，不再使用requestAnimationFrame延迟
    // 支持 ?page=<id> 直接打开对应页面；无效时回退到首页
    const rawPageIdFromUrl = getRawPageIdFromUrl();
    const validatedPageIdFromUrl = getPageIdFromUrl();
    const initialPageId = validatedPageIdFromUrl || (isValidPageId(homePageId) ? homePageId : 'home');

    setActiveNavByPageId(initialPageId);
    showPage(initialPageId);

    // 当输入了不存在的 page id 时，自动纠正 URL，避免“内容回退但地址栏仍错误”
    if (rawPageIdFromUrl && !validatedPageIdFromUrl) {
      setUrlState({ pageId: initialPageId }, { replace: true });
    }

    // 初始深链接：支持 ?page=<id>#<categorySlug>
    const initialHash = getHashFromUrl();
    if (initialHash) {
      setTimeout(() => {
        const found = scrollToCategoryInPage(initialPageId, {
          categoryId: initialHash,
          categoryName: initialHash,
        });

        // hash 存在但未命中时，不做强制修正，避免误伤其他用途的 hash
        if (!found) return;
      }, 50);
    }

    // 添加载入动画
    categories.forEach((category, index) => {
      setTimeout(() => {
        category.style.opacity = '1';
      }, index * 100);
    });

    // 初始展开当前页面的子菜单：高亮项如果有子菜单，需要同步展开
    document.querySelectorAll('.nav-item.active').forEach((activeItem) => {
      const activeWrapper = activeItem.closest('.nav-item-wrapper');
      if (!activeWrapper) return;

      const hasSubmenu = activeWrapper.querySelector('.submenu');
      if (hasSubmenu) {
        activeWrapper.classList.add('expanded');
      }
    });

    // 导航项点击效果
    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        if (item.getAttribute('target') === '_blank') return;

        e.preventDefault();

        // 获取当前项的父级wrapper
        const wrapper = item.closest('.nav-item-wrapper');
        const hasSubmenu = wrapper && wrapper.querySelector('.submenu');

        // 处理子菜单展开/折叠
        if (hasSubmenu) {
          // 如果点击的导航项已经激活且有子菜单，则切换子菜单展开状态
          if (item.classList.contains('active')) {
            wrapper.classList.toggle('expanded');
          } else {
            // 关闭所有已展开的子菜单
            navItemWrappers.forEach((navWrapper) => {
              if (navWrapper !== wrapper) {
                navWrapper.classList.remove('expanded');
              }
            });

            // 展开当前子菜单
            wrapper.classList.add('expanded');
          }
        }

        // 激活导航项
        navItems.forEach((nav) => {
          nav.classList.toggle('active', nav === item);
        });

        const pageId = item.getAttribute('data-page');
        if (pageId) {
          const prevPageId = currentPageId;
          showPage(pageId);
          // 切换页面时同步 URL（清空旧 hash，避免跨页残留）
          if (normalizeText(prevPageId) !== normalizeText(pageId)) {
            setUrlState({ pageId, hash: '' }, { replace: true });
          }

          // 在移动端视图下点击导航项后自动收起侧边栏
          if (isMobile() && isSidebarOpen && !hasSubmenu) {
            closeAllPanels();
          }
        }
      });
    });

    // 子菜单项点击效果
    submenuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        // 获取页面ID和分类名称
        const pageId = item.getAttribute('data-page');
        const categoryName = item.getAttribute('data-category');
        const categoryId = item.getAttribute('data-category-id');

        if (pageId) {
          // 清除所有子菜单项的激活状态
          submenuItems.forEach((subItem) => {
            subItem.classList.remove('active');
          });

          // 激活当前子菜单项
          item.classList.add('active');

          // 激活相应的导航项
          navItems.forEach((nav) => {
            nav.classList.toggle('active', nav.getAttribute('data-page') === pageId);
          });

          // 显示对应页面
          showPage(pageId);
          // 先同步 page 参数并清空旧 hash，避免跨页残留；后续若找到分类再写入新的 hash
          setUrlState({ pageId, hash: '' }, { replace: true });

          // 等待页面切换完成后滚动到对应分类
          setTimeout(() => {
            const found = scrollToCategoryInPage(pageId, { categoryId, categoryName });
            if (!found) return;

            // 由于对子菜单 click 做了 preventDefault，这里手动同步 hash（不触发浏览器默认跳转）
            const nextHash = normalizeText(categoryId) || normalizeText(categoryName);
            if (nextHash) {
              setUrlState({ pageId, hash: nextHash }, { replace: true });
            }
          }, 25); // 延迟时间

          // 在移动端视图下点击子菜单项后自动收起侧边栏
          if (isMobile() && isSidebarOpen) {
            closeAllPanels();
          }
        }
      });
    });

    // 初始化嵌套分类功能
    initializeNestedCategories();

    // 初始化分类切换按钮
    const categoryToggleBtn = document.getElementById('category-toggle');
    if (categoryToggleBtn) {
      categoryToggleBtn.addEventListener('click', function () {
        window.MeNav.toggleCategories();
      });
    } else {
      console.error('Category toggle button not found');
    }

    // 初始化搜索索引（使用requestIdleCallback或setTimeout延迟初始化，避免影响页面加载）
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => initSearchIndex());
    } else {
      setTimeout(initSearchIndex, 1000);
    }
  });
});

// Tooltip functionality for truncated text（仅桌面端/支持悬停设备启用）
document.addEventListener('DOMContentLoaded', () => {
  const hoverMedia = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');

  if (!hoverMedia) {
    return;
  }

  let cleanupTooltip = null;

  function enableTooltip() {
    if (cleanupTooltip) return;

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    document.body.appendChild(tooltip);

    let activeElement = null;

    function updateTooltipPosition() {
      if (!activeElement) return;

      const rect = activeElement.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const gap = 10; // 卡片与Tooltip的间距

      // 默认显示在卡片下方
      let top = rect.bottom + gap;
      // 水平居中对齐
      let left = rect.left + (rect.width - tooltipRect.width) / 2;

      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;

      // 垂直边界检查：如果下方空间不足，尝试显示在上方
      if (top + tooltipRect.height > winHeight - gap) {
        top = rect.top - tooltipRect.height - gap;
      }

      // 水平边界检查：防止溢出屏幕左右边界
      if (left < gap) {
        left = gap;
      } else if (left + tooltipRect.width > winWidth - gap) {
        left = winWidth - tooltipRect.width - gap;
      }

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    // Show tooltip on hover
    function onMouseOver(e) {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;

      const tooltipText = target.getAttribute('data-tooltip');
      if (!tooltipText) return;

      activeElement = target;
      tooltip.textContent = tooltipText;
      tooltip.classList.add('visible');
      // 先显示元素让浏览器计算尺寸，然后立即更新位置
      updateTooltipPosition();
    }

    // Hide tooltip on mouse out
    function onMouseOut(e) {
      const target = e.target.closest('[data-tooltip]');
      if (!target || target !== activeElement) return;

      // Check if we really left the element (not just went to a child)
      if (target.contains(e.relatedTarget)) return;

      activeElement = null;
      tooltip.classList.remove('visible');
    }

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);

    cleanupTooltip = () => {
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);

      activeElement = null;
      tooltip.classList.remove('visible');
      tooltip.remove();
    };
  }

  function disableTooltip() {
    if (!cleanupTooltip) return;
    cleanupTooltip();
    cleanupTooltip = null;
  }

  function syncTooltipEnabled() {
    if (hoverMedia.matches) {
      enableTooltip();
    } else {
      disableTooltip();
    }
  }

  syncTooltipEnabled();

  // 兼容旧版 Safari：addListener/removeListener
  if (hoverMedia.addEventListener) {
    hoverMedia.addEventListener('change', syncTooltipEnabled);
  } else if (hoverMedia.addListener) {
    hoverMedia.addListener(syncTooltipEnabled);
  }
});
