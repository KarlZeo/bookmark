const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/generator/utils/logger');

const log = createLogger('build');

function runNode(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  return result && Number.isFinite(result.status) ? result.status : 1;
}

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');

  const cleanExit = runNode(path.join(repoRoot, 'scripts', 'clean.js'));
  if (cleanExit !== 0) {
    log.error('clean 失败', { exit: cleanExit });
    process.exitCode = cleanExit;
    return;
  }

  // best-effort：同步失败不阻断 build
  const syncProjectsExit = runNode(path.join(repoRoot, 'scripts', 'sync-projects.js'));
  if (syncProjectsExit !== 0)
    log.warn('sync-projects 异常退出，已继续（best-effort）', { exit: syncProjectsExit });

  const syncHeatmapExit = runNode(path.join(repoRoot, 'scripts', 'sync-heatmap.js'));
  if (syncHeatmapExit !== 0)
    log.warn('sync-heatmap 异常退出，已继续（best-effort）', { exit: syncHeatmapExit });

  const syncArticlesExit = runNode(path.join(repoRoot, 'scripts', 'sync-articles.js'));
  if (syncArticlesExit !== 0)
    log.warn('sync-articles 异常退出，已继续（best-effort）', { exit: syncArticlesExit });

  const generatorExit = runNode(path.join(repoRoot, 'src', 'generator.js'));
  if (generatorExit !== 0) {
    log.error('generate 失败', { exit: generatorExit });
    process.exitCode = generatorExit;
    return;
  }

  log.ok('完成', { ms: elapsedMs(), dist: 'dist/' });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('构建失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
