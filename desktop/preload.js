const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  hasConfig: () => ipcRenderer.invoke('has-config'),
  ask: (text) => ipcRenderer.invoke('ask-jarvis', { text }),
  weather: () => ipcRenderer.invoke('get-weather'),
  systemStats: () => ipcRenderer.invoke('get-system-stats'),
  transcribe: (base64Audio) => ipcRenderer.invoke('transcribe', base64Audio),
  notifyState: (state) => ipcRenderer.send('state-changed', state),
  launchApp: (name) => ipcRenderer.invoke('launch-app', name),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveRecording: (base64Data) => ipcRenderer.invoke('save-recording', base64Data),
  onStartRecording: (cb) => ipcRenderer.on('trigger-start-recording', cb),
  onStopRecording: (cb) => ipcRenderer.on('trigger-stop-recording', cb)
});
