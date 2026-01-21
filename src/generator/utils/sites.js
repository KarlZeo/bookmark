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

module.exports = {
  normalizeUrlKey,
  collectSitesRecursively,
};
