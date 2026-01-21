const fs = require('fs');
const path = require('path');

const { createLogger } = require('../src/generator/utils/logger');

const log = createLogger('clean');

const distPath = path.resolve(__dirname, '..', 'dist');

try {
  fs.rmSync(distPath, { recursive: true, force: true });
  log.ok('删除 dist 目录', { path: distPath });
} catch (error) {
  log.error('删除 dist 目录失败', {
    path: distPath,
    message: error && error.message ? error.message : String(error),
  });
  process.exitCode = 1;
}
