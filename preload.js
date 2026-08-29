'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anySwitch', {
  presets: () => ipcRenderer.invoke('presets:list'),
  getState: () => ipcRenderer.invoke('state:get'),
  saveProvider: (p) => ipcRenderer.invoke('provider:save', p),
  deleteProvider: (id) => ipcRenderer.invoke('provider:delete', id),
  duplicateProvider: (id) => ipcRenderer.invoke('provider:duplicate', id),
  importDetected: () => ipcRenderer.invoke('provider:importDetected'),
  setActive: (providerId, model, sync = true) =>
    ipcRenderer.invoke('provider:setActive', { providerId, model, sync }),
  sync: () => ipcRenderer.invoke('sync:run'),
  testConnection: (id) => ipcRenderer.invoke('test:connection', id),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (file) => ipcRenderer.invoke('backup:restore', file),
  openConfigDir: () => ipcRenderer.invoke('config:open'),
  setCodexHome: (path) => ipcRenderer.invoke('settings:setCodexHome', path),
  setForceApiKey: (val) => ipcRenderer.invoke('settings:setForceApiKey', val),
  setMergeCatalog: (val) => ipcRenderer.invoke('settings:setMergeCatalog', val),
  version: () => ipcRenderer.invoke('app:version')
});
