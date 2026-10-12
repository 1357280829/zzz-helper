// Launch the actual packaged executable with an isolated profile and inspect its renderer.
'use strict';
const fs = require('node:fs/promises'), path = require('node:path');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const version = require('../package.json').version;
const executable = process.argv[2];
if (!executable) throw Error('Usage: npm run test:package -- <native unpacked executable>');
const profile = path.resolve(__dirname, '../artifacts/package-ui-' + Date.now());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket, nextId = 0, startupLog = '';
const pending = new Map();
async function launch() {
  await fs.rm(path.join(profile, 'DevToolsActivePort'), {force: true});
  child = spawn(path.resolve(executable), ['--user-data-dir=' + profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], {stdio: ['ignore', 'pipe', 'pipe']});
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {startupLog = (startupLog + data).slice(-8000);});
  let spawnError;
  child.on('error', error => {spawnError = error;});
  let page;
  for (let i = 0; i < 480; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw Error('Packaged application exited: ' + child.exitCode);
    try {
      const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', {signal: AbortSignal.timeout(2000)});
      page = (await response.json()).find(item => item.type === 'page');
      if (page) break;
    } catch (_) {}
    await delay(250);
  }
  if (!page) throw Error('Packaged renderer did not start');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true});});
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data), entry = pending.get(result.id);
    if (!entry) return;
    pending.delete(result.id); clearTimeout(entry.timer);
    if (result.error) entry.reject(Error(result.error.message)); else entry.resolve(result.result);
  });
  for (let i = 0; i < 120; i++) {
    if (await evaluate(`document.querySelectorAll('.agent-card').length === 60 && document.getElementById('save-status').textContent === '已自动保存'`)) return;
    await delay(100);
  }
  throw Error('Packaged page did not initialize');
}
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {pending.delete(id); reject(Error('Timeout: ' + method));}, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw Error('Packaged renderer evaluation failed: ' + result.exceptionDetails.text);
  return result.result.value;
}
async function stop() {
  socket?.close();
  if (child && child.exitCode === null && child.pid) {
    const processToStop = child;
    const exited = new Promise(resolve => processToStop.once('exit', resolve));
    const force = setTimeout(() => {if (processToStop.exitCode === null) processToStop.kill('SIGKILL');}, 3000);
    processToStop.kill(); await exited; clearTimeout(force);
  }
}
(async () => {
  try {
    await fs.mkdir(profile, {recursive: true});
    await launch();
    assert.equal(await evaluate('document.querySelector(".edition small").textContent'), version);
    assert.equal(await evaluate('window.desktop.load().then(r => r.path)'), path.join(profile, 'records.json'));
    assert.equal(await evaluate('window.desktop.getMaximized()'), true);
    assert.equal(await evaluate('typeof window.desktop.accountQRStart'), 'function');
    assert.equal(await evaluate(`typeof window.desktop.import === 'undefined' && typeof window.desktop.export === 'undefined' && document.querySelectorAll('#import,#export,#import-file').length===0`), true);
    await evaluate(`document.querySelectorAll('.agent-portrait img').forEach(img => img.loading = 'eager')`);
    for (let i = 0; i < 100 && !await evaluate(`[...document.querySelectorAll('.agent-portrait img')].every(img => img.complete && img.naturalWidth > 0)`); i++) await delay(100);
    assert.equal(await evaluate(`[...document.querySelectorAll('.agent-portrait img')].every(img => img.complete && img.naturalWidth > 0)`), true);
    await evaluate(`document.querySelector('[data-detail="1151"]').click()`);
    assert.equal(await evaluate('document.querySelectorAll("[data-standard-preset]").length'), 9);
    await evaluate(`document.querySelector('[data-page="teams"]').click()`);
    assert.equal(await evaluate('document.querySelectorAll("#team-result-comparison th").length'), 2);
    assert.equal(await evaluate(`(() => {const M=window.AssistantModel,s=M.initialState();s.comparison.target='1141';s.comparison.targetPlanId='standard-21';s.comparison.teams=[[{id:'1341',type:'preset',planId:'standard-21'},{id:'1101',type:'preset',planId:'standard-21'}],[{id:'1341',type:'preset',planId:'standard-21'},{id:'1151',type:'preset',planId:'standard-21'}]];const r=M.compare(s),key='zhao.additional_cohesion_damage';return !r.rows[0].effects.rows.some(x=>x.key===key)&&r.rows[1].effects.rows.some(x=>x.key===key&&x.source==='额外能力：凝聚力'&&x.values.damage===36&&x.description.includes('处于任意[以太帷幕]中时'));})()`), true);
    await evaluate(`document.querySelector('[data-page="advice"]').click()`);
    assert.equal(await evaluate(`Object.keys(window.CharacterGuides.profiles).length`),60);
    assert.equal(await evaluate(`document.querySelector('.advice-cost-examples').textContent.includes('新增 1 金')&&window.AccountAdvice.cost('character',1).pulls===180&&window.AccountAdvice.cost('weapon',1).pulls===160`),true);
    assert.equal(await evaluate(`window.AssistantModel.initialState().version`),7);
    await evaluate(`document.querySelector('[data-page="catalog"]').click()`);
    const screenshot = await command('Page.captureScreenshot', {format: 'png'});
    await fs.writeFile(path.join(profile, 'packaged.png'), Buffer.from(screenshot.data, 'base64'));
    await evaluate(`(async () => {const {state} = await window.desktop.load(); state.sidebarCollapsed = true; await window.desktop.save(state);})()`);
    await stop();
    await launch();
    assert.equal(await evaluate('window.desktop.load().then(r => r.state.sidebarCollapsed)'), true);
    console.log('PASS packaged ' + version + ': startup, preload, 60 portraits, nine presets, guides and account planning, team comparison and save/restart');
    console.log('Screenshot: ' + path.join(profile, 'packaged.png'));
  } catch (error) {console.error(error); await fs.writeFile(path.join(profile, 'startup.log'), startupLog); console.error('Startup log: ' + path.join(profile, 'startup.log')); process.exitCode = 1;}
  finally {await stop();}
})();
