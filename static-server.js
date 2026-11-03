const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const port = process.env.PORT || 4173;

const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.gif': 'image/gif',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(dir, p);
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full);
    const ct = types[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {                                   // byte-range: needed for <video> seeking
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = parseInt(m[1], 10) || 0;
      const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': ct, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(full, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': ct, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
      fs.createReadStream(full).pipe(res);
    }
  });
}).listen(port, () => console.log('serving on http://localhost:' + port));
