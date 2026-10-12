// Real desktop lifecycle and save and automatic backup checks, using an isolated profile.
'use strict';
const {app, BrowserWindow, Menu} = require('electron');
const fs = require('node:fs/promises'), syncFs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict');
const profile = path.resolve(__dirname, '../artifacts/desktop-ui-' + Date.now());
syncFs.mkdirSync(profile, {recursive: true});
app.setPath('userData', profile);
require('../src/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(win) {
  for (let i = 0; i < 200; i++) {
    if (!win.webContents.isLoading() && win.isVisible() &&
      await win.webContents.executeJavaScript(`document.querySelectorAll('.agent-card').length === 60 && document.getElementById('save-status').textContent === '已自动保存'`)) return;
    await delay(50);
  }
  throw Error('Desktop did not become ready');
}
app.whenReady().then(async () => {
  try {
    let win = BrowserWindow.getAllWindows()[0];
    await ready(win);
    assert.equal(app.getPath('userData'), profile, 'explicit test profile is preserved');
    assert.equal(win.isFullScreen(), false);
    assert.equal(win.isMaximized(), true);
    assert.equal(win.webContents.getLastWebPreferences().sandbox, true);
    const run = source => win.webContents.executeJavaScript(source);
    const loaded = await run('window.desktop.load()');
    assert.equal(loaded.path, path.join(profile, 'records.json'));
    const state = loaded.state;
    state.sidebarCollapsed = true;
    await run(`window.desktop.save(${JSON.stringify(state)})`);
    assert.equal(JSON.parse(await fs.readFile(path.join(profile, 'records.json'))).sidebarCollapsed, true);
    assert.equal(JSON.parse(await fs.readFile(path.join(profile, 'records.json.bak'))).version, 7);
    assert.equal(await run(`typeof window.desktop.import === 'undefined' && typeof window.desktop.export === 'undefined'`), true);
    assert.equal(await run(`document.querySelectorAll('#import,#export,#import-file').length`), 0);
    console.log('PASS isolated profile, v7 save, automatic backup and removed manual import/export');
    await run('window.desktop.toggleMaximized()');
    assert.equal(win.isMaximized(), false);
    await run('window.desktop.toggleMaximized()');
    assert.equal(win.isMaximized(), true);
    console.log('PASS native default maximize, restore and maximize without fullscreen');
    if (process.platform === 'darwin') {
      const menu = Menu.getApplicationMenu();
      const roles = menu.items.flatMap(item => item.submenu?.items.map(x => x.role) || []);
      for (const role of ['quit', 'copy', 'paste', 'selectall']) assert.ok(roles.includes(role), role);
      const closed = new Promise(resolve => win.once('closed', resolve));
      win.close();
      await closed;
      assert.equal(BrowserWindow.getAllWindows().length, 0);
      app.emit('activate');
      win = BrowserWindow.getAllWindows()[0];
      await ready(win);
      assert.equal(await run('window.desktop.load().then(r => r.state.sidebarCollapsed)'), true);
      assert.equal(win.isMaximized(), true);
      // Recreating a window must not register duplicate IPC handlers.
      assert.equal(await run(`window.desktop.save(${JSON.stringify(state)})`), true);
      console.log('PASS macOS edit/quit menu, close and Dock reopen with records and IPC preserved');
    }
    await fs.writeFile(path.join(profile, 'desktop.png'), (await win.webContents.capturePage()).toPNG());
    console.log('ALL DESKTOP CHECKS PASSED');
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
