// 生成端主实现（由 src/generator.js 薄入口加载并 re-export）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  loadHandlebarsTemplates,
  getDefaultLayoutTemplate,
  renderTemplate,
} = require('./template/engine');
const { MENAV_EXTENSION_CONFIG_FILE, loadConfig, getSubmenuForNavItem } = require('./config');

const {
  generateNavigation,
  generateCategories,
  generateSocialLinks,
} = require('./html/components');
const { generate404Html } = require('./html/404');
const { generateFontLinks, generateFontCss } = require('./html/fonts');
const { preparePageData } = require('./html/page-data');
const { collectSitesRecursively } = require('./utils/sites');
const {
  BuildError,
  ConfigError,
  FileError,
  TemplateError,
  wrapAsyncError,
} = require('./utils/errors');
const { createLogger, isVerbose, startTimer } = require('./utils/logger');

/**
 * 渲染单个页面
 * @param {string} pageId 页面ID
 * @param {Object} config 配置数据
 * @returns {string} 渲染后的HTML
 */
function renderPage(pageId, config) {
  const { data, templateName } = preparePageData(pageId, config);
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

  // 准备导航数据，添加 submenu 字段
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
    configJSON: config.configJSON, // 从 prepareRenderData 函数中获取的配置数据
  };

  try {
    // 使用辅助函数获取默认布局模板
    const { template: layoutTemplate } = getDefaultLayoutTemplate();

    // 渲染模板
    return layoutTemplate(layoutData);
  } catch (error) {
    throw error;
  }
}

/**
 * 使用 esbuild bundle 模式合并 CSS @import
 * 注意：transformSync 不支持 bundle，必须用 buildSync
 * @param {string} srcPath - 源 CSS 文件路径
 * @param {string} destPath - 目标文件路径
 * @returns {boolean} 是否成功
 */
function tryBundleCss(srcPath, destPath) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
    return false;
  }

  try {
    // buildSync 需要绝对路径
    const absoluteSrc = path.resolve(srcPath);
    const absoluteDest = path.resolve(destPath);

    esbuild.buildSync({
      entryPoints: [absoluteSrc],
      outfile: absoluteDest,
      bundle: true, // 关键：合并 @import
      minify: true,
      logLevel: 'silent',
    });
    return true;
  } catch (error) {
    const log = createLogger('assets');
    log.warn('CSS bundle 失败，降级为复制', {
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    return false;
  }
}

/**
 * 递归复制目录（降级方案：当 esbuild 不可用时复制 styles 目录）
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
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
    const log = createLogger('assets');
    log.warn('压缩静态资源失败，已降级为原文件', {
      path: srcPath,
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    return false;
  }
}

// 复制静态文件
function copyStaticFiles(config) {
  const log = createLogger('assets');

  // 确保 dist 目录存在
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // 复制 CSS 文件（支持模块化 @import）
  try {
    if (!tryBundleCss('assets/style.css', 'dist/style.css')) {
      // 降级：复制入口 + styles 目录
      fs.copyFileSync('assets/style.css', 'dist/style.css');
      copyDirRecursive('assets/styles', 'dist/styles');
      log.warn('CSS 未合并，浏览器将发起多个请求');
    }
  } catch (e) {
    log.error('复制 style.css 失败', { message: e && e.message ? e.message : String(e) });
    if (isVerbose() && e && e.stack) console.error(e.stack);
  }

  try {
    if (!tryMinifyStaticAsset('assets/pinyin-match.js', 'dist/pinyin-match.js', 'js')) {
      fs.copyFileSync('assets/pinyin-match.js', 'dist/pinyin-match.js');
    }
  } catch (e) {
    log.error('复制 pinyin-match.js 失败', { message: e && e.message ? e.message : String(e) });
    if (isVerbose() && e && e.stack) console.error(e.stack);
  }

  // dist/script.js 由构建阶段 runtime bundle 产出（scripts/build-runtime.js），这里不再复制/覆盖

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
        log.warn('faviconUrl 本地文件不存在', { path: normalized });
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
    log.error('复制 faviconUrl 本地资源失败', { message: e && e.message ? e.message : String(e) });
    if (isVerbose() && e && e.stack) console.error(e.stack);
  }

  // 如果配置了 favicon，确保文件存在并复制
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
        log.warn('favicon 文件不存在', { path: config.site.favicon });
      }
    } catch (e) {
      log.error('复制 favicon 失败', { message: e && e.message ? e.message : String(e) });
      if (isVerbose() && e && e.stack) console.error(e.stack);
    }
  }
}

// 主函数
function main() {
  const cmdLog = createLogger('generate');
  const configLog = createLogger('config');
  const renderLog = createLogger('render');
  const elapsedMs = startTimer();

  cmdLog.info('开始', { version: process.env.npm_package_version });

  let source = 'unknown';
  if (fs.existsSync('config/user')) source = 'config/user';
  else if (fs.existsSync('config/_default')) source = 'config/_default';
  configLog.info('加载模块化配置', { source });

  const config = loadConfig();

  try {
    // 确保 dist 目录存在
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist', { recursive: true });
    }

    renderLog.info('生成页面', {
      pages: Array.isArray(config.navigation) ? config.navigation.length : 0,
    });

    // 初始化 Handlebars 模板系统
    loadHandlebarsTemplates();

    // 使用 generateHTML 函数生成完整的 HTML
    const htmlContent = generateHTML(config);

    // 生成 HTML
    fs.writeFileSync('dist/index.html', htmlContent);

    // 扩展专用配置：独立静态文件（按需加载）
    try {
      const extensionConfig =
        config && config.extensionConfig ? JSON.stringify(config.extensionConfig, null, 2) : '';
      if (extensionConfig) {
        fs.writeFileSync(path.join('dist', MENAV_EXTENSION_CONFIG_FILE), extensionConfig);
      }
    } catch (error) {
      cmdLog.warn('写入扩展配置文件失败（不影响页面渲染）', {
        message: error && error.message ? error.message : String(error),
      });
      if (isVerbose() && error && error.stack) console.error(error.stack);
    }

    // GitHub Pages 静态路由回退：用于支持 /<id> 形式的路径深链接
    fs.writeFileSync('dist/404.html', generate404Html(config));

    // 构建运行时脚本（bundle → dist/script.js）
    try {
      execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'build-runtime.js')], {
        stdio: 'inherit',
      });
    } catch (error) {
      throw new BuildError('构建运行时脚本失败', {
        脚本路径: 'scripts/build-runtime.js',
        错误信息: error.message,
      });
    }

    // 复制静态文件
    copyStaticFiles(config);

    cmdLog.ok('完成', { ms: elapsedMs(), dist: 'dist/' });
  } catch (e) {
    // 如果是自定义错误，直接抛出，保留上下文/路径信息
    if (
      e instanceof ConfigError ||
      e instanceof TemplateError ||
      e instanceof BuildError ||
      e instanceof FileError
    ) {
      throw e;
    }

    // 否则包装为 BuildError（避免直接暴露底层异常）
    throw new BuildError('构建过程中发生错误', {
      错误类型: e.name || 'Error',
      错误信息: e.message || '未知错误',
    });
  }
}

if (require.main === module) {
  // 使用 wrapAsyncError 包装主函数，自动处理错误
  wrapAsyncError(main)();
}

// 导出供测试使用的函数
module.exports = {
  main,
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
