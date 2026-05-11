const http = require('http');
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/sande/Documents/meu-projeto';
http.createServer((req, res) => {
  const file = req.url === '/' ? '/index.html' : req.url;
  try {
    const data = fs.readFileSync(path.join(BASE, file));
    const ext = path.extname(file);
    const ct = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[ext] || 'text/plain';
    res.writeHead(200, {'Content-Type': ct + ';charset=utf-8'});
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(8989, '127.0.0.1', () => process.stdout.write('READY\n'));
