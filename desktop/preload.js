const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  hasConfig: () => ipcRenderer.invoke('has-config'),
  ask: (text, opts) => ipcRenderer.invoke('ask-jarvis', { text, speak: !(opts && opts.speak === false) }),
  weather: () => ipcRenderer.invoke('get-weather'),
  systemStats: () => ipcRenderer.invoke('get-system-stats'),
  transcribe: (base64Audio) => ipcRenderer.invoke('transcribe', base64Audio),
  notifyState: (state) => ipcRenderer.send('state-changed', state),
  getScreenSource: () => ipcRenderer.invoke('get-screen-source'),
  onSchoolModeChanged: (cb) => ipcRenderer.on('school-mode-changed', (event, isOn) => cb(isOn)),
  onPopupSelectedText: (cb) => ipcRenderer.on('popup-selected-text', (event, text) => cb(text)),
  launchApp: (name) => ipcRenderer.invoke('launch-app', name),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveRecording: (base64Data) => ipcRenderer.invoke('save-recording', base64Data),
  onStartRecording: (cb) => ipcRenderer.on('trigger-start-recording', cb),
  onStopRecording: (cb) => ipcRenderer.on('trigger-stop-recording', cb)
});
