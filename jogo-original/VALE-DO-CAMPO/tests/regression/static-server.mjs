// Servidor estático mínimo (sem dependências) usado pelos testes de regressão.
// Serve a raiz do projeto e, como o Vite em desenvolvimento, a pasta public/ na raiz do site.
// Uso: node tests/regression/static-server.mjs [porta] [pasta]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml' };

export function startServer(root, port = 0) {
  const roots = [root, path.join(root, 'public')];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let rel = url === '/' ? '/index.html' : url;
    for (const r of roots) {
      const f = path.join(r, rel);
      if (!f.startsWith(r)) break;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
        return;
      }
    }
    res.writeHead(404); res.end('404 ' + url);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 8080);
  const root = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  startServer(root, port).then(() => console.log(`servindo ${root} em http://127.0.0.1:${port}/`));
}
