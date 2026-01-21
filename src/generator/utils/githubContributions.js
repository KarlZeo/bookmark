/**
 * 从 GitHub contributions 页面 HTML 中提取 `.js-yearly-contributions` 的 innerHTML。
 *
 * 说明：
 * - 该页面是 HTML（非稳定 API），结构可能变化；这里做 best-effort 解析。
 * - 为避免引入额外依赖，使用轻量的 div 匹配算法。
 *
 * @param {string} html 完整 HTML 文本
 * @returns {string|null} `.js-yearly-contributions` 的 innerHTML
 */
function extractYearlyContributionsInnerHtml(html) {
  const source = String(html || '');
  if (!source) return null;

  const marker = 'js-yearly-contributions';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  // 找到包含该 class 的 <div ...> 起始位置
  const openTagStart = source.lastIndexOf('<div', markerIndex);
  if (openTagStart < 0) return null;

  // 通过匹配 <div ...> 与 </div> 的嵌套层级，定位该 div 的结束位置
  let depth = 0;
  let cursor = openTagStart;
  let endIndex = -1;

  while (cursor < source.length) {
    const nextOpen = source.indexOf('<div', cursor);
    const nextClose = source.indexOf('</div', cursor);

    if (nextOpen === -1 && nextClose === -1) break;

    const isOpen = nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose);
    const tagIndex = isOpen ? nextOpen : nextClose;
    const tagEnd = source.indexOf('>', tagIndex);
    if (tagEnd === -1) break;

    if (isOpen) {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        endIndex = tagEnd + 1;
        break;
      }
    }

    cursor = tagEnd + 1;
  }

  if (endIndex === -1) return null;

  const outerHtml = source.slice(openTagStart, endIndex);
  if (!outerHtml.includes(marker)) return null;

  const openEnd = outerHtml.indexOf('>');
  const closeStart = outerHtml.lastIndexOf('</div');
  if (openEnd === -1 || closeStart === -1 || closeStart <= openEnd) return null;

  let inner = outerHtml.slice(openEnd + 1, closeStart);

  // 防御性处理：移除潜在的 script 标签（理论上 GitHub 片段不包含）
  inner = inner.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  return inner.trim() ? inner : null;
}

module.exports = {
  extractYearlyContributionsInnerHtml,
};
