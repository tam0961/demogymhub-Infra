'use strict';
// Cau noi may cham cong Hikvision <-> DemoGym. Doc luot quet (poll). Chi ghi len may khi le tan bam 'Gui khuon mat len may' (them nguoi va anh), khong xoa gi, khong doi cau hinh.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, ''));
const noAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const log = (...a) => console.log(new Date().toLocaleTimeString('vi-VN'), ...a);

function parseChallenge(h) {
  const o = {};
  for (const m of String(h || '').matchAll(/(\w+)="?([^",]*)"?/g)) o[m[1]] = m[2];
  return o;
}

process.on('uncaughtException', (e) => log('Loi khong mong doi (van chay tiep):', e && e.message));
process.on('unhandledRejection', (e) => log('Loi khong mong doi (van chay tiep):', e && e.message));

const authCache = {};

function digestFor(dev, method, uri) {
  const c = authCache[dev.ip];
  c.nc += 1;
  const nc = String(c.nc).padStart(8, '0');
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${dev.user}:${c.realm}:${dev.pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const resp = c.qop ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:auth:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`);
  return `Digest username="${dev.user}", realm="${c.realm}", nonce="${c.nonce}", uri="${uri}", response="${resp}"${c.qop ? `, qop=auth, nc=${nc}, cnonce="${cnonce}"` : ''}${c.opaque ? `, opaque="${c.opaque}"` : ''}`;
}

async function hik(dev, method, uri, body, raw, timeoutMs) {
  const url = `http://${dev.ip}${uri}`;
  const form = typeof body === 'function';
  const init = (auth) => ({
    method,
    headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}) },
    body: form ? body() : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs || 15000),
  });
  let r = await fetch(url, init(authCache[dev.ip] ? digestFor(dev, method, uri) : null));
  if (r.status === 401) {
    delete authCache[dev.ip];
    r = await fetch(url, init());
    if (r.status === 401) {
      const c = parseChallenge(r.headers.get('www-authenticate'));
      authCache[dev.ip] = { realm: c.realm, nonce: c.nonce, qop: c.qop, opaque: c.opaque, nc: 0 };
      r = await fetch(url, init(digestFor(dev, method, uri)));
      if (r.status === 401) {
        delete authCache[dev.ip];
        throw Object.assign(new Error('Sai tai khoan hoac mat khau may cham cong'), { auth: true });
      }
    }
  }
  if (raw) {
    if (!r.ok) throw new Error(`May tra ve ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  const text = await r.text();
  const why = deviceWhy(text);
  if (!r.ok) throw new Error(`May tra ve ${r.status}${why ? ': ' + why : ': ' + text.slice(0, 160)}`);
  if (why && statusCodeOf(text) !== null && statusCodeOf(text) !== 1) throw new Error(`May tu choi: ${why}`);
  return text;
}

function statusCodeOf(text) {
  try {
    const c = JSON.parse(text).statusCode;
    return typeof c === 'number' ? c : null;
  } catch (e) {
    return null;
  }
}

// Ly do that cua may nam trong statusString / subStatusCode / errorMsg
function deviceWhy(text) {
  try {
    const j = JSON.parse(text);
    return [j.statusString, j.subStatusCode, j.errorMsg].filter(Boolean).join(' / ');
  } catch (e) {
    return '';
  }
}

async function deviceNow(dev) {
  const t = await hik(dev, 'GET', '/ISAPI/System/time', null, false, 5000);
  const lt = /<localTime>([^<]+)</.exec(t)?.[1];
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)([+-]\d\d:\d\d)?/.exec(lt || '');
  if (!m) throw new Error('Khong doc duoc gio may');
  return { wall: Date.parse(m[1] + 'Z'), off: m[2] || '+07:00' };
}

const fmtWall = (ms, off) => new Date(ms).toISOString().slice(0, 19) + off;

async function fetchEvents(dev, start, end) {
  const cond = { searchID: String(Date.now()), searchResultPosition: 0, maxResults: 30, major: 5, minor: 0, startTime: start, endTime: end };
  const t = await hik(dev, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { AcsEventCond: cond }, false, 5000);
  const j = JSON.parse(t);
  return (j.AcsEvent && j.AcsEvent.InfoList) || [];
}

async function push(dev, emp) {
  const r = await fetch(`${cfg.server.replace(/\/$/, '')}/api/public/attendance/hikvision/${dev.key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateTime: new Date().toISOString(), AccessControllerEvent: { employeeNoString: emp } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`DemoGym tra ve ${r.status}`);
}

const base = () => cfg.server.replace(/\/$/, '');

async function enroll(dev, job) {
  const emp = String(job.employee_no);
  const nm = noAccent(job.name) || emp;
  let exists = false;
  const s = await hik(dev, 'POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', { UserInfoSearchCond: { searchID: 'dg' + Date.now(), searchResultPosition: 0, maxResults: 1, EmployeeNoList: [{ employeeNo: emp }] } });
  const u = JSON.parse(s).UserInfoSearch;
  if (u && u.numOfMatches > 0) {
    exists = true;
    const old = noAccent((u.UserInfo && u.UserInfo[0] && u.UserInfo[0].name) || '');
    if (old && old.toLowerCase() !== nm.toLowerCase()) throw new Error(`Ma ${emp} tren may dang dung cho nguoi khac (${old})`);
  }
  const user = { employeeNo: emp, name: nm, userType: 'normal', Valid: { enable: true, beginTime: new Date().toISOString().slice(0, 10) + 'T00:00:00', endTime: (job.valid_to || '2037-12-31') + 'T23:59:59', timeType: 'local' }, doorRight: '1', RightPlan: [{ doorNo: 1, planTemplateNo: '1' }], maxOpenDoorTime: 0 };
  await hik(dev, exists ? 'PUT' : 'POST', '/ISAPI/AccessControl/UserInfo/' + (exists ? 'Modify' : 'Record') + '?format=json', { UserInfo: user });
  const img = Buffer.from(job.photo || '', 'base64');
  if (!img.length) return 'Da them nguoi len may (chua co anh)';
  const form = () => {
    const f = new FormData();
    f.append('FaceDataRecord', JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: emp }));
    f.append('FaceImage', new Blob([img], { type: 'image/jpeg' }), 'face.jpg');
    return f;
  };
  try {
    await hik(dev, 'POST', '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', form);
  } catch (e) {
    if (!/Exist|exist|already/.test(e.message)) throw new Error('Them nguoi duoc nhung anh mat bi may tu choi: ' + e.message);
    await hik(dev, 'PUT', '/ISAPI/Intelligent/FDLib/FDModify?format=json', form);
  }
  return 'Da dang ky khuon mat len may, ma ' + emp;
}

