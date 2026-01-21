const fs = require('node:fs');
const { loadModularConfig } = require('./loader');
const { ensureConfigDefaults, validateConfig } = require('./validator');
const {
  prepareRenderData,
  MENAV_EXTENSION_CONFIG_FILE,
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
  buildExtensionConfig,
} = require('./resolver');
const { assignCategorySlugs } = require('./slugs');
const { ConfigError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const log = createLogger('config');

function loadConfig() {
  let config = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
  };

  const hasUserModularConfig = fs.existsSync('config/user');
  const hasDefaultModularConfig = fs.existsSync('config/_default');

  if (hasUserModularConfig) {
    if (!fs.existsSync('config/user/site.yml')) {
      throw new ConfigError('检测到 config/user/ 目录，但缺少 config/user/site.yml', [
        '由于配置采用"完全替换"策略，系统不会从 config/_default/ 补齐缺失配置',
        '解决方法：先完整复制 config/_default/ 到 config/user/，再按需修改',
        '参考文档: config/README.md',
      ]);
    }

    if (!fs.existsSync('config/user/pages')) {
      log.warn('检测到 config/user/pages/ 缺失，部分页面内容可能为空');
      log.warn('建议复制 config/_default/pages/ 到 config/user/pages/，再按需修改');
    }

    config = loadModularConfig('config/user');
  } else if (hasDefaultModularConfig) {
    config = loadModularConfig('config/_default');
  } else {
    throw new ConfigError('未找到可用配置：缺少 config/user/ 或 config/_default/', [
      '本版本已不再支持旧版单文件配置（config.yml / config.yaml）',
      '解决方法：使用模块化配置目录（建议从 config/_default/ 复制到 config/user/ 再修改）',
      '参考文档: config/README.md',
    ]);
  }

  config = ensureConfigDefaults(config);

  if (!validateConfig(config)) {
    // 保留函数调用
  }

  return prepareRenderData(config);
}

module.exports = {
  MENAV_EXTENSION_CONFIG_FILE,
  loadConfig,
  prepareRenderData,
  resolveTemplateNameForPage,
  buildExtensionConfig,
  getSubmenuForNavItem,
  assignCategorySlugs,
};
