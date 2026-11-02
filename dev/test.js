/*
 * Browser tests for the theme, run against dev/mock.js (a fake LightDM).
 *
 *   python3 dev/build_demo.py
 *   python3 -m http.server 8765        # in the repo root, keep it running
 *   npm install playwright && npx playwright install chromium
 *   node dev/test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.ZQ_BASE || 'http://127.0.0.1:8765';
const URL = BASE + '/dev/preview.html?noreload=1';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const S = (p) => p.evaluate(() => ({ mode: __zhuque.st.mode, user: __zhuque.st.user && __zhuque.st.user.username,
  session: __zhuque.st.sessionKey, misuse: __mock.misuse.slice(), started: __mock.started, power: __mock.power.slice(),
  entry: document.getElementById('entry').value, console: document.getElementById('console').innerText,
  menu: document.getElementById('sysmenu').innerText }));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const bad = [];
  page.on('console', m => { if (m.type() === 'error' || /suppressed|MISUSE/.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', e => bad.push('pageerror: ' + e.message));

  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => /访问口令/.test(document.getElementById('console').innerText));
  const ready = Date.now() - t0;
  ok(ready < 1500, `prompt ready ${ready} ms after navigation`);
  let s = await S(page);
  ok(s.mode === 'password' && s.user === 'fox', 'opens straight on the password prompt for fox');
  ok(s.console.trim().split('\n').join(' | ') === '操作员：fox | 访问口令：', 'login area shows only operator + password: ' + JSON.stringify(s.console));
  ok(/会话：Xfce 桌面/.test(s.menu) && /重启/.test(s.menu) && /关机/.test(s.menu) && /挂起/.test(s.menu), 'session + power menu present');
  const extras = await page.evaluate(() => ['.scanlines', '.vignette', '.bar', '.attempts', '.help', '.row', '#boot', '.inv']
    .filter(sel => document.querySelector(sel)));
  ok(extras.length === 0, 'no leftover decorative elements: ' + JSON.stringify(extras));
  const anims = await page.evaluate(() => document.getAnimations().map(a => a.animationName || a.constructor.name));
  ok(anims.every(n => n === 'blink'), 'only running animation is the cursor blink: ' + JSON.stringify(anims));

  // wrong password, several times: plain message, never a lockout
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type('wrong' + i);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    if (i === 0) { s = await S(page); ok(s.mode === 'busy' && /验证中/.test(s.console), 'shows 验证中 while checking'); }
    await page.waitForTimeout(1000);
  }
  s = await S(page);
  ok(s.mode === 'password' && /访问被拒绝/.test(s.console), 'after 5 wrong passwords: plain 访问被拒绝, still accepting input');

  // user switching
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  s = await S(page);
  ok(s.mode === 'select' && !/访问被拒绝/.test(s.console), 'Esc opens operator list (message cleared, cancel echo ignored)');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  s = await S(page);
  ok(s.mode === 'password' && s.user === 'guest', 'picked guest');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s = await S(page);
  ok(s.mode === 'username', 'other user -> username prompt');
  await page.keyboard.type('root'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  s = await S(page);
  ok(s.mode === 'password' && s.user === 'root', 'manual user root');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  s = await S(page);
  ok(s.user === 'fox', 'back to fox');

  // session + power menu
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  s = await S(page);
  ok(s.mode === 'menu' && /默认 X 会话/.test(s.menu), 'Tab + Enter cycles the session');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  s = await S(page);
  ok(s.mode === 'confirm' && /确认关机/.test(s.console), 'shutdown asks to confirm');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  s = await S(page);
  ok(s.mode === 'password' && s.power.length === 0, 'Esc twice: back to prompt, nothing executed');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await S(page);
  ok(s.session === 'xfce', 'session back to xfce');

  // correct password: no artificial delay before start_session
  await page.keyboard.type('zhuque');
  const tEnter = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __mock.started !== null, null, { timeout: 5000 });
  const handoff = Date.now() - tEnter;   // mock PAM takes 900 ms by itself
  s = await S(page);
  ok(s.started === 'xfce' && handoff < 1300, `start_session("xfce") ${handoff} ms after Enter (900 ms is the fake PAM check)`);
  ok(/访问已授权/.test(s.console), 'shows 访问已授权');
  ok(s.misuse.length === 0, 'no API misuse');

  // type immediately after load
  await page.goto(URL);
  await page.waitForTimeout(120);
  await page.keyboard.type('zhuque', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __mock.started !== null, null, { timeout: 5000 });
  ok(true, 'typing straight away after load logs in');

  // secondary monitor page: clock only
  const p2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p2.on('console', m => { if (m.type() === 'error' || /suppressed|MISUSE/.test(m.text())) bad.push('secondary: ' + m.text()); });
  await p2.goto(BASE + '/dev/preview-secondary.html?noreload=1');
  await p2.waitForTimeout(400);
  const sec = await p2.evaluate(() => ({ text: Array.from(document.body.children).filter(el => el.id !== 'demo-note' && el.tagName !== 'SCRIPT').map(el => el.innerText).join('\n').trim(), calls: __mock.calls.length }));
  ok(/^\d\d:\d\d\n/.test(sec.text) && sec.calls === 0, 'secondary monitor: clock + date only, no login calls');

  ok(bad.length === 0, 'no console errors: ' + JSON.stringify(bad));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await browser.close();
})();
