// Show the real upgraded app and official verification page, without inspecting credentials.
const {app,BrowserWindow}=require('electron');require('../src/main.cjs');
app.whenReady().then(async()=>{const w=BrowserWindow.getAllWindows()[0];if(w.webContents.isLoading())await new Promise(r=>w.webContents.once('did-finish-load',r));
for(let i=0;i<100;i++){if(await w.webContents.executeJavaScript(`document.querySelectorAll('.agent-card').length===60`))break;await new Promise(r=>setTimeout(r,100));}
await w.webContents.executeJavaScript(`showPage('sync');loadRoles().then(ok=>{if(!ok&&document.getElementById('account-status').textContent.includes('验证'))window.desktop.accountLogin();});`);
console.log('UPGRADED_APP_READY');});
