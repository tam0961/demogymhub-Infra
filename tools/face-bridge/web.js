'use strict';
// Cong web cuc bo: http://localhost:8080 chuyen tiep sang may chu DemoGym (cfg.server).
// Trinh duyet chi cho xem camera (WebCodecs) o trang HTTPS hoac localhost, nen le tan mo DemoGym Dev qua dia chi nay.
// Chi nghe 127.0.0.1, khong luu gi, chi chuyen tiep nguyen yeu cau.
const http = require('node:http');

function startWeb(cfg, log) {
  const port = Number(process.env.WEB_PORT) || Number(cfg.webPort) || 8080;
  let target;
  try { target = new URL(cfg.server); } catch (e) { log('Cong web cuc bo: server trong config.json khong hop le'); return; }
  if (target.protocol !== 'http:') { log('Cong web cuc bo: server dung HTTPS, khong can cong nay, mo thang', cfg.server); return; }
  const srv = http.createServer((req, res) => {
    const up = http.request({ host: target.hostname, port: target.port || 80, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.setTimeout(30000, () => up.destroy(new Error('timeout')));
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Khong ket noi duoc may chu DemoGym');
    });
    req.pipe(up);
  });
  srv.on('error', (e) => log('Cong web cuc bo: khong mo duoc cong', port, '-', e.code === 'EADDRINUSE' ? 'cong dang duoc dung (da co duong ham hoac tien trinh khac)' : e.message));
  srv.listen(port, '127.0.0.1', () => log(`Cong web cuc bo: mo http://localhost:${port} de dung DemoGym (chi may tinh nay)`));
}

module.exports = { startWeb };
