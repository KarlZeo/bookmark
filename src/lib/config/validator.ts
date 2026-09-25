import type { z as ZodNamespace } from 'zod';
import { z } from 'zod';
import { createLogger } from '../logging/logger.ts';
import { pageConfigSchema } from './schema/page.ts';
import {
  fontsSchema,
  githubSchema,
  iconsSchema,
  navigationItemSchema,
  profileSchema,
  rssSchema,
  securitySchema,
  socialItemSchema,
  themeSchema,
} from './schema/shared.ts';
import { siteConfigSchema } from './schema/site.ts';
import { getPageIdIssue, normalizePageId } from './page-id.ts';

type AnyRecord = Record<string, unknown>;
type ValidationIssue = {
  path: string;
  message: string;
};
type ZodIssueLike = {
  path: PropertyKey[];
  message: string;
  code?: string;
  keys?: string[];
};
type SchemaLike = {
  safeParse: (
    value: unknown
  ) => { success: true } | { success: false; error: { issues: ZodIssueLike[] } };
};

// loadModularConfig 仅将 fonts/profile/social/icons/navigation 提升到顶层并在顶层单独校验；
// theme/security/rss/github 保留在 config.site 内，仅由 siteConfigSchema 校验，不能过滤。
// 此处忽略 site 内嵌的已提升子字段 issue，避免同一对象被 siteConfigSchema 与顶层子 schema 重复校验。
const SITE_SUB_SCHEMA_PREFIXES = [
  'site.navigation',
  'site.fonts',
  'site.profile',
  'site.social',
  'site.icons',
];

