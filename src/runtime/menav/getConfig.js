// 配置数据缓存：避免浏览器扩展/站点脚本频繁 JSON.parse
let menavConfigCacheReady = false;
let menavConfigCacheRaw = null;
let menavConfigCacheValue = null;

module.exports = function getConfig(options) {
  const configData = document.getElementById('menav-config-data');
  if (!configData) return null;

  const raw = configData.textContent || '';
  if (!menavConfigCacheReady || menavConfigCacheRaw !== raw) {
    menavConfigCacheValue = JSON.parse(raw);
    menavConfigCacheRaw = raw;
    menavConfigCacheReady = true;
  }

  if (options && options.clone) {
    if (typeof structuredClone === 'function') {
      return structuredClone(menavConfigCacheValue);
    }
    return JSON.parse(JSON.stringify(menavConfigCacheValue));
  }

  return menavConfigCacheValue;
};
