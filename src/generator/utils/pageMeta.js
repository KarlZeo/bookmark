const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * 解析页面配置文件路径（优先 user，回退 _default）
 * 注意：仅用于构建期读取文件元信息，不会把路径注入到页面/扩展配置中。
 * @param {string} pageId 页面ID（与 pages/<id>.yml 文件名对应）
 * @returns {string|null} 文件路径或 null
 */
function resolvePageConfigFilePath(pageId) {
  if (!pageId) return null;

  const candidates = [
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yaml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yaml`),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch (e) {
      // 忽略 IO 异常，继续尝试下一个候选
    }
  }

  return null;
}

/**
 * 尝试获取文件最后一次 git 提交时间（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetGitLastCommitIso(filePath) {
  if (!filePath) return null;

  try {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const output = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const raw = String(output || '').trim();
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 获取文件 mtime（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetFileMtimeIso(filePath) {
  if (!filePath) return null;

  try {
    const stats = fs.statSync(filePath);
    const mtime = stats && stats.mtime ? stats.mtime : null;
    if (!(mtime instanceof Date) || Number.isNaN(mtime.getTime())) return null;
    return mtime.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 计算页面配置文件“内容更新时间”（优先 git，回退 mtime）
 * @param {string} pageId 页面ID
 * @returns {{updatedAt: string, updatedAtSource: 'git'|'mtime'}|null}
 */
function getPageConfigUpdatedAtMeta(pageId) {
  const filePath = resolvePageConfigFilePath(pageId);
  if (!filePath) return null;

  const gitIso = tryGetGitLastCommitIso(filePath);
  if (gitIso) {
    return { updatedAt: gitIso, updatedAtSource: 'git' };
  }

  const mtimeIso = tryGetFileMtimeIso(filePath);
  if (mtimeIso) {
    return { updatedAt: mtimeIso, updatedAtSource: 'mtime' };
  }

  return null;
}

module.exports = {
  getPageConfigUpdatedAtMeta,
};