const TOP_LEVEL_NON_PAGE_KEYS = new Set([
  '_meta',
  'categories',
  'fonts',
  'github',
  'homePageId',
  'icons',
  'navigation',
  'navigationData',
  'pageRegistry',
  'profile',
  'runtimeConfig',
  'runtimeConfigJson',
  'rss',
  'security',
  'site',
  'social',
  'socialLinks',
  'theme',
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSiteSubSchemaIssue(issue: ValidationIssue, config: AnyRecord): boolean {
  const prefix = SITE_SUB_SCHEMA_PREFIXES.find(
    (p) => issue.path === p || issue.path.startsWith(`${p}.`) || issue.path.startsWith(`${p}[`)
  );
  if (!prefix) return false;
  // 仅当该子字段确实被 loadModularConfig 提升到顶层（与 site 侧同一引用）时才过滤 site 侧重复 issue；
  // falsy 子配置（navigation: null 等）未被提升时，site 侧校验错误必须保留，避免静默吞错
  const field = prefix.slice('site.'.length);
  const site = isRecord(config.site) ? config.site : {};
  return config[field] === site[field];
}

function appendPath(basePath: string, segments: PropertyKey[]): string {
  return segments.reduce((current: string, segment: PropertyKey) => {
    if (typeof segment === 'number') {
      return `${current}[${segment}]`;
    }

    const key = String(segment);
    return current ? `${current}.${key}` : key;
  }, basePath);
}

function normalizeSchemaMessage(issue: ZodIssueLike, unknownKey?: string): string {
  const message = issue.message;
  if (unknownKey) {
    return `不支持的字段：${unknownKey}`;
  }

  if (message.startsWith('Invalid input: expected object')) return '期望为对象';
  if (message.startsWith('Invalid input: expected array')) return '期望为数组';
  if (message.startsWith('Invalid input: expected string')) return '期望为字符串';
  if (message.startsWith('Invalid input: expected number')) return '期望为数字';
  if (message.startsWith('Invalid input: expected boolean')) return '期望为布尔值';
  return message;
}

function collectSchemaIssues(
  issues: ValidationIssue[],
  schema: SchemaLike,
  value: unknown,
  basePath: string
): void {
  const result = schema.safeParse(value);
  if (result.success) return;

  result.error.issues.forEach((issue: ZodIssueLike) => {
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      issue.keys.forEach((key) => {
        issues.push({
          path: appendPath(basePath, [...issue.path, key]),
          message: normalizeSchemaMessage(issue, key),
        });
      });
      return;
    }

    issues.push({
      path: appendPath(basePath, issue.path),
      message: normalizeSchemaMessage(issue),
    });
  });
}

function getPageValidationEntries(config: AnyRecord): [string, unknown][] {
  const pages = isRecord(config.pages)
    ? config.pages
    : Object.fromEntries(
        Object.entries(config).filter(([key]) => !TOP_LEVEL_NON_PAGE_KEYS.has(key))
      );
  return Object.entries(pages);
}

function collectNavigationIdIssues(config: AnyRecord, issues: ValidationIssue[]): void {
  if (!Array.isArray(config.navigation)) return;

  const seen = new Map<string, number>();
  config.navigation.forEach((item, index) => {
    const record = isRecord(item) ? item : {};
    const id = normalizePageId(record.id);
    const issue = getPageIdIssue(record.id);
    if (issue) {
      issues.push({
        path: `navigation[${index}].id`,
        message: `${issue}；当前值：${id || '<empty>'}；修复示例：id: common`,
      });
      return;
    }

    const firstIndex = seen.get(id);
    if (firstIndex !== undefined) {
      issues.push({
        path: `navigation[${index}].id`,
        message: `页面 id 重复：${id}；首次出现于 navigation[${firstIndex}]`,
      });
      return;
    }
    seen.set(id, index);
  });
}

function collectPageFileIdIssues(config: AnyRecord, issues: ValidationIssue[]): void {
  const pages = isRecord(config.pages)
    ? config.pages
    : Object.fromEntries(
        Object.entries(config).filter(([key]) => !TOP_LEVEL_NON_PAGE_KEYS.has(key))
      );
  Object.keys(pages).forEach((id) => {
    const issue = getPageIdIssue(id);
    if (issue) {
      issues.push({
        path: `pages.${id}`,
        message: `${issue}；请将文件改名为 pages/<id>.yml`,
      });
    }
  });
}

export function getConfigValidationErrors(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(config)) {
    return [{ path: '$', message: '配置必须是对象' }];
  }

  // site.yml 的子配置已提升到顶层并单独校验，此处仅校验 site 纯字段，
  // 过滤 site 内嵌子字段的重复 issue（同一对象引用，避免错误信息重复与路径分叉）
  const siteIssues: ValidationIssue[] = [];
  collectSchemaIssues(siteIssues, siteConfigSchema, config.site, 'site');
  siteIssues
    .filter((issue) => !isSiteSubSchemaIssue(issue, config))
    .forEach((issue) => issues.push(issue));

  collectSchemaIssues(
    issues,
    zArray(navigationItemSchema, 'navigation 必须是数组'),
    config.navigation,
    'navigation'
  );
  collectNavigationIdIssues(config, issues);
  collectPageFileIdIssues(config, issues);

  if (config.fonts !== undefined) collectSchemaIssues(issues, fontsSchema, config.fonts, 'fonts');
  if (config.profile !== undefined)
    collectSchemaIssues(issues, profileSchema, config.profile, 'profile');
  if (config.icons !== undefined) collectSchemaIssues(issues, iconsSchema, config.icons, 'icons');
  if (config.theme !== undefined) collectSchemaIssues(issues, themeSchema, config.theme, 'theme');
  if (config.security !== undefined)
    collectSchemaIssues(issues, securitySchema, config.security, 'security');
  if (config.rss !== undefined) collectSchemaIssues(issues, rssSchema, config.rss, 'rss');
  if (config.github !== undefined)
    collectSchemaIssues(issues, githubSchema, config.github, 'github');
  if (config.social !== undefined) {
    collectSchemaIssues(
      issues,
      zArray(socialItemSchema, 'social 必须是数组'),
      config.social,
      'social'
    );
  }

  getPageValidationEntries(config).forEach(([key, value]) => {
    collectSchemaIssues(issues, pageConfigSchema, value, `pages.${key}`);
  });

  return issues;
}

function zArray<T extends ZodNamespace.ZodTypeAny>(schema: T, message: string) {
  return z.array(schema, { error: message });
}

export function validateConfig(config: unknown): boolean {
  const issues = getConfigValidationErrors(config);

  if (issues.length === 0) {
    return true;
  }

  const log = createLogger('config');
  issues.forEach((issue: ValidationIssue) => {
    log.error('配置字段无效', { path: issue.path, message: issue.message });
  });

  return false;
}
