import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { buildNodeLibBundle } from './lib/node-lib-bundle.ts';

const log = createLogger('build:lib');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

// 生成 dist-node 的 .d.ts 类型声明，使 TS 消费者能获得公开 API 的类型（而非 any）
function generateTypeDeclarations(repoRoot: string): void {
  const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(
    process.execPath,
    [tscPath, '-p', path.join(repoRoot, 'tsconfig.lib.json')],
    { cwd: repoRoot, stdio: 'pipe' }
  );
  const output = `${result.stdout?.toString() || ''}${result.stderr?.toString() || ''}`;
  if (result.status !== 0) {
    throw new Error(`tsc 声明生成失败：${output}`);
  }

  // 声明中相对导入的 .ts 后缀改写为 .js（npm 包内只有 .d.ts，无 .ts 源文件）
  const distNode = path.join(repoRoot, 'dist-node');
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.d.ts')) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      const rewritten = content.replace(/(['"])(\.\.?\/[^'"]*?)\.ts(['"])/g, '$1$2.js$3');
      if (rewritten !== content) {
        fs.writeFileSync(fullPath, rewritten, 'utf8');
      }
    }
  };
  walk(distNode);
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');

  try {
    await buildNodeLibBundle({ repoRoot, log, startTimer });
    generateTypeDeclarations(repoRoot);
    log.ok('dist-node 类型声明生成完成');
  } catch (error) {
    log.error('构建 dist-node/index.cjs 失败', {
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
