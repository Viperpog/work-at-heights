const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('microphoneApi', Object.freeze({
  transcribe: payload => ipcRenderer.invoke('diagnostic-transcribe', payload),
  save: payload => ipcRenderer.invoke('diagnostic-export', payload)
}));
