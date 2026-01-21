// 生成端薄入口：保持对外导出稳定，内部实现位于 src/generator/main.js
const impl = require('./generator/main');
const { wrapAsyncError } = require('./generator/utils/errors');

module.exports = impl;

if (require.main === module) {
  if (typeof impl.main === 'function') {
    wrapAsyncError(impl.main)();
  } else {
    console.error('generator main() 未导出，无法直接执行。');
    process.exitCode = 1;
  }
}
