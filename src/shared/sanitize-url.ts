// URL 消毒统一入口（单一来源）：http/https/mailto/tel 白名单 + 相对链接放行，其余降级。
// 收敛自 4 处重复实现：view-utils.getSafeUrl / content.markdown.sanitizeLinkHref /
// runtime.shared.menavSanitizeUrl / security.html.isSafeUriAttribute。
// 本模块零依赖：src/lib 与 src/runtime 均可安全引用（src/shared 不在双向禁止门禁内）。

const DEFAULT_ALLOWED_SCHEMES: string[] = ['http', 'https', 'mailto', 'tel'];

type SanitizeUrlOptions = {
  allowedSchemes?: unknown;
  /** 非空时在拦截到不安全 URL 时 console.warn，便于定位来源 */
  label?: string;
};

function normalizeAllowedSchemes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_ALLOWED_SCHEMES];
  }

  const schemes = value
    .map((scheme) =>
      String(scheme || '')
        .trim()
        .toLowerCase()
        .replace(/:$/, '')
    )
    .filter(Boolean);

  return schemes.length > 0 ? schemes : [...DEFAULT_ALLOWED_SCHEMES];
}

function isRelativeUrl(raw: string): boolean {
  return (
    raw.startsWith('#') ||
    raw.startsWith('/') ||
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    raw.startsWith('?')
  );
}

function warnBlocked(label: string | undefined, raw: string, reason: string): void {
  if (!label) return;
  console.warn(`[WARN] 已拦截不安全 URL（${reason}）：${raw}`, label);
}

/**
 * 核心消毒函数：返回可安全使用的 URL，不安全时返回 null。
 * - 先行剥离 ASCII tab/换行/分页符（WHATWG URL 解析器也会先剥离，避免控制字符绕过相对路径与协议相对判定）
 * - 协议相对 URL（//host 或 /\host）先于相对路径判定拦截（WHATWG 在 authority 位置将反斜杠视为正斜杠）
 * - 相对链接（# / ./ ../ ?）原样放行
 * - 其余解析 scheme 并校验白名单
 */
function sanitizeUrl(rawUrl: unknown, options: SanitizeUrlOptions = {}): string | null {
  if (rawUrl === undefined || rawUrl === null) return null;

  const raw = String(rawUrl)
    .trim()
    .replace(/[\t\n\r\f]/g, '');
  if (!raw) return null;

  if (raw.startsWith('//') || raw.startsWith('/\\')) {
    warnBlocked(options.label, raw, '协议相对形式');
    return null;
  }

  if (isRelativeUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    if (normalizeAllowedSchemes(options.allowedSchemes).includes(scheme)) return raw;
    warnBlocked(options.label, raw, '危险 scheme');
    return null;
  } catch (error) {
    warnBlocked(options.label, raw, '无法解析');
    return null;
  }
}

/** 字符串消费方：不安全时降级为 '#'（与历史 getSafeUrl/menavSanitizeUrl/sanitizeLinkHref 契约一致） */
function sanitizeUrlOrHash(rawUrl: unknown, options?: SanitizeUrlOptions): string {
  return sanitizeUrl(rawUrl, options) ?? '#';
}

/** 布尔谓词消费方（如 HTML 属性白名单判定）：安全返回 true，不安全返回 false */
function isSafeUriValue(rawUrl: unknown, options?: SanitizeUrlOptions): boolean {
  return sanitizeUrl(rawUrl, options) !== null;
}

export {
  DEFAULT_ALLOWED_SCHEMES,
  isSafeUriValue,
  normalizeAllowedSchemes,
  sanitizeUrl,
  sanitizeUrlOrHash,
};
export type { SanitizeUrlOptions };
