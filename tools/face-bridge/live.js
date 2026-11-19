'use strict';
// Xem truc tiep camera may cham cong (chi XEM de chup anh khuon mat cho dung).
// Cau noi mo luong hinh H.264 (RTSP) cua may, chuyen cho trang DemoGym qua WebSocket 127.0.0.1 (chi may tinh nay),
// trinh duyet giai ma bang WebCodecs. Chi mo luong khi co nguoi xem, dong ngay khi khong con ai xem.
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function rtspOpen(dev, onRtp, onEnd) {
  return new Promise((resolve, reject) => {
    const base = `rtsp://${dev.ip}:554/Streaming/Channels/${dev.rtspChannel || '101'}`;
    const s = net.connect(Number(dev.rtspPort) || 554, dev.ip);
    let buf = Buffer.alloc(0);
    let cseq = 0;
    let ch = null;
    let sess = '';
    let waiter = null;
    let playing = false;
    let done = false;
    let ka = null;
    const dig = (m, u) => {
      const ha1 = md5(`${dev.user}:${ch.realm}:${dev.pass}`);
      const ha2 = md5(`${m}:${u}`);
      return `Digest username="${dev.user}", realm="${ch.realm}", nonce="${ch.nonce}", uri="${u}", response="${md5(`${ha1}:${ch.nonce}:${ha2}`)}"`;
    };
    const fail = (e) => {
      if (playing) {
        if (!done) {
          done = true;
          clearInterval(ka);
          try { s.destroy(); } catch (x) { /* da dong */ }
          if (onEnd) onEnd(e);
        }
        return;
      }
      if (done) return;
      done = true;
      try { s.destroy(); } catch (x) { /* da dong */ }
      reject(e);
    };
    const req = (m, u, extra) => new Promise((res, rej) => {
      cseq += 1;
      waiter = res;
      s.write(`${m} ${u} RTSP/1.0\r\nCSeq: ${cseq}\r\nUser-Agent: DemoGym\r\n${ch ? `Authorization: ${dig(m, u)}\r\n` : ''}${sess ? `Session: ${sess}\r\n` : ''}${extra || ''}\r\n`);
      setTimeout(() => rej(new Error('May khong tra loi luong hinh (RTSP)')), 8000);
    });
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (playing && buf[0] === 0x24) {
          if (buf.length < 4) return;
          const len = buf.readUInt16BE(2);
          if (buf.length < 4 + len) return;
          if (buf[1] === 0) onRtp(buf.subarray(4, 4 + len));
          buf = buf.subarray(4 + len);
          continue;
        }
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = buf.subarray(0, i).toString('latin1');
        const cl = Number((/Content-Length:\s*(\d+)/i.exec(head) || [])[1] || 0);
        if (buf.length < i + 4 + cl) return;
        const body = buf.subarray(i + 4, i + 4 + cl).toString('latin1');
        buf = buf.subarray(i + 4 + cl);
        const w = waiter;
        waiter = null;
        if (w) w({ code: Number((/RTSP\/1.0 (\d+)/.exec(head) || [])[1]), head, body });
      }
    });
    s.on('error', fail);
    s.on('close', () => fail(new Error('May dong luong hinh')));
    s.on('connect', async () => {
      try {
        let r = await req('DESCRIBE', base, 'Accept: application/sdp\r\n');
        if (r.code === 401) {
          const o = {};
          r.head.replace(/(\w+)="([^"]*)"/g, (m, k, v) => { o[k] = v; return m; });
          ch = o;
          r = await req('DESCRIBE', base, 'Accept: application/sdp\r\n');
        }
        if (r.code !== 200) throw new Error(`May tu choi luong hinh (RTSP ${r.code}). Kiem tra RTSP da bat tren may.`);
        const vm = /m=video[\s\S]*?(?=\r?\nm=|$)/.exec(r.body);
        const ctl = ((vm && /a=control:(\S+)/.exec(vm[0])) || [])[1] || 'trackID=1';
        if (vm && !/H264/i.test(vm[0])) throw new Error('Luong hinh cua may khong phai H.264');
        const su = /^rtsp:/.test(ctl) ? ctl : `${base}/${ctl}`;
        r = await req('SETUP', su, 'Transport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n');
        if (r.code !== 200) throw new Error(`May tu choi mo luong hinh (SETUP ${r.code})`);
        sess = ((/Session:\s*([^;\r\n]+)/i.exec(r.head) || [])[1] || '').trim();
        waiter = null;
        playing = true;
        s.write(`PLAY ${base} RTSP/1.0\r\nCSeq: ${++cseq}\r\nSession: ${sess}\r\n${ch ? `Authorization: ${dig('PLAY', base)}\r\n` : ''}Range: npt=0.000-\r\n\r\n`);
        ka = setInterval(() => {
          try { s.write(`OPTIONS ${base} RTSP/1.0\r\nCSeq: ${++cseq}\r\nSession: ${sess}\r\n${ch ? `Authorization: ${dig('OPTIONS', base)}\r\n` : ''}\r\n`); } catch (e) { /* da dong */ }
        }, 20000);
        resolve(() => {
          done = true;
          clearInterval(ka);
          try { s.write(`TEARDOWN ${base} RTSP/1.0\r\nCSeq: ${++cseq}\r\nSession: ${sess}\r\n${ch ? `Authorization: ${dig('TEARDOWN', base)}\r\n` : ''}\r\n`); } catch (e) { /* da dong */ }
          setTimeout(() => s.destroy(), 300);
        });
      } catch (e) {
        fail(e);
      }
    });
  });
}

