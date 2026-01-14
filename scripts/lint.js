const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function collectJsFiles(rootDir) {
  const files = [];

  const walk = (currentDir) => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') return;
        walk(fullPath);
        return;
      }

      if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    });
  };

  walk(rootDir);
  return files;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const targetDirs = ['src', 'scripts', 'test'].map((dir) => path.join(projectRoot, dir));

  const jsFiles = targetDirs.flatMap((dir) => collectJsFiles(dir)).sort();

  if (jsFiles.length === 0) {
    console.log('未发现需要检查的 .js 文件，跳过。');
    return;
  }

  let hasError = false;
  jsFiles.forEach((filePath) => {
    const relativePath = path.relative(projectRoot, filePath);
    try {
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
    } catch (error) {
      hasError = true;
      console.error(`\n语法检查失败：${relativePath}`);
      if (error && error.status) {
        console.error(`退出码：${error.status}`);
      }
    }
  });

  if (hasError) {
    process.exitCode = 1;
  } else {
    console.log(`语法检查通过：${jsFiles.length} 个文件`);
  }
}

main();
