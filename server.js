const http = require('http');
const fs = require('fs');
const path = require('path');
const BASE = __dirname;
const PORT = process.env.PORT || 8989;
const HOST = process.env.HOST || '127.0.0.1';
const BINARY_EXTS = new Set(['.png', '.ico', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2']);
http.createServer((req, res) => {
  const rel = path.normalize(req.url === '/' ? '/index.html' : req.url);
  const resolved = path.join(BASE, rel);
  if (!resolved.startsWith(BASE + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = fs.readFileSync(resolved);
    const ext = path.extname(rel);
    const ct = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'}[ext] || 'text/plain';
    const charset = BINARY_EXTS.has(ext) ? '' : ';charset=utf-8';
    res.writeHead(200, {'Content-Type': ct + charset});
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, HOST, () => process.stdout.write('READY\n'));
