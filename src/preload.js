const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appApi', Object.freeze({
  readJson: (p) => ipcRenderer.invoke('read-json', p),
  saveEbook: () => ipcRenderer.invoke('save-ebook'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveInterviewReport: (state) => ipcRenderer.invoke('save-interview-report', state),
  saveQuizReport: (state) => ipcRenderer.invoke('save-quiz-report', state),
  selectVrReport: () => ipcRenderer.invoke('select-vr-report'),
  saveDebriefingReport: (state) => ipcRenderer.invoke('save-debriefing-report', state),
  saveCertificate: (state) => ipcRenderer.invoke('save-certificate', state),
  callCimatec: (payload) => ipcRenderer.invoke('call-cimatec', payload),
  transcribeAudio: (payload) => ipcRenderer.invoke('transcribe-audio', payload),
  synthesizeSpeech: (payload) => ipcRenderer.invoke('synthesize-speech', payload)
}));
