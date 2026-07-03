'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aif', {
  ready: () => ipcRenderer.send('renderer-ready'),
  on: (cb) => ipcRenderer.on('aif', (_e, msg) => cb(msg)),
  stats: () => ipcRenderer.invoke('stats'),
});
