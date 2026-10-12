const { app, BrowserWindow, ipcMain, shell, session, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateState } = require('./model.js');
let win;
let writeQueue = Promise.resolve();
let startupError = '';
let loginWindow, accountService, loginSession, qrService;
const {createAccountService,LOGIN}=require('./account.cjs');
const {createQRService}=require('./account-auth.cjs');
const dataPath = () => path.join(app.getPath('userData'), 'records.json');
async function readRecords() {
  try { return validateState(JSON.parse(await fs.readFile(dataPath(), 'utf8'))); }
  catch (e) {
    if (e.code !== 'ENOENT') {
      try { await fs.copyFile(dataPath(), dataPath() + '.corrupt-' + Date.now()); } catch (_) {}
      startupError = '原存档无法读取，已保留原文件。请使用“导入”恢复备份。' + e.message;
    }
    return null;
  }
}
async function atomicWrite(file, data) {
  const temp = file + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, file);
}
function setupIPC() {
  loginSession=session.fromPartition('persist:miyoushe-account');
  accountService=createAccountService(loginSession,p=>{if(win&&!win.isDestroyed())win.webContents.send('account:progress',p);});
  qrService=createQRService(loginSession,url=>require('qrcode').toDataURL(url,{width:280,margin:2,errorCorrectionLevel:'M'}));
  let webLoginTimer;
  loginSession.cookies.on('changed',(_event,cookie,_cause,removed)=>{
    if(removed||!loginWindow||loginWindow.isDestroyed()||!require('./account-auth.cjs').COOKIE_NAMES.has(cookie.name))return;
    clearTimeout(webLoginTimer);
    webLoginTimer=setTimeout(async()=>{
      if(!loginWindow||loginWindow.isDestroyed())return;
      const result=await accountResult(async()=>{
        const {hasLoginCookies}=require('./account-auth.cjs');
        const available=await loginSession.cookies.get({});
        if(!hasLoginCookies(available))return null;
        return accountService.roles();
      });
      if(result.ok&&result.value===null)return;
      if(win&&!win.isDestroyed())win.webContents.send('account:login-result',result);
    },800);
  });
  ipcMain.handle('account:login', () => {
    if(loginWindow&&!loginWindow.isDestroyed()){loginWindow.show();loginWindow.focus();return true;}
    loginWindow=new BrowserWindow({width:1080,height:820,title:'米游社 · 登录后返回助手同步',autoHideMenuBar:true,
      webPreferences:{partition:'persist:miyoushe-account',contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&/(^|\.)(mihoyo|miyoushe)\.com$/.test(u.hostname);}catch(_){return false;}};
    function secureLoginWindow(child){
      child.webContents.setWindowOpenHandler(({url})=>allowed(url)?{action:'allow',overrideBrowserWindowOptions:{autoHideMenuBar:true,
        webPreferences:{partition:'persist:miyoushe-account',contextIsolation:true,nodeIntegration:false,sandbox:true,preload:undefined}}}:{action:'deny'});
      child.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});
      child.webContents.on('did-create-window',popup=>secureLoginWindow(popup));
    }
    secureLoginWindow(loginWindow);
    loginWindow.loadURL(LOGIN).catch(()=>{});return true;
  });
  // Pass only the intended message across IPC, without Electron's remote-method prefix.
  async function accountResult(action){
    try{return {ok:true,value:await action()};}catch(e){return {ok:false,error:e.message};}
  }
  ipcMain.handle('account:roles', () => accountResult(()=>accountService.roles()));
  ipcMain.handle('account:qr-start', () => accountResult(()=>qrService.start()));
  ipcMain.handle('account:qr-poll', () => accountResult(()=>qrService.poll()));
  ipcMain.handle('account:qr-cancel', () => qrService.cancel());
  ipcMain.handle('account:sync', (_,uid,server) => accountResult(()=>accountService.sync(uid,server)));
  ipcMain.handle('account:logout', async () => {
    await qrService.cancel();
    if(loginWindow&&!loginWindow.isDestroyed())loginWindow.close();
    await loginSession.clearStorageData();await loginSession.clearCache();return true;
  });
  ipcMain.handle('window:maximized', () => win.isMaximized());
  ipcMain.handle('window:toggle-maximized', () => {
    const next = !win.isMaximized(); if(next)win.maximize();else win.unmaximize();return next;
  });
  ipcMain.handle('records:load', async () => ({ state: await readRecords(), error: startupError, path: dataPath() }));
  ipcMain.handle('records:save', async (_, input) => {
    const data = validateState(input);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      // Preserve the previous version before replacing it, including a damaged file.
      try { await fs.copyFile(dataPath(), dataPath() + '.bak'); } catch(e) { if (e.code !== 'ENOENT') throw e; }
      await atomicWrite(dataPath(), data);
    });
    await writeQueue;
    return true;
  });
  ipcMain.handle('records:folder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('source:open', (_, url) => {
    const allowed = [
      'https://github.com/BanresDev/zzzcalc/blob/main/src/lib/Calculations.ts',
      'https://github.com/BanresDev/zzzcalc/blob/main/src/components/DamageCalculator.tsx'
    ];
    if (allowed.includes(url) || /^https:\/\/(zzz\.nanoka\.cc|static\.nanoka\.cc|github\.com)\//.test(url)) return shell.openExternal(url);
  });
}
// Keep the existing records directory when changing the displayed application name.
// Respect an explicitly configured path, including the isolated integration profile.
if (app.getPath('userData') === path.join(app.getPath('appData'), app.getName()))
  app.setPath('userData', path.join(app.getPath('appData'), 'ZZZ Buff Studio'));
app.setName('绝区零·助手');
// This app has no GPU-heavy content. Software rendering also supports older Windows GPUs.
app.disableHardwareAcceleration();
function createWindow() {
  win = new BrowserWindow({ width: 1480, height: 960, minWidth: 1060, minHeight: 740, backgroundColor: '#111315',
    title: '绝区零·助手', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'app-icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['maximize', 'unmaximize'])
    win.on(event, () => win.webContents.send('window:maximized-changed', win.isMaximized()));
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => {
    win = null;
    if(loginWindow&&!loginWindow.isDestroyed())loginWindow.close();
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
function setupMenu() {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ] },
    { label: '显示', submenu: [
      { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' }
    ] },
    { role: 'windowMenu' }
  ]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!win) { if (app.isReady()) createWindow(); return; }
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.whenReady().then(() => {
    setupIPC();
    setupMenu();
    createWindow();
  });
  app.on('activate', () => { if (app.isReady() && !win) createWindow(); });
  let quitting = false;
  app.on('before-quit', e => {
    if (!quitting) { e.preventDefault(); quitting = true; writeQueue.catch(() => {}).finally(() => app.quit()); }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
