'use strict';
// Cau noi may cham cong Hikvision <-> DemoGym. Doc luot quet (poll). Chi ghi len may khi le tan bam 'Gui khuon mat len may' (them nguoi va anh), khong xoa gi, khong doi cau hinh.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const noAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const log = (...a) => console.log(new Date().toLocaleTimeString('vi-VN'), ...a);

function parseChallenge(h) {
  const o = {};
  for (const m of String(h || '').matchAll(/(\w+)="?([^",]*)"?/g)) o[m[1]] = m[2];
  return o;
}

async function hik(dev, method, uri, body) {
  const url = `http://${dev.ip}${uri}`;
  const form = typeof body === 'function';
  const init = (auth) => ({
    method,
    headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}) },
    body: form ? body() : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let r = await fetch(url, init());
  if (r.status === 401) {
    const c = parseChallenge(r.headers.get('www-authenticate'));
    const cnonce = crypto.randomBytes(8).toString('hex');
    const nc = '00000001';
    const ha1 = md5(`${dev.user}:${c.realm}:${dev.pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const resp = c.qop ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:auth:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`);
    const auth = `Digest username="${dev.user}", realm="${c.realm}", nonce="${c.nonce}", uri="${uri}", response="${resp}"${c.qop ? `, qop=auth, nc=${nc}, cnonce="${cnonce}"` : ''}${c.opaque ? `, opaque="${c.opaque}"` : ''}`;
    r = await fetch(url, init(auth));
  }
  const text = await r.text();
  if (r.status === 401) throw Object.assign(new Error('Sai tai khoan hoac mat khau may cham cong'), { auth: true });
  if (!r.ok) throw new Error(`May tra ve ${r.status}: ${text.slice(0, 160)}`);
  return text;
}

async function deviceNow(dev) {
  const t = await hik(dev, 'GET', '/ISAPI/System/time');
  const lt = /<localTime>([^<]+)</.exec(t)?.[1];
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)([+-]\d\d:\d\d)?/.exec(lt || '');
  if (!m) throw new Error('Khong doc duoc gio may');
  const off = m[2] || '+07:00';
  return { wall: Date.parse(m[1] + 'Z'), off };
}

const fmtWall = (ms, off) => new Date(ms).toISOString().slice(0, 19) + off;

async function fetchEvents(dev, start, end) {
  const cond = { searchID: String(Date.now()), searchResultPosition: 0, maxResults: 30, major: 5, minor: 0, startTime: start, endTime: end };
  const t = await hik(dev, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { AcsEventCond: cond });
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

function startJobs(dev) {
  let busy = false;
  let pausedUntil = 0;
  setInterval(async () => {
    if (busy || Date.now() < pausedUntil) return;
    busy = true;
    try {
      const r = await fetch(`${base()}/api/public/attendance/jobs/${dev.key}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`DemoGym tra ve ${r.status}`);
      for (const job of (await r.json()).data) {
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
  }, 6000);
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
  const every = Math.max(Number(dev.intervalSec) || 3, 3) * 1000;
  let start = null;
  let pausedUntil = 0;
  const tick = async () => {
    if (Date.now() < pausedUntil) return;
    try {
      const dn = await deviceNow(dev);
      if (start === null) start = fmtWall(dn.wall - 5000, dn.off);
      const events = (await fetchEvents(dev, start, fmtWall(dn.wall + 3600000, dn.off))).filter((e) => e.employeeNoString);
      for (const e of events.sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
        const id = `${e.employeeNoString}|${e.time}|${e.serialNo || ''}`;
        if (seen.has(id)) continue;
        seen.add(id);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        await push(dev, String(e.employeeNoString).trim());
        log(`${dev.name}: quet ma ${e.employeeNoString} ${e.name || ''}`);
      }
    } catch (e) {
      log(`${dev.name}: ${e.message}`);
      if (e.auth) {
        pausedUntil = Date.now() + 10 * 60 * 1000;
        log(`${dev.name}: tam dung 10 phut de tranh khoa tai khoan may. Sua mat khau trong config.json roi chay lai.`);
      }
    }
  };
  tick();
  setInterval(tick, every);
}

if (process.argv[2] === 'test') test();
else {
  log('Cau noi chay (chi doc). Thoat bang Ctrl+C.');
  cfg.devices.forEach(startPoll);
  cfg.devices.forEach(startJobs);
}
