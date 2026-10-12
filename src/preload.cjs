const { contextBridge, ipcRenderer } = require('electron');
async function invokeAccount(channel,...args){
  const result=await ipcRenderer.invoke(channel,...args);
  if(!result.ok)throw new Error(result.error);
  return result.value;
}
contextBridge.exposeInMainWorld('desktop', {
  accountLogin: () => ipcRenderer.invoke('account:login'),
  accountQRStart: () => invokeAccount('account:qr-start'),
  accountQRPoll: () => invokeAccount('account:qr-poll'),
  accountQRCancel: () => ipcRenderer.invoke('account:qr-cancel'),
  accountRoles: () => invokeAccount('account:roles'),
  accountSync: (uid,server) => invokeAccount('account:sync',uid,server),
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  onAccountProgress: callback => ipcRenderer.on('account:progress', (_, value) => callback(value)),
  onAccountLoginResult: callback => ipcRenderer.on('account:login-result', (_, value) => callback(value)),
  getMaximized: () => ipcRenderer.invoke('window:maximized'),
  toggleMaximized: () => ipcRenderer.invoke('window:toggle-maximized'),
  onMaximizedChange: callback => ipcRenderer.on('window:maximized-changed', (_, value) => callback(value)),
  load: () => ipcRenderer.invoke('records:load'),
  save: state => ipcRenderer.invoke('records:save', state),
  folder: () => ipcRenderer.invoke('records:folder'),
  source: url => ipcRenderer.invoke('source:open', url)
});
