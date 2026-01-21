/**
 * 自定义错误类 - 配置相关错误
 */
class ConfigError extends Error {
  constructor(message, suggestions = []) {
    super(message);
    this.name = 'ConfigError';
    this.suggestions = suggestions;
  }
}

/**
 * 自定义错误类 - 模板相关错误
 */
class TemplateError extends Error {
  constructor(message, templatePath = null) {
    super(message);
    this.name = 'TemplateError';
    this.templatePath = templatePath;
  }
}

/**
 * 自定义错误类 - 构建相关错误
 */
class BuildError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'BuildError';
    this.context = context;
  }
}

/**
 * 自定义错误类 - 文件操作相关错误
 */
class FileError extends Error {
  constructor(message, filePath = null, suggestions = []) {
    super(message);
    this.name = 'FileError';
    this.filePath = filePath;
    this.suggestions = suggestions;
  }
}

/**
 * 统一错误处理器 - 专业紧凑版（中文）
 * @param {Error} error - 错误对象
 * @param {number} exitCode - 退出码，默认为 1
 */
function handleError(error, exitCode = 1) {
  const { formatPrefix, isVerbose } = require('./logger');

  // 错误标题行
  console.error(`\n${formatPrefix('ERROR')} ${error.name}: ${error.message}`);

  // 文件路径（如果有）
  if (error.filePath || error.templatePath) {
    const path = error.filePath || error.templatePath;
    console.error(`位置: ${path}`);
  }

  // 上下文信息（如果有）
  if (error.context && Object.keys(error.context).length > 0) {
    console.error('上下文:');
    for (const [key, value] of Object.entries(error.context)) {
      console.error(`  ${key}: ${value}`);
    }
  }

  // 修复建议（如果有）
  if (error.suggestions && error.suggestions.length > 0) {
    console.error('建议:');
    error.suggestions.forEach((suggestion, index) => {
      console.error(`  ${index + 1}) ${suggestion}`);
    });
  }

  // DEBUG 提示（仅在非 DEBUG 模式下显示）
  if (process.env.DEBUG) {
    console.error('\n堆栈:');
    console.error(error.stack || String(error));
  } else if (isVerbose() && error && error.stack) {
    console.error('\n堆栈:');
    console.error(error.stack);
  } else {
    console.error('\n提示: DEBUG=1 查看堆栈');
  }

  console.error(); // 空行结束
  process.exit(exitCode);
}

/**
 * 包装异步函数，自动处理未捕获的错误
 * @param {Function} fn - 异步函数
 * @returns {Function} 包装后的函数
 */
function wrapAsyncError(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      // 如果是自定义错误，直接使用 handleError
      if (
        error instanceof ConfigError ||
        error instanceof TemplateError ||
        error instanceof BuildError ||
        error instanceof FileError
      ) {
        handleError(error);
      } else {
        // 否则包装为 BuildError
        handleError(
          new BuildError(error.message || '未知错误', {
            原始错误类型: error.name || 'Error',
          })
        );
      }
    }
  };
}

module.exports = {
  ConfigError,
  TemplateError,
  BuildError,
  FileError,
  handleError,
  wrapAsyncError,
};
