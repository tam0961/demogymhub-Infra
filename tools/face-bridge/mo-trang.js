'use strict';
// Mo trang DemoGym (dia chi `server` trong config.json) bang trinh duyet mac dinh.
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, ''));
console.log('Mo', cfg.server);
exec(`start "" "${cfg.server}"`);
