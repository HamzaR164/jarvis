const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  hasConfig: () => ipcRenderer.invoke('has-config'),
  ask: (text, opts) => ipcRenderer.invoke('ask-jarvis', { text, speak: !!(opts && opts.speak) }),
  weather: () => ipcRenderer.invoke('get-weather'),
  launchApp: (name) => ipcRenderer.invoke('launch-app', name),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