const serverPaused = {};

function startJobs(dev) {
  let busy = false;
  let pausedUntil = 0;
  setInterval(async () => {
    if (busy || Date.now() < pausedUntil) return;
    busy = true;
    try {
      const r = await fetch(`${base()}/api/public/attendance/jobs/${dev.key}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`DemoGym tra ve ${r.status}`);
      const jr = await r.json();
      serverPaused[dev.key] = !!jr.paused;
      for (const job of jr.data) {
        let ok = true;
        let message;
        try {
          message = await enroll(dev, job);
          log(`${dev.name}: ${message}`);
        } catch (e) {
          ok = false;
          message = String(e.message).slice(0, 280);
          log(`${dev.name}: dang ky that bai: ${message}`);
          if (e.auth) pausedUntil = Date.now() + 10 * 60 * 1000;
        }
        await fetch(`${base()}/api/public/attendance/jobs/${dev.key}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id, ok, message }), signal: AbortSignal.timeout(8000) });
      }
    } catch (e) {
      log(`${dev.name}: ${e.message}`);
    } finally {
      busy = false;
    }
  }, 2000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chi DOC tu may: danh sach nguoi + anh mat, gui sang DemoGym de SAO CHEP anh cho hoi vien chua co anh. Khong ghi gi len may.
async function pull(dev) {
  const names = {};
  let pos = 0;
  for (;;) {
    const t = await hik(dev, 'POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', { UserInfoSearchCond: { searchID: 'pl' + Date.now(), searchResultPosition: pos, maxResults: 30 } });
    const u = JSON.parse(t).UserInfoSearch || {};
    const l = u.UserInfo || [];
    l.forEach((x) => { if (x.employeeNo) names[String(x.employeeNo)] = x.name || ''; });
    pos += l.length;
    if (!l.length || pos >= (u.totalMatches || pos) || pos > 20000) break;
    await sleep(300);
  }
  const faces = {};
  pos = 0;
  for (;;) {
    const t = await hik(dev, 'POST', '/ISAPI/Intelligent/FDLib/FDSearch?format=json', { searchResultPosition: pos, maxResults: 30, faceLibType: 'blackFD', FDID: '1' });
    const j = JSON.parse(t);
    const l = j.MatchList || [];
    l.forEach((x) => { if (x.FPID) faces[String(x.FPID)] = x.faceURL || ''; });
    pos += l.length;
    if (!l.length || pos >= (j.totalMatches || 0) || pos > 20000) break;
    await sleep(300);
  }
  const ids = [...new Set([...Object.keys(names), ...Object.keys(faces)])];
  log(`${dev.name}: may co ${Object.keys(names).length} nguoi, ${Object.keys(faces).length} anh mat`);
  const stat = {};
  for (const emp of ids) {
    let photo;
    let result;
    if (faces[emp]) {
      try {
        const u = new URL(faces[emp], 'http://' + dev.ip);
        const buf = await hik(dev, 'GET', u.pathname + u.search, null, true);
        if (buf.length && buf.length <= 200000) photo = buf.toString('base64');
        else result = 'anh_qua_lon';
      } catch (e) {
        result = 'tai_anh_loi';
      }
    }
    if (!result) {
      try {
        const r = await fetch(`${base()}/api/public/attendance/facepush/${dev.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_no: emp, photo }), signal: AbortSignal.timeout(15000) });
        result = r.ok ? (await r.json()).data.result : 'demogym_loi_' + r.status;
      } catch (e) {
        result = 'demogym_loi';
      }
    }
    stat[result] = (stat[result] || 0) + 1;
    await sleep(250);
  }
  log(`${dev.name}: xong. Ket qua:`, JSON.stringify(stat));
}

async function test() {
  for (const dev of cfg.devices) {
    try {
      const info = await hik(dev, 'GET', '/ISAPI/System/deviceInfo');
      const name = /<deviceName>([^<]*)</.exec(info)?.[1];
      const model = /<model>([^<]*)</.exec(info)?.[1];
      log(`KET NOI TOT: ${dev.name} (${dev.ip}) ${name || ''} ${model || ''}`);
    } catch (e) {
      log(`LOI ${dev.name} (${dev.ip}): ${e.message}`);
    }
  }
}

function startPoll(dev) {
  const seen = new Set();
  const every = Math.max(Number(dev.intervalSec) || 1, 1) * 1000;
  let skew = null;
  let skewAt = 0;
  let off = '+07:00';
  let startWall = null;
  let busy = false;
  let pausedUntil = 0;
  const tick = async () => {
    if (busy || Date.now() < pausedUntil) return;
    if (serverPaused[dev.key]) { startWall = null; return; }
    busy = true;
    try {
      if (skew === null || Date.now() - skewAt > 5 * 60 * 1000) {
        const dn = await deviceNow(dev);
        skew = dn.wall - Date.now();
        skewAt = Date.now();
        off = dn.off;
      }
      const wallNow = Date.now() + skew;
      if (startWall === null) startWall = wallNow - 3000;
      const events = (await fetchEvents(dev, fmtWall(startWall, off), fmtWall(wallNow + 3600000, off))).filter((e) => e.employeeNoString);
      events.sort((a, b) => String(a.time).localeCompare(String(b.time)));
      for (const e of events) {
        const id = `${e.employeeNoString}|${e.time}|${e.serialNo || ''}`;
        const t = Date.parse(String(e.time).slice(0, 19) + 'Z');
        if (!seen.has(id)) {
          // gui loi thi nem ra: luot quet van nam trong cua so, lan hoi sau se gui lai (khong mat luot quet)
          await push(dev, String(e.employeeNoString).trim());
          seen.add(id);
          if (seen.size > 500) seen.delete(seen.values().next().value);
          log(`${dev.name}: quet ma ${e.employeeNoString} ${e.name || ''}`);
        }
        if (!Number.isNaN(t) && t - 2000 > startWall) startWall = t - 2000;
      }
    } catch (e) {
      log(`${dev.name}: ${e.message}`);
      if (e.auth) {
        pausedUntil = Date.now() + 10 * 60 * 1000;
        log(`${dev.name}: tam dung 10 phut de tranh khoa tai khoan may. Sua mat khau trong config.json roi chay lai.`);
      }
    } finally {
      busy = false;
    }
  };
  const ping = () => fetch(`${base()}/api/public/attendance/ping/${dev.key}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).then((j) => { serverPaused[dev.key] = !!j.paused; }).catch(() => {});
  ping();
  setInterval(ping, 20000);
  tick();
  setInterval(tick, every);
}

if (process.argv[2] === 'test') test();
else if (process.argv[2] === 'pull') (async () => { for (const d of cfg.devices) { try { await pull(d); } catch (e) { log(`${d.name}: ${e.message}`); } } })();
else {
  const mode = process.argv[2] || 'all';
  log(`Cau noi chay, che do: ${mode}. Thoat bang Ctrl+C.`);
  if (mode === 'all' || mode === 'scan') cfg.devices.forEach(startPoll);
  if (mode === 'all' || mode === 'jobs') cfg.devices.forEach(startJobs);
  if (mode === 'all' || mode === 'jobs' || mode === 'live') require('./live').startLive(cfg, log);
  if (mode === 'all' || mode === 'jobs' || mode === 'web') require('./web').startWeb(cfg, log);
}
