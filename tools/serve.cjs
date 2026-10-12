const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
http.createServer((req,res) => {
  const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file,(err,data) => {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(5173,'127.0.0.1', () => console.log('Preview: http://127.0.0.1:5173'));
