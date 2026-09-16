import type { IconRegion } from '../../types/render';
import { DEFAULT_ALLOWED_SCHEMES, sanitizeUrlOrHash } from '../../shared/sanitize-url.ts';
import { escapeHtml } from '../security/html.ts';

function extractDomain(url: unknown): string {
  if (!url) return '';

  try {
    let domain = String(url).replace(/^[a-zA-Z]+:\/\//, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    domain = domain.split(':')[0];
    return domain;
  } catch (error) {
    return String(url);
  }
}

function formatDate(date: unknown, format = 'YYYY-MM-DD'): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';

  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const seconds = dateObj.getSeconds();

  return format
    .replace('YYYY', String(year))
    .replace('MM', String(month).padStart(2, '0'))
    .replace('DD', String(day).padStart(2, '0'))
    .replace('HH', String(hours).padStart(2, '0'))
    .replace('mm', String(minutes).padStart(2, '0'))
    .replace('ss', String(seconds).padStart(2, '0'));
}

function buildFaviconV2Url(url: unknown, domain: string): string {
  if (!url) return '';

  try {
    const encodedUrl = encodeURIComponent(String(url));
    return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedUrl}&size=32&drop_404_icon=true`;
  } catch (error) {
    return '';
  }
}

function getFaviconV2Url(url: unknown, region: IconRegion = 'com'): string {
  const domain = region === 'cn' ? 't3.gstatic.cn' : 't3.gstatic.com';
  return buildFaviconV2Url(url, domain);
}

function getFaviconFallbackUrl(url: unknown, region: IconRegion = 'com'): string {
  const domain = region === 'cn' ? 't3.gstatic.com' : 't3.gstatic.cn';
  return buildFaviconV2Url(url, domain);
}

function getSafeUrl(url: unknown, allowedSchemes: string[] = DEFAULT_ALLOWED_SCHEMES): string {
  return sanitizeUrlOrHash(url, { allowedSchemes, label: 'view-utils.getSafeUrl' });
}

function attrs(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== undefined && value !== null && value !== '')
    .map(([name, value]) => {
      if (value === true) return escapeHtml(name);
      return `${escapeHtml(name)}="${escapeHtml(value)}"`;
    })
    .join(' ');
}

function isHttpUrl(url: unknown): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export {
  attrs,
  escapeHtml,
  extractDomain,
  formatDate,
  getSafeUrl,
  getFaviconV2Url,
  getFaviconFallbackUrl,
  hasItems,
  isHttpUrl,
};
