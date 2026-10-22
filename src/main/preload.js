'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  chooseDataDir: (manualPath) => ipcRenderer.invoke('dir:choose', manualPath ? { path: manualPath } : {}),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  addTask: (p) => ipcRenderer.invoke('task:add', p),
  toggleTask: (p) => ipcRenderer.invoke('task:toggle', p),
  updateTask: (p) => ipcRenderer.invoke('task:update', p),
  deleteTask: (p) => ipcRenderer.invoke('task:delete', p),
  restoreTask: (p) => ipcRenderer.invoke('task:restore', p),
  reorderTasks: (p) => ipcRenderer.invoke('task:reorder', p),
  setReflection: (p) => ipcRenderer.invoke('day:reflection', p),
  carry: () => ipcRenderer.invoke('day:carry'),
  stats: () => ipcRenderer.invoke('stats:get'),

  exportMarkdown: () => ipcRenderer.invoke('export:markdown'),
  exportJson: () => ipcRenderer.invoke('export:json'),
  importJson: () => ipcRenderer.invoke('import:json'),

  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  overlayToggle: (id) => ipcRenderer.invoke('overlay:toggle', { id }),

  openQuickAdd: () => ipcRenderer.invoke('quickadd:open'),
  closeQuickAdd: () => ipcRenderer.invoke('quickadd:close'),
  quickCreate: (title) => ipcRenderer.invoke('quickadd:create', { title }),

  onData: (cb) => ipcRenderer.on('data:changed', (e, payload) => cb(payload))
});
