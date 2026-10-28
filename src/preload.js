const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appApi', Object.freeze({
  readJson: (p) => ipcRenderer.invoke('read-json', p),
  saveEbook: () => ipcRenderer.invoke('save-ebook'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveInterviewReport: (state) => ipcRenderer.invoke('save-interview-report', state),
  saveQuizReport: (state) => ipcRenderer.invoke('save-quiz-report', state),
  selectVrReport: (context) => context === undefined ? ipcRenderer.invoke('select-vr-report') : ipcRenderer.invoke('select-vr-report', context),
  createSessionPlan: (input) => ipcRenderer.invoke('create-session-plan', input),
  saveSessionPlan: (plan) => ipcRenderer.invoke('save-session-plan', plan),
  vrBridgeConnect: (input) => ipcRenderer.invoke('vr-bridge-connect', input),
  vrBridgeStatus: () => ipcRenderer.invoke('vr-bridge-status'),
  vrBridgeTakeReports: () => ipcRenderer.invoke('vr-bridge-take-reports'),
  // Only the payload crosses the bridge, never the IPC event.
  onVrBridgeEvent: (callback) => { ipcRenderer.on('vr-bridge-event', (_event, payload) => callback(payload)); },
  saveDebriefingReport: (state) => ipcRenderer.invoke('save-debriefing-report', state),
  saveCertificate: (state) => ipcRenderer.invoke('save-certificate', state),
  callCimatec: (payload) => ipcRenderer.invoke('call-cimatec', payload),
  transcribeAudio: (payload) => ipcRenderer.invoke('transcribe-audio', payload),
  synthesizeSpeech: (payload) => ipcRenderer.invoke('synthesize-speech', payload)
}));
