const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { createLogger, isVerbose } = require('../utils/logger');

const log = createLogger('config');

function handleConfigLoadError(filePath, error) {
  log.error('加载配置失败', {
    path: filePath,
    message: error && error.message ? error.message : String(error),
  });
  if (isVerbose() && error && error.stack) {
    console.error(error.stack);
  }
}

function safeLoadYamlConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const docs = yaml.loadAll(fileContent);

    if (docs.length === 1) {
      return docs[0];
    }

    if (docs.length > 1) {
      log.warn('检测到 YAML 多文档，仅使用第一个', { path: filePath });
      return docs[0];
    }

    return null;
  } catch (error) {
    handleConfigLoadError(filePath, error);
    return null;
  }
}

function loadModularConfig(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const config = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
    categories: [],
  };

  const siteConfigPath = path.join(dirPath, 'site.yml');
  const siteConfig = safeLoadYamlConfig(siteConfigPath);
  if (siteConfig) {
    config.site = siteConfig;

    if (siteConfig.fonts) config.fonts = siteConfig.fonts;
    if (siteConfig.profile) config.profile = siteConfig.profile;
    if (siteConfig.social) config.social = siteConfig.social;
    if (siteConfig.icons) config.icons = siteConfig.icons;

    if (siteConfig.navigation) {
      config.navigation = siteConfig.navigation;
      if (isVerbose()) log.info('使用 site.yml 中的 navigation 配置');
    }
  }

  const pagesPath = path.join(dirPath, 'pages');
  if (fs.existsSync(pagesPath)) {
    const files = fs
      .readdirSync(pagesPath)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

    files.forEach((file) => {
      const filePath = path.join(pagesPath, file);
      const fileConfig = safeLoadYamlConfig(filePath);

      if (fileConfig) {
        const configKey = path.basename(file, path.extname(file));
        config[configKey] = fileConfig;
      }
    });
  }

  return config;
}

module.exports = {
  safeLoadYamlConfig,
  loadModularConfig,
};