// Ghep goi RTP H.264 thanh khung hinh (Annex B). onFrame(key, buffer)
function h264Depay(onFrame) {
  let nals = [];
  let fu = null;
  let ts = null;
  let sps = null;
  let pps = null;
  const SC = Buffer.from([0, 0, 0, 1]);
  const flush = () => {
    if (!nals.length) return;
    let key = false;
    let hasS = false;
    let hasP = false;
    nals.forEach((n) => {
      const t = n[0] & 31;
      if (t === 5) key = true;
      if (t === 7) { hasS = true; sps = n; }
      if (t === 8) { hasP = true; pps = n; }
    });
    const parts = [];
    if (key) {
      if (!hasS && sps) parts.push(SC, sps);
      if (!hasP && pps) parts.push(SC, pps);
    }
    nals.forEach((n) => parts.push(SC, n));
    nals = [];
    onFrame(key, Buffer.concat(parts));
  };
  return (pkt) => {
    if (pkt.length < 13) return;
    const cc = pkt[0] & 15;
    const ext = (pkt[0] >> 4) & 1;
    const marker = pkt[1] >> 7;
    const t = pkt.readUInt32BE(4);
    let h = 12 + cc * 4;
    if (ext) h += 4 + pkt.readUInt16BE(h + 2) * 4;
    const p = pkt.subarray(h);
    if (!p.length) return;
    if (ts !== null && t !== ts) flush();
    ts = t;
    const type = p[0] & 31;
    if (type >= 1 && type <= 23) nals.push(p);
    else if (type === 24) {
      let o = 1;
      while (o + 2 <= p.length) {
        const n = p.readUInt16BE(o);
        o += 2;
        if (o + n > p.length) break;
        nals.push(p.subarray(o, o + n));
        o += n;
      }
    } else if (type === 28) {
      const f = p[1];
      const st = f & 0x80;
      const en = f & 0x40;
      if (st) fu = [Buffer.from([(p[0] & 0xe0) | (f & 31)])];
      if (fu) {
        fu.push(p.subarray(2));
        if (en) { nals.push(Buffer.concat(fu)); fu = null; }
      }
    }
    if (marker) flush();
  };
}

function wsFrame(op, data) {
  const n = data.length;
  let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) h = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
  else {
    h = Buffer.alloc(10);
    h[0] = 0x80 | op;
    h[1] = 127;
    h.writeUInt32BE(n, 6);
  }
  return Buffer.concat([h, data]);
}

function startLive(cfg, log) {
  const port = Number(cfg.livePort) || 8898;
  const origins = new Set((cfg.allowOrigins || []).concat((() => { try { return [new URL(cfg.server).origin]; } catch (e) { return []; } })()));
  const clients = new Set();
  let stop = null;
  let starting = false;
  const closeAll = (msg) => {
    for (const c of clients) {
      try {
        c.sock.write(wsFrame(1, Buffer.from(JSON.stringify({ err: msg }))));
        c.sock.end(wsFrame(8, Buffer.alloc(0)));
      } catch (e) { /* da dong */ }
    }
    clients.clear();
  };
  const maybeStop = () => {
    if (!clients.size && stop) {
      const s = stop;
      stop = null;
      try { s(); } catch (e) { /* da dong */ }
      log('Xem truc tiep: da dong luong hinh');
    }
  };
  async function ensure(dev) {
    if (stop || starting) return;
    starting = true;
    try {
      const depay = h264Depay((key, data) => {
        const f = wsFrame(2, Buffer.concat([Buffer.from([key ? 2 : 1]), data]));
        for (const c of clients) {
          if (!c.key) {
            if (!key) continue;
            c.key = true;
          }
          if (c.sock.writableLength > 2e6) { c.key = false; continue; }
          c.sock.write(f);
        }
      });
      stop = await rtspOpen(dev, depay, (e) => {
        stop = null;
        log('Xem truc tiep: luong hinh dung:', e && e.message);
        closeAll('Luong hinh cua may bi ngat');
      });
      log('Xem truc tiep: da mo luong hinh cua', dev.name || dev.ip);
      if (!clients.size) maybeStop();
    } catch (e) {
      log('Xem truc tiep LOI:', e.message);
      closeAll(e.message);
    } finally {
      starting = false;
    }
  }
  const srv = http.createServer((q, r) => { r.statusCode = 426; r.end('WebSocket only'); });
  srv.on('upgrade', (q, sock) => {
    const o = q.headers.origin || '';
    if (!origins.has(o) || !/websocket/i.test(q.headers.upgrade || '')) {
      sock.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const dev = cfg.devices[0];
    if (!dev) {
      sock.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const acc = crypto.createHash('sha1').update(q.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
    const c = { sock, key: false };
    clients.add(c);
    const gone = () => { clients.delete(c); setTimeout(maybeStop, 3000); };
    sock.on('close', gone);
    sock.on('error', gone);
    sock.on('data', (d) => {
      if ((d[0] & 15) === 8) { try { sock.end(wsFrame(8, Buffer.alloc(0))); } catch (e) { /* da dong */ } }
      else if ((d[0] & 15) === 9) { try { sock.write(wsFrame(10, Buffer.alloc(0))); } catch (e) { /* da dong */ } }
    });
    ensure(dev);
  });
  srv.on('error', (e) => log('Xem truc tiep: khong mo duoc cong', port, '-', e.message));
  srv.listen(port, '127.0.0.1', () => log('Xem truc tiep camera: san sang o cong', port, '(chi may tinh nay)'));
}

module.exports = { startLive };
