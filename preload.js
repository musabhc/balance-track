const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  dataLoad: () => ipcRenderer.invoke('data:load'),
  dataSave: (payload) => ipcRenderer.invoke('data:save', payload),
  dataExport: (payload) => ipcRenderer.invoke('data:export', payload),
  dataImport: () => ipcRenderer.invoke('data:import'),
  appVersion: () => ipcRenderer.invoke('app:getVersion'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  confirm: (message, title) => ipcRenderer.invoke('app:confirm', { message, title }),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update:status', (_, message) => callback(message));
  }
});
