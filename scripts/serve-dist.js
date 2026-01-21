const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { createLogger, isVerbose } = require('../src/generator/utils/logger');

const log = createLogger('serve');

function parseInteger(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];

  const getValue = (keys) => {
    const idx = args.findIndex((a) => keys.includes(a));
    if (idx === -1) return null;
    const next = args[idx + 1];
    return next ? String(next) : null;
  };

  const portArg = getValue(['--port', '-p']);
  const hostArg = getValue(['--host', '-h']);
  const rootArg = getValue(['--root']);

  return {
    port: portArg ? parseInteger(portArg, null) : null,
    host: hostArg ? String(hostArg) : null,
    root: rootArg ? String(rootArg) : null,
  };
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.xml') return 'application/xml; charset=utf-8';
  if (ext === '.map') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function sendNotFound(res, rootDir) {
  const fallback404 = path.join(rootDir, '404.html');
  if (fs.existsSync(fallback404)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(fallback404).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not Found');
}

function sendFile(req, res, filePath, rootDir) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return sendNotFound(res, rootDir);

    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.setHeader('Content-Length', String(stat.size));

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    log.warn('读取文件失败', {
      path: filePath,
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    sendNotFound(res, rootDir);
  }
}

function buildHandler(rootDir) {
  const normalizedRoot = path.resolve(rootDir);

  return (req, res) => {
    const rawUrl = req.url || '/';
    const rawPath = rawUrl.split('?')[0] || '/';

    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    const safePath = decodedPath.replace(/\\/g, '/');
    const resolved = path.resolve(normalizedRoot, `.${safePath}`);
    if (!resolved.startsWith(`${normalizedRoot}${path.sep}`) && resolved !== normalizedRoot) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }

    let target = resolved;
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html');
      }
    } catch {
      // ignore
    }

    if (!fs.existsSync(target)) {
      sendNotFound(res, normalizedRoot);
      return;
    }

    sendFile(req, res, target, normalizedRoot);
  };
}

function startServer(options = {}) {
  const { rootDir, host, port } = options;
  const normalizedRoot = path.resolve(rootDir);

  if (!fs.existsSync(normalizedRoot)) {
    throw new Error(`dist 目录不存在：${normalizedRoot}`);
  }

  const handler = buildHandler(normalizedRoot);
  const server = http.createServer(handler);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;
      resolve({ server, port: actualPort, host });
    });
  });
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const defaultRoot = path.join(repoRoot, 'dist');
  const args = parseArgs(process.argv.slice(2));

  const port =
    args.port ?? parseInteger(process.env.PORT || process.env.MENAV_PORT || '5173', 5173);
  const host = args.host || process.env.HOST || '0.0.0.0';
  const rootDir = args.root ? path.resolve(repoRoot, args.root) : defaultRoot;

  log.info('启动静态服务', { root: path.relative(repoRoot, rootDir) || '.', host, port });

  const { server, port: actualPort } = await startServer({ rootDir, host, port });

  log.ok('就绪', { url: `http://localhost:${actualPort}` });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write('\n');
    log.info('正在关闭...', { signal });

    try {
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    } catch {
      // ignore
    }

    const exit = signal === 'SIGINT' ? 130 : 0;
    const forceTimer = setTimeout(() => process.exit(exit), 2000);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(exit);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    log.error('启动失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  startServer,
};
