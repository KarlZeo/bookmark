const fs = require('node:fs') as typeof import('node:fs');
const yaml = require('js-yaml') as {
  load: (source: string) => unknown;
};

type UpsertBookmarksNavResult =
  | { updated: true; reason: 'added_navigation_block' | 'updated_navigation_block' }
  | {
      updated: false;
      reason:
        | 'site_yml_not_object'
        | 'already_present'
        | 'navigation_not_array'
        | 'flow_navigation_not_supported';
    }
  | { updated: false; reason: 'error'; error: unknown };

// 判断 navigation 在源文本中是否为 flow（内联）写法：
// 同行（navigation: [...]）或换行缩进（navigation: 下一行 [..]）均视为 flow；
// 块序列（navigation: 下一行以 - 开头）返回 false
function isFlowNavigation(lines: string[], navLineIndex: number): boolean {
  if (/^navigation\s*:\s*[\[{]/.test(lines[navLineIndex])) return true;

  for (let i = navLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    return line.startsWith('[') || line.startsWith('{');
  }

  return false;
}

// 写回并做 YAML 自检：若产物无法被解析（写坏），回滚为原始内容
function writeSiteYmlAndVerify(siteYmlPath: string, content: string, original: string): boolean {
  try {
    fs.writeFileSync(siteYmlPath, content, 'utf8');
    yaml.load(content);
    return true;
  } catch (error) {
    fs.writeFileSync(siteYmlPath, original, 'utf8');
    return false;
  }
}

function upsertBookmarksNavInSiteYml(siteYmlPath: string): UpsertBookmarksNavResult {
  try {
    const raw = fs.readFileSync(siteYmlPath, 'utf8');
    const loaded = yaml.load(raw);

    if (!loaded || typeof loaded !== 'object') {
      return { updated: false, reason: 'site_yml_not_object' };
    }

    const siteConfig = loaded as { navigation?: unknown };
    const navigation = siteConfig.navigation;

    if (
      Array.isArray(navigation) &&
      navigation.some(
        (item) => item && typeof item === 'object' && 'id' in item && item.id === 'bookmarks'
      )
    ) {
      return { updated: false, reason: 'already_present' };
    }

    if (navigation !== undefined && !Array.isArray(navigation)) {
      return { updated: false, reason: 'navigation_not_array' };
    }

    const lines = raw.split(/\r?\n/);
    const navLineIndex = lines.findIndex((line) => /^navigation\s*:/.test(line));

    if (navLineIndex >= 0 && isFlowNavigation(lines, navLineIndex)) {
      // flow 风格（navigation: [...] / navigation: {...}，含换行缩进写法）：
      // 按行插入块序列会与 flow 写法冲突，直接返回诊断，由调用方提示用户手动添加，而不是写坏 site.yml
      return { updated: false, reason: 'flow_navigation_not_supported' };
    }

    const itemIndent = '  ';
    const propIndent = `${itemIndent}  `;
    const snippet = [
      `${itemIndent}- name: 书签`,
      `${propIndent}icon: fas fa-bookmark`,
      `${propIndent}id: bookmarks`,
    ];

    if (navLineIndex === -1) {
      const normalized = raw.endsWith('\n') ? raw : `${raw}\n`;
      const spacer = normalized.trim().length === 0 ? '' : '\n';
      const added = `${normalized}${spacer}navigation:\n${snippet.join('\n')}\n`;
      if (!writeSiteYmlAndVerify(siteYmlPath, added, raw)) {
        return {
          updated: false,
          reason: 'error',
          error: new Error('写入 navigation 后 YAML 自检失败'),
        };
      }
      return { updated: true, reason: 'added_navigation_block' };
    }

    let insertAt = lines.length;
    for (let i = navLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
        insertAt = i;
        break;
      }
    }

    const updatedLines = [...lines];
    if (insertAt > 0 && updatedLines[insertAt - 1].trim() !== '') snippet.unshift('');
    updatedLines.splice(insertAt, 0, ...snippet);

    const updatedContent = `${updatedLines.join('\n')}\n`;
    if (!writeSiteYmlAndVerify(siteYmlPath, updatedContent, raw)) {
      return {
        updated: false,
        reason: 'error',
        error: new Error('写入 navigation 后 YAML 自检失败'),
      };
    }
    return { updated: true, reason: 'updated_navigation_block' };
  } catch (error) {
    return { updated: false, reason: 'error', error };
  }
}

export { upsertBookmarksNavInSiteYml };
export type { UpsertBookmarksNavResult };
