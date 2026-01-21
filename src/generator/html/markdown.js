const MarkdownIt = require('markdown-it');

/**
 * 构建期 Markdown 渲染器（用于内容页 template: content）
 *
 * 约束：
 * - 禁止 raw HTML（避免 XSS）
 * - 禁止图片（本期不支持图片/附件）
 * - 链接 href 必须通过安全策略校验（沿用 safeUrl 的 scheme 白名单思想）
 */

function normalizeAllowedSchemes(allowedSchemes) {
  if (!Array.isArray(allowedSchemes) || allowedSchemes.length === 0) {
    return ['http', 'https', 'mailto', 'tel'];
  }
  return allowedSchemes
    .map((s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/:$/, '')
    )
    .filter(Boolean);
}

function isRelativeUrl(url) {
  const s = String(url || '').trim();
  return (
    s.startsWith('#') ||
    s.startsWith('/') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('?')
  );
}

/**
 * 将 href 按 MeNav 安全策略清洗为可点击链接
 * @param {string} href 原始 href
 * @param {string[]} allowedSchemes 允许的 scheme 列表（不含冒号）
 * @returns {string} 安全 href（不安全时返回 '#'
 */
function sanitizeLinkHref(href, allowedSchemes) {
  const raw = String(href || '').trim();
  if (!raw) return '#';
  if (isRelativeUrl(raw)) return raw;

  // 明确拒绝协议相对 URL（//example.com），避免绕过策略
  if (raw.startsWith('//')) return '#';

  try {
    const parsed = new URL(raw);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    return allowedSchemes.includes(scheme) ? raw : '#';
  } catch {
    return '#';
  }
}

function createMarkdownIt({ allowedSchemes }) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });

  // markdown-it 默认会拒绝 javascript: 等链接，并导致其不被渲染为 <a>
  // 我们这里统一“允许渲染，但在 renderer 层做 href 安全降级”。
  md.validateLink = () => true;

  // 本期明确不支持图片
  md.disable('image');

  const normalizedSchemes = normalizeAllowedSchemes(allowedSchemes);
  const defaultRender = md.renderer.rules.link_open;

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const originalHref = token.attrs[hrefIndex][1];
      token.attrs[hrefIndex][1] = sanitizeLinkHref(originalHref, normalizedSchemes);
    }

    return defaultRender
      ? defaultRender(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md;
}

/**
 * @param {string} markdownText markdown 原文
 * @param {{allowedSchemes?: string[]}} opts
 * @returns {string} HTML（不包含外层 layout）
 */
function renderMarkdownToHtml(markdownText, opts = {}) {
  const md = createMarkdownIt({ allowedSchemes: opts.allowedSchemes });
  return md.render(String(markdownText || ''));
}

module.exports = {
  sanitizeLinkHref,
  renderMarkdownToHtml,
};
