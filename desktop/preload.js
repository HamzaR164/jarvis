const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  hasConfig: () => ipcRenderer.invoke('has-config'),
  ask: (text) => ipcRenderer.invoke('ask-jarvis', { text }),
  weather: () => ipcRenderer.invoke('get-weather'),
  launchApp: (name) => ipcRenderer.invoke('launch-app', name),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
